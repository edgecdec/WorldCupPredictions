/**
 * Knockout-lock migration script.
 *
 * For every prediction row owned by a user whose account existed before the
 * knockout lock, produces an updated knockout_picks map that:
 *   1. Resolves every slot token (e.g. 'R32-3-A') to the actual team name
 *      that ended up in that slot, using the finalized groupStage.
 *   2. Smart-fills any matches the user didn't pick (using the same
 *      probabilistic Poisson model the in-browser Smart Fill uses).
 *
 * Users registered AFTER lock_time_knockout are skipped — they never saw
 * the picker, so we don't invent a bracket for them.
 *
 * The final saved values are team names (what scoring.ts expects), so
 * after this runs every saved bracket scores correctly.
 *
 * Deterministic two-step flow:
 *   1. Compute (dry-run): builds the plan, writes it to
 *      <db>.migration-plan.json, prints a per-user summary. No DB writes.
 *   2. Apply: reads the plan back and applies it verbatim. Same plan
 *      produces the same DB state — no re-rolling random fills.
 *
 * Usage:
 *   npx tsx scripts/knockoutLockMigration.ts --db <path>            # dry-run, writes plan
 *   npx tsx scripts/knockoutLockMigration.ts --db <path> --apply    # applies the plan
 *   npx tsx scripts/knockoutLockMigration.ts --db <path> --sql      # emit SQL UPDATEs to stdout
 */

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { generateKnockoutBracket, getFeederMatchupIds } from '@/lib/knockoutBracket';
import { computeMatchOdds } from '@/lib/matchOdds';
import { parseBracketData } from '@/lib/bracketData';
import type { BracketData, GroupStageResults, KnockoutMatchup } from '@/types';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const emitSql = args.includes('--sql');
const dbPathArg = (() => {
  const idx = args.indexOf('--db');
  if (idx === -1) return 'data/worldcup.db';
  return args[idx + 1];
})();

const dbPath = path.resolve(process.cwd(), dbPathArg);
if (!fs.existsSync(dbPath)) {
  console.error(`DB not found: ${dbPath}`);
  process.exit(1);
}
const planPath = `${dbPath}.migration-plan.json`;

const MATCH_ORDER: string[] = [
  ...Array.from({ length: 16 }, (_, i) => `R32-${i + 1}`),
  ...Array.from({ length: 8 }, (_, i) => `R16-${i + 1}`),
  ...Array.from({ length: 4 }, (_, i) => `QF-${i + 1}`),
  'SF-1', 'SF-2',
  'FINAL', '3RD',
];

