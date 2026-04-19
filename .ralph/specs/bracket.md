# Bracket & Prediction UI

## Group Stage Prediction
- Grid of 12 groups, each showing 4 teams
- User drags/reorders teams to predict finishing order 1-4
- Each team shows: flag, name, pot seed badge, FIFA ranking
- After ordering all groups, a 3rd-place advancement picker appears
- Picker shows all 12 third-place teams (based on user's predicted 3rd-place finishers)
- User selects exactly 8 that will advance to the knockout round
- Save button persists predictions via API
- Disabled after lock_time_groups

## Knockout Bracket Prediction
- Only available after group stage results are entered by admin
- Full bracket view: R32 → R16 → QF → SF → 3rd Place → Final
- Click a team in a matchup to pick the winner
- Winner advances to next round automatically
- Cascade clearing: changing an earlier pick clears all downstream picks that depended on it
- Connector lines between rounds (same visual pattern as March Madness)
- Tiebreaker input: predict total combined goals in the Final
- Save button persists picks via API
- Disabled after lock_time_knockout

## Responsive Layouts
- **Desktop (>1200px)**: Full bracket with connector lines, all rounds visible
- **Tablet (768-1200px)**: Stacked bracket sections
- **Mobile (<768px)**: Round tabs — tap to switch between R32, R16, QF, SF, Final

## Additional Features
- Shareable public bracket link (works without login, read-only)
- Print-friendly bracket view (CSS @media print)
- Bracket export as image (html2canvas)
