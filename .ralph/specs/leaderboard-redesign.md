# Leaderboard Redesign — Per-bucket Columns + Impact Panels

Designed 2026-06-11 (pre-lock). To be deployed after group-stage lock fires.

## Goal

Make the leaderboard show users' progress at a per-group / per-round granularity
rather than collapsing everything into Group / Knockout / Total. Until a bucket
is finalized, show the **expected points** (from the 10k-sim forecast). Once
finalized, show **actual points** earned.

## Pick counts

Total picks per user:
- 12 groups × 4 positions = 48 group-position picks
- 8 third-place advancement picks
- 16 R32 + 8 R16 + 4 QF + 2 SF + **1 third-place** + 1 Final = 32 knockout picks

Total: **88 picks** across the tournament.

## Column structure

```
[ STICKY LEFT (~220px total) ] [ SCROLLING MIDDLE ]
 # | User+Bracket | Exp Pts    | A B C D E F G H I J K L | R32 R16 QF SF 3rd Final
```

### Sticky left
- `#` — rank (no Top X% subtitle, dropped per user request). Width ~28px.
- `User / Bracket` — username on top line, bracket name in 0.65rem below. ~120px.
- `Exp Pts` — forecast total (from worker). Sortable. ~70px. Subtle right-edge shadow.

### Scrolling middle
- 12 group columns A–L: each ~52px
- 6 round columns: R32, R16, QF, SF, 3rd, Final: each ~52px
- Mobile (≤sm): show "Group / Knockout" toggle so only one set is visible at a time

## Cell styling

Each scrolling cell shows the user's points for that bucket:

| State | Style |
|---|---|
| **Locked** (all matches in bucket complete) | `fontWeight: 700, color: 'text.primary'`, integer (e.g. `9`) |
| **Expected** (not yet locked) | `fontStyle: 'italic', color: 'text.secondary', fontSize: '0.85em'`, decimal (e.g. `6.5`) |
| **Live** (a match in this bucket is in progress) | `color: 'warning.main'` to signal it's moving |

## Sort behavior

- Default: `Exp Pts desc`
- Click any group/round column header → sort by that bucket
- Sort indicator (▲▼) on active column
- Tied Exp Pts → secondary sort by underlying float (not rounded)

## Mobile tweaks

1. **Stack user+bracket vertically**: username on top, bracket in subtitle below
2. **No emoji ribbon inline**: 🎯💀☠😱🔥 stack into a popover under username on tap
3. **Group/Knockout toggle**: a small Tabs above the table, "Groups" or "Knockout"
4. **Tap row to expand**: opens a bottom sheet with full per-group + per-round breakdown:
   ```
   ─── jsmith — Smith2026 ───
   Total Exp Pts: 82.4

   GROUP STAGE
     Group A  ✓ FINAL          9
     Group B  ✓ FINAL         13
     Group C  · pending      6.5
     ...

   KNOCKOUT
     R32      · pending     1.5
     R16      · pending     2.4
     ...
   ```

## Worker data shape

`playerScores[userKey]` extended with:
```ts
{
  avgScore: number;             // existing
  avgRank: number;              // existing
  winPct: number;               // existing
  scoreDistribution: Record;    // existing
  // NEW
  avgGroupScores: Record<string, number>;   // 'A' → 6.2, 'B' → 7.5, ...
  avgRoundScores: Record<string, number>;   // 'R32' → 1.5, 'R16' → 2.4, 'QF' → 2.1, 'SF' → 1.8, '3RD' → 0.6, 'FINAL' → 2.1
}
```

## Conditional scores (for match impact panels)

Worker also emits `conditionalScores`:
```ts
{
  // matchId examples: 'group:A:Mexico-South Africa', 'ko:R32-1', 'ko:FINAL'
  [matchId: string]: {
    // For group: 'W' | 'D' | 'L' | exact like '1-0' (top 8 most common)
    // For knockout: team name (winner)
    [outcome: string]: {
      [userKey: string]: number;  // user's expected total score given this outcome
    };
  };
}
```

Used by score cards to display W/D/L delta vs the user's pre-match `avgScore`.

## API changes

`/api/leaderboard` returns per-user:
- `groupScoresLocked[groupName]` — actual pts if group complete, else null
- `groupScoresExpected[groupName]` — from worker
- `roundScoresLocked[round]` — actual pts if all matches done, else null
- `roundScoresExpected[round]` — from worker

Locked status determination:
- A group is **locked** when its 6 matches are all complete (each team's final position determined)
- A round is **locked** when all matches in that round are complete
- Picks within a locked group all clinch at that point

## Score card impact panel

Each match card (live or scheduled) gains an "Impact on your Exp Pts" panel:

### Scheduled
```
Pre-match expected: 71.8

USA wins   →  +1.4
Draw       →  −0.5
PAR wins   →  −2.6
```

### Live
```
Currently: +0.8 vs pre-match

MEX holds  →  +1.4
Draw       →  −0.6
RSA wins   →  −2.0  (1% chance)

Most likely finals  ▾
  1-0   38%   +1.0
  2-0   18%   +1.4
  1-1   14%   −0.6
  2-1   11%   +0.6
  3-0    8%   +1.7
```

Math: pull `conditionalScores[matchId]['W'][currentUserKey]` etc. and subtract
the user's pre-match `avgScore` to get the delta.

### Final
```
Net impact: +1.3
(Mexico advances toward your predicted 1st place finish)
```

Locks once match is final.

## Build order

1. Worker: add `avgGroupScores`, `avgRoundScores`, `conditionalScores`
2. Hook + types: pipe new fields through `useTournamentSim`
3. API: `/api/leaderboard` exposes per-bucket locked + expected
4. UI: sticky leaderboard layout with scrollable middle
5. Mobile: Group/Knockout toggle + tap-to-expand bottom sheet
6. Score card: impact panel reading from `conditionalScores`
