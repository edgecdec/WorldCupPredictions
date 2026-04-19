# Tournament Structure — 2026 FIFA World Cup

## Format
- 48 teams, 12 groups of 4
- Each team assigned to a pot (1-4) based on FIFA rankings at time of draw
- One team per pot in each group → each group has seeds 1-4

## Group Stage
- Round-robin: each team plays 3 matches within their group
- 3 points for a win, 1 for a draw, 0 for a loss
- Top 2 per group advance automatically (24 teams)
- 8 best 3rd-place teams also advance (out of 12 third-place finishers)
- Total advancing: 32 teams

## Best Third-Place Determination
- FIFA ranks the 12 third-place teams by: points, goal difference, goals scored, fair play, drawing of lots
- Top 8 advance to the Round of 32

## Knockout Bracket
- 32 teams in single-elimination bracket
- R32 (16 matches) → R16 (8) → QF (4) → SF (2) → 3rd Place Match (1) → Final (1)
- Extra time + penalties if drawn after 90 minutes in knockout matches

## R32 Bracket Mapping
FIFA assigns R32 matchups based on group finishing position. The bracket is pre-determined:
- Group winners face advancing 3rd-place teams or runners-up from other groups
- Runners-up face group winners from other groups
- Exact mapping follows FIFA's published bracket structure for the 48-team format

## Two-Phase Prediction Timing
1. **Group stage predictions** lock before the first match of the tournament (June 11, 2026)
   - Users predict finishing order (1-4) for all 12 groups
   - Users pick which 8 of 12 third-place teams will advance
2. **Knockout bracket predictions** lock before the first knockout match
   - Users fill out the 32-team bracket (R32 through Final + 3rd place match)
   - Only available after group stage results are finalized

## Team Data Model
Each team has:
- `name`: Official team name
- `logo`: Flag/crest image URL
- `fifaRanking`: FIFA World Ranking at tournament start
- `pot`: Draw pot (1-4)
- `groupSeed`: Seed within their group (1-4, based on pot)
