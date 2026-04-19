# Scoring System

All point values are configurable per group. Defaults shown below.

## Group Stage Scoring

### Per-Team (48 teams = 12 groups × 4 teams)

| Category | Default | Rule |
|---|---|---|
| Advance correct | +1 | Boolean: predicted advance AND team advanced, OR predicted not-advance AND team didn't advance |
| Exact position | +1 | Predicted finishing position (1st/2nd/3rd/4th) matches actual |
| Upset bonus | +1 per place | `max(0, seed - predicted_position)`, only if team finishes at or above predicted position. Capped at prediction, not actual finish. |

### Advance Logic
- Predicted 1st or 2nd → predicted to advance
- Predicted 3rd AND picked as one of 8 advancing 3rd-place teams → predicted to advance
- Predicted 3rd but NOT picked as advancing → predicted to not advance
- Predicted 4th → predicted to not advance
- A team "advances" if they finish 1st, 2nd, or 3rd-and-qualified-as-best-third

### Upset Bonus Detail (Prediction-Gated)
- Seeds 1-4 per group based on FIFA draw pot (Pot 1 = seed 1, Pot 4 = seed 4)
- Bonus = `max(0, seed - predicted_position)`
- Only awarded when team finishes **at or above** the predicted position
- Capped at what user predicted, NOT where team actually finished
- Example: Seed 4 predicted 2nd, finishes 1st → bonus = 4-2 = +2 (not +3)
- Example: Seed 4 predicted 2nd, finishes 3rd → bonus = 0 (finished below prediction)

### Per-Group Bonuses (independent of each other)

| Category | Default | Rule |
|---|---|---|
| Advancement correct bonus | +1 | All 4 teams' advance/not-advance predictions correct (including 3rd-place pick) |
| Perfect order bonus | +2 | All 4 teams in exact correct finishing position |

These are independent — perfect order does NOT imply advancement correct. A user can get all 4 positions right but have the wrong 3rd-place advancement call.

## Knockout Scoring

### Base Points Per Round

| Round | Default | Games |
|---|---|---|
| Round of 32 | 3 | 16 |
| Round of 16 | 5 | 8 |
| Quarterfinals | 8 | 4 |
| Semifinals | 13 | 2 |
| 3rd Place Match | 13 | 1 |
| Final | 21 | 1 |
| Champion bonus | +5 | — |

### Knockout Upset Bonus
- Uses actual FIFA World Rankings (not re-seeded)
- Formula: `floor(ranking_difference / modulus) × round_multiplier`
- `ranking_difference = winner_fifa_rank - loser_fifa_rank` (positive when lower-ranked team wins)
- Only awarded when user predicted the winning team
- Default modulus: 10
- Default multipliers per round: [1, 1, 2, 2, 1, 3] (R32, R16, QF, SF, 3rd, Final)

### Example
FIFA #35 beats FIFA #3, user predicted it, QF round (multiplier 2x):
`floor(32 / 10) × 2 = 3 × 2 = 6 bonus points`

## Default Scoring Config

```json
{
  "groupStage": {
    "advanceCorrect": 1,
    "exactPosition": 1,
    "upsetBonusPerPlace": 1,
    "advancementCorrectBonus": 1,
    "perfectOrderBonus": 2
  },
  "knockout": {
    "pointsPerRound": [3, 5, 8, 13, 13, 21],
    "upsetMultiplierPerRound": [1, 1, 2, 2, 1, 3],
    "upsetModulus": 10,
    "championBonus": 5
  }
}
```

## Tiebreaker
- Predict total combined goals in the Final match
- Closest to actual total wins the tiebreak