// Deterministic PRNG (mulberry32) seeded from username + match id so the
// same user's same match always rolls the same number across dry-run/apply.
function seededRandom(seed: string): () => number {
  const h = crypto.createHash('sha256').update(seed).digest();
  let s = h.readUInt32BE(0);
  return () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function resolveTokenToTeam(
  stored: string,
  bracket: KnockoutMatchup[],
): string | null {
  if (!stored.startsWith('R32-')) return stored;  // already a team name
  const m = stored.match(/^R32-(\d+)-([AB])$/);
  if (!m) return null;
  const r32Match = bracket.find((x) => x.id === `R32-${m[1]}`);
  if (!r32Match) return null;
  return m[2] === 'A' ? (r32Match.teamA ?? null) : (r32Match.teamB ?? null);
}

function smartPickWinner(teamA: string, teamB: string, rng: () => number): string {
  const odds = computeMatchOdds(teamA, teamB, { stage: 'knockout' });
  let pA = 0.5;
  if (odds) {
    const draw = odds.draw ?? 0;
    pA = (odds.winA ?? 0) + draw / 2;
  }
  return rng() < pA ? teamA : teamB;
}

function candidatesForMatch(
  matchId: string,
  resolvedPicks: Record<string, string>,
  bracket: KnockoutMatchup[],
): { teamA: string | null; teamB: string | null } {
  if (matchId.startsWith('R32-')) {
    const m = bracket.find((x) => x.id === matchId);
    return { teamA: m?.teamA ?? null, teamB: m?.teamB ?? null };
  }
  if (matchId === '3RD') {
    const loserOf = (sf: string): string | null => {
      const sfWinner = resolvedPicks[sf];
      if (!sfWinner) return null;
      const feeders = getFeederMatchupIds(sf);
      if (!feeders) return null;
      const candA = resolvedPicks[feeders[0]];
      const candB = resolvedPicks[feeders[1]];
      if (candA && candA !== sfWinner) return candA;
      if (candB && candB !== sfWinner) return candB;
      return null;
    };
    return { teamA: loserOf('SF-1'), teamB: loserOf('SF-2') };
  }
  const feeders = getFeederMatchupIds(matchId);
  if (!feeders) return { teamA: null, teamB: null };
  return { teamA: resolvedPicks[feeders[0]] ?? null, teamB: resolvedPicks[feeders[1]] ?? null };
}

interface UserSummary {
  username: string;
  before: { total: number; tokens: number; teams: number };
  after: { total: number };
  filled: string[];
  resolved: string[];
  unresolvable: string[];
  skipped?: 'post-lock';
}

function migrateUserPicks(
  username: string,
  rawPicks: Record<string, string>,
  bracket: KnockoutMatchup[],
): { newPicks: Record<string, string>; summary: UserSummary } {
  const newPicks: Record<string, string> = {};
  const summary: UserSummary = {
    username,
    before: {
      total: Object.keys(rawPicks).length,
      tokens: Object.values(rawPicks).filter((v) => /^R32-\d+-[AB]$/.test(v)).length,
      teams: Object.values(rawPicks).filter((v) => !/^R32-\d+-[AB]$/.test(v)).length,
    },
    after: { total: 0 },
    filled: [], resolved: [], unresolvable: [],
  };

  for (const matchId of MATCH_ORDER) {
    const stored = rawPicks[matchId];
    if (stored) {
      const team = resolveTokenToTeam(stored, bracket);
      if (team) {
        newPicks[matchId] = team;
        if (stored !== team) summary.resolved.push(matchId);
        continue;
      }
      summary.unresolvable.push(matchId);
    }
    const { teamA, teamB } = candidatesForMatch(matchId, newPicks, bracket);
    if (!teamA && !teamB) continue;
    const rng = seededRandom(`${username}::${matchId}`);
    if (!teamA) { newPicks[matchId] = teamB!; summary.filled.push(matchId); continue; }
    if (!teamB) { newPicks[matchId] = teamA; summary.filled.push(matchId); continue; }
    newPicks[matchId] = smartPickWinner(teamA, teamB, rng);
    summary.filled.push(matchId);
  }

  summary.after.total = Object.keys(newPicks).length;
  return { newPicks, summary };
}

// ──────────────────────────────────────────────────────────────────────────

interface TournamentRow {
  id: string;
  bracket_data: string;
  results_data: string;
  lock_time_knockout: string | null;
}
interface PredRow {
  prediction_id: string;
  username: string;
  user_created_at: string;
  knockout_picks: string;
}
interface PlanEntry {
  prediction_id: string;
  username: string;
  newJson: string;
  summary: UserSummary;
}

if (apply) {
  // Apply mode: read plan file, write to DB. No recomputation.
  if (!fs.existsSync(planPath)) {
    console.error(`Plan file not found: ${planPath}`);
    console.error('Run without --apply first to generate the plan.');
    process.exit(1);
  }
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf-8')) as PlanEntry[];

  const backupPath = `${dbPath}.backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(dbPath, backupPath);
  console.log(`Backed up DB to ${backupPath}`);

  const db = new Database(dbPath, { readonly: false });
  const tx = db.transaction(() => {
    const upd = db.prepare('UPDATE predictions SET knockout_picks = ? WHERE id = ?');
    for (const p of plan) upd.run(p.newJson, p.prediction_id);
  });
  tx();
  console.log(`Wrote ${plan.length} prediction rows from plan.`);
  console.log('Done.');
  process.exit(0);
}

// ── compute/dry-run mode ──────────────────────────────────────────────────
const db = new Database(dbPath, { readonly: true });

const tournament = db
  .prepare('SELECT id, bracket_data, results_data, lock_time_knockout FROM tournaments ORDER BY year DESC LIMIT 1')
  .get() as TournamentRow | undefined;
if (!tournament) { console.error('No tournament found.'); process.exit(1); }

const bracketData: BracketData = parseBracketData(tournament.bracket_data);
const resultsData = JSON.parse(tournament.results_data) as { groupStage?: GroupStageResults };
const groupStage = resultsData.groupStage;
if (!groupStage || groupStage.groupResults.length !== 12 || (groupStage.advancingThirdPlace?.length ?? 0) !== 8) {
  console.error('groupStage is not fully finalized — abort.');
  process.exit(1);
}
const lockKO = tournament.lock_time_knockout ? new Date(tournament.lock_time_knockout) : null;
if (!lockKO) {
  console.error('lock_time_knockout not set on tournament — abort.');
  process.exit(1);
}
console.log(`Knockout lock: ${lockKO.toISOString()}`);

const bracket = generateKnockoutBracket(groupStage, bracketData);
console.log(`Generated bracket with ${bracket.length} matches.`);
console.log();

console.log('R32 slot → team mapping:');
for (let i = 1; i <= 16; i++) {
  const m = bracket.find((x) => x.id === `R32-${i}`)!;
  console.log(`  R32-${i}: ${m.teamA} vs ${m.teamB}`);
}
console.log();

const preds = db.prepare(`
  SELECT p.id AS prediction_id, u.username, u.created_at AS user_created_at, p.knockout_picks
  FROM predictions p
  JOIN users u ON u.id = p.user_id AND u.is_hidden = 0
  WHERE p.tournament_id = ?
`).all(tournament.id) as PredRow[];

console.log(`Loaded ${preds.length} predictions.`);
console.log();

const plan: PlanEntry[] = [];
const skipped: UserSummary[] = [];

for (const pred of preds) {
  // Skip users who registered AFTER lock — we don't invent brackets for them.
  // SQLite stores user_created_at as 'YYYY-MM-DD HH:MM:SS' (UTC, no Z).
  const userCreated = new Date(pred.user_created_at + 'Z');
  if (userCreated > lockKO) {
    skipped.push({
      username: pred.username,
      before: { total: 0, tokens: 0, teams: 0 },
      after: { total: 0 },
      filled: [], resolved: [], unresolvable: [],
      skipped: 'post-lock',
    });
    continue;
  }

  let rawPicks: Record<string, string> = {};
  try { rawPicks = JSON.parse(pred.knockout_picks || '{}'); } catch { /* keep empty */ }
  const { newPicks, summary } = migrateUserPicks(pred.username, rawPicks, bracket);
  plan.push({ prediction_id: pred.prediction_id, username: pred.username, newJson: JSON.stringify(newPicks), summary });
}

console.log('Per-user plan:');
console.log('─'.repeat(90));
for (const p of plan) {
  const s = p.summary;
  const flag = s.unresolvable.length > 0 ? '⚠ ' : '   ';
  console.log(`${flag}${s.username.padEnd(28)} before=${s.before.total}/32 (tok=${s.before.tokens} team=${s.before.teams})  →  after=${s.after.total}/32  resolved=${s.resolved.length} filled=${s.filled.length}${s.unresolvable.length ? ` UNRESOLVED=${s.unresolvable.length}` : ''}`);
}
if (skipped.length) {
  console.log();
  console.log('Skipped (registered after knockout lock):');
  for (const s of skipped) console.log(`   ${s.username}`);
}
console.log();

const everyoneNow32 = plan.filter((p) => p.summary.after.total === 32).length;
const anyUnresolved = plan.filter((p) => p.summary.unresolvable.length > 0);
console.log('Aggregate:');
console.log(`  predictions to update: ${plan.length}`);
console.log(`  skipped (post-lock registration): ${skipped.length}`);
console.log(`  brackets fully populated after migration: ${everyoneNow32}`);
console.log(`  rows with unresolvable tokens: ${anyUnresolved.length}`);
if (anyUnresolved.length) {
  for (const p of anyUnresolved) console.log(`    ${p.username}: unresolved = ${p.summary.unresolvable.join(', ')}`);
}

if (emitSql) {
  console.log();
  console.log('-- SQL UPDATE statements (review before running):');
  for (const p of plan) {
    const escaped = p.newJson.replace(/'/g, "''");
    console.log(`UPDATE predictions SET knockout_picks = '${escaped}' WHERE id = '${p.prediction_id}'; -- ${p.username}`);
  }
}

fs.writeFileSync(planPath, JSON.stringify(plan, null, 2));
console.log();
console.log(`Plan written to: ${planPath}`);
console.log('Re-run with --apply to commit the plan.');
