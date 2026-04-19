# Groups (Prediction Leagues)

## Overview
Users create or join groups to compete against friends with shared leaderboards.

## Features
- Create a group with a name → generates a unique invite code
- Share invite code → others join
- Each group has its own scoring settings (all values configurable, see specs/scoring.md)
- Group creator is the admin
- Max brackets per user per group: configurable (default: 1)
- Group admin can lock/unlock bracket submissions independently of tournament lock time

## Scoring Settings
- Group admin configures all scoring parameters at group creation
- Defaults pre-filled from DEFAULT_SCORING
- Can be edited before tournament locks
- See specs/scoring.md for full config schema

## Leaderboard
- Per-group leaderboard sorted by total score
- Shows: username, bracket name, group stage score, knockout score, total, tiebreaker
- Round-by-round breakdown columns
- Clickable scores show per-pick scoring breakdown

## Group Chat
- Simple message thread per group
- Username + timestamp + message
