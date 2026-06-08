import { BracketData, LiveGame } from '@/types';
import { getTeamByEspnId } from '@/lib/bracketData';

const SCOREBOARD_URL =
  'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';
const STANDINGS_URL =
  'https://site.api.espn.com/apis/v2/sports/soccer/fifa.world/standings';

/** A completed (post-state) match from ESPN, mapped to our team names. */
export interface CompletedMatch {
  espnId: string;
  date: string;
  teamA: string;
  teamB: string;
  scoreA: number;
  scoreB: number;
  winner: string | null; // null if drawn (group stage); name if not
  isGroup: boolean;
  groupName?: string;
  /** Match round in knockouts: 'R32', 'R16', 'QF', 'SF', '3RD', 'FINAL' */
  knockoutRound?: string;
}

export interface GroupStanding {
  team: string;
  espnId: number;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  goalDifference: number;
  goalsFor: number;
  gamesPlayed: number;
}

export interface GroupTable {
  groupName: string;
  standings: GroupStanding[];
}

function resolveTeamName(
  espnId: number,
  fallbackName: string,
  bracketData: BracketData,
): string {
  const team = getTeamByEspnId(bracketData, espnId);
  return team ? team.name : fallbackName;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function parseCompetitor(c: any): { espnId: number; name: string; score: string; logo: string } {
  return {
    espnId: parseInt(c.id ?? '0', 10),
    name: c.team?.displayName ?? c.team?.name ?? 'TBD',
    score: c.score ?? '0',
    logo: c.team?.logo ?? '',
  };
}

function detectStageFromHeadline(headline: string): 'group' | 'knockout' | undefined {
  const h = headline.toLowerCase();
  if (/group\s+[a-l]/i.test(h)) return 'group';
  if (h.includes('round of 32') || h.includes('r32')) return 'knockout';
  if (h.includes('round of 16') || h.includes('r16')) return 'knockout';
  if (h.includes('quarter')) return 'knockout';
  if (h.includes('semi')) return 'knockout';
  if (h.includes('third') || h.includes('3rd')) return 'knockout';
  if (h.includes('final')) return 'knockout';
  return undefined;
}

export async function fetchLiveScores(bracketData: BracketData): Promise<LiveGame[]> {
  const res = await fetch(SCOREBOARD_URL, { next: { revalidate: 30 } });
  if (!res.ok) return [];
  const data = await res.json();
  const events: any[] = data.events ?? [];

  return events.map((event: any) => {
    const competition = event.competitions?.[0];
    const status = competition?.status ?? event.status ?? {};
    const competitors = competition?.competitors ?? [];

    const home = competitors.find((c: any) => c.homeAway === 'home') ?? competitors[0];
    const away = competitors.find((c: any) => c.homeAway === 'away') ?? competitors[1];

    const homeParsed = parseCompetitor(home ?? {});
    const awayParsed = parseCompetitor(away ?? {});

    const headline = (competition?.notes?.[0]?.headline ?? '') + ' ' + (competition?.type?.text ?? '');
    const seasonSlug: string = event.season?.slug ?? '';
    const stage = detectStageFromHeadline(headline)
      ?? (seasonSlug.includes('group') ? 'group' : seasonSlug ? 'knockout' : undefined);

    return {
      id: String(event.id ?? ''),
      name: event.name ?? '',
      status: status.type?.description ?? '',
      detail: status.type?.detail ?? status.detail ?? '',
      state: status.type?.state ?? '',
      clock: status.displayClock ?? '',
      period: status.period ?? 0,
      home: {
        name: resolveTeamName(homeParsed.espnId, homeParsed.name, bracketData),
        score: homeParsed.score,
        logo: homeParsed.logo,
      },
      away: {
        name: resolveTeamName(awayParsed.espnId, awayParsed.name, bracketData),
        score: awayParsed.score,
        logo: awayParsed.logo,
      },
      stage,
    };
  });
}

function parseStat(stats: any[], name: string): number {
  const stat = stats?.find((s: any) => s.name === name || s.abbreviation === name);
  return stat ? parseInt(stat.value ?? '0', 10) : 0;
}

export async function fetchGroupStandings(
  bracketData: BracketData,
): Promise<GroupTable[]> {
  const res = await fetch(STANDINGS_URL, { next: { revalidate: 60 } });
  if (!res.ok) return [];
  const data = await res.json();
  const children: any[] = data.children ?? [];

  return children.map((child: any) => {
    const groupName = (child.name ?? child.abbreviation ?? '').replace('Group ', '');
    const entries: any[] = child.standings?.entries ?? [];

    const standings: GroupStanding[] = entries.map((entry: any) => {
      const espnId = parseInt(entry.team?.id ?? '0', 10);
      const stats: any[] = entry.stats ?? [];
      return {
        team: resolveTeamName(espnId, entry.team?.displayName ?? 'TBD', bracketData),
        espnId,
        points: parseStat(stats, 'points'),
        wins: parseStat(stats, 'wins'),
        draws: parseStat(stats, 'draws') || parseStat(stats, 'ties'),
        losses: parseStat(stats, 'losses'),
        goalDifference: parseStat(stats, 'goalDifference') || parseStat(stats, 'pointDifferential'),
        goalsFor: parseStat(stats, 'pointsFor') || parseStat(stats, 'goalsFor'),
        gamesPlayed: parseStat(stats, 'gamesPlayed'),
      };
    });

    return { groupName, standings };
  });
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Fetch all completed matches from ESPN, parsing their group/round.
 * Looks back across the full tournament window via date queries.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export async function fetchCompletedMatches(
  bracketData: BracketData,
  daysBack: number = 30,
): Promise<CompletedMatch[]> {
  const dates: string[] = [];
  const now = new Date();
  for (let d = 0; d < daysBack; d++) {
    const dt = new Date(now);
    dt.setDate(dt.getDate() - d);
    dates.push(dt.toISOString().slice(0, 10).replace(/-/g, ''));
  }

  const seenIds = new Set<string>();
  const allEvents: any[] = [];
  for (const date of dates) {
    try {
      const res = await fetch(`${SCOREBOARD_URL}?dates=${date}`, { cache: 'no-store' });
      if (!res.ok) continue;
      const data = await res.json();
      for (const e of data.events ?? []) {
        if (!seenIds.has(e.id)) { seenIds.add(e.id); allEvents.push(e); }
      }
    } catch {
      // Ignore individual day failures
    }
  }

  const completed: CompletedMatch[] = [];
  for (const event of allEvents) {
    const competition = event.competitions?.[0];
    const status = competition?.status ?? event.status ?? {};
    const state = status.type?.state ?? '';
    if (state !== 'post') continue; // only completed matches

    const competitors = competition?.competitors ?? [];
    if (competitors.length !== 2) continue;
    const cA = competitors[0];
    const cB = competitors[1];
    const idA = parseInt(cA.id ?? cA.team?.id ?? '0', 10);
    const idB = parseInt(cB.id ?? cB.team?.id ?? '0', 10);
    const teamA = getTeamByEspnId(bracketData, idA);
    const teamB = getTeamByEspnId(bracketData, idB);
    if (!teamA || !teamB) continue; // not a WC team

    const scoreA = parseInt(cA.score ?? '0', 10);
    const scoreB = parseInt(cB.score ?? '0', 10);

    let winner: string | null = null;
    if (cA.winner) winner = teamA.name;
    else if (cB.winner) winner = teamB.name;
    else if (scoreA > scoreB) winner = teamA.name;
    else if (scoreB > scoreA) winner = teamB.name;

    // Identify group vs knockout from notes/round
    // ESPN uses competition.notes[0].headline or competition.type.id
    // Group stage: notes contain "Group X" or status.type description
    // Knockout: notes contain "Round of 16", "Quarter-Finals", etc.
    const notes = competition?.notes?.[0]?.headline ?? '';
    const description = competition?.type?.text ?? '';
    const headline = (notes + ' ' + description).toLowerCase();

    let isGroup = false;
    let groupName: string | undefined;
    let knockoutRound: string | undefined;

    const groupMatch = headline.match(/group\s+([a-l])/i);
    if (groupMatch) {
      isGroup = true;
      groupName = groupMatch[1].toUpperCase();
    } else if (headline.includes('round of 32') || headline.includes('r32')) {
      knockoutRound = 'R32';
    } else if (headline.includes('round of 16') || headline.includes('r16')) {
      knockoutRound = 'R16';
    } else if (headline.includes('quarter')) {
      knockoutRound = 'QF';
    } else if (headline.includes('semi')) {
      knockoutRound = 'SF';
    } else if (headline.includes('third') || headline.includes('3rd')) {
      knockoutRound = '3RD';
    } else if (headline.includes('final')) {
      knockoutRound = 'FINAL';
    }

    completed.push({
      espnId: String(event.id ?? ''),
      date: event.date ?? competition?.date ?? '',
      teamA: teamA.name,
      teamB: teamB.name,
      scoreA,
      scoreB,
      winner,
      isGroup,
      groupName,
      knockoutRound,
    });
  }

  return completed;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
