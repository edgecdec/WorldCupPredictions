// PELE ratings — World Cup-adjusted (Silver Bulletin)
// Source: Nate Silver's PELE model with WC-specific adjustments for
// 26-man rosters, recent form, and home field advantage.
//
// PELE: Overall team strength on Elo-like scale (~1500 = average team).
// GF/GA: Expected goals scored/conceded per match vs an average opponent.
//   Scaled from base PELE so a delta D in PELE shifts the lambda RATIO
//   by 10^(D/400) — applied as 10^(D/800) to each of GF and GA.
// homeField: PELE point bonus when this team plays in their host country
//   (only USA/Mexico/Canada have it). Group stage = full bonus, knockouts
//   are dampened to 50% (see KO_HFA_SCALE in the worker).
//
// Tilt is NOT used. Per Silver Bulletin: tilt is meant for over/under
// predictions, not match outcome distribution. Empirically, applying it
// to win probability hurt calibration (especially for Argentina against
// defensively-tilted opponents like Uruguay).

export interface PeleRating {
  name: string;
  pele: number;
  gf: number;
  ga: number;
  homeField?: number;
}

// Average GA across all 211 FIFA teams (used as baseline for matchup adjustment)
export const AVG_GA = 2.3430;

export const PELE_RATINGS: Record<string, PeleRating> = {
  "Spain": { name: "Spain", pele: 2071, gf: 4.6, ga: 0.36 },
  "Argentina": { name: "Argentina", pele: 2064, gf: 4.34, ga: 0.35 },
  "England": { name: "England", pele: 2025, gf: 4.01, ga: 0.4 },
  "France": { name: "France", pele: 2024, gf: 4.2, ga: 0.4 },
  "Brazil": { name: "Brazil", pele: 1990, gf: 3.82, ga: 0.47 },
  "Portugal": { name: "Portugal", pele: 1974, gf: 3.75, ga: 0.5 },
  "Germany": { name: "Germany", pele: 1972, gf: 4.14, ga: 0.59 },
  "Norway": { name: "Norway", pele: 1951, gf: 3.73, ga: 0.58 },
  "Colombia": { name: "Colombia", pele: 1950, gf: 3.32, ga: 0.5 },
  "Ecuador": { name: "Ecuador", pele: 1936, gf: 3.25, ga: 0.53 },
  "Netherlands": { name: "Netherlands", pele: 1933, gf: 3.56, ga: 0.58 },
  "Uruguay": { name: "Uruguay", pele: 1927, gf: 3.23, ga: 0.55 },
  "Turkiye": { name: "Turkiye", pele: 1908, gf: 3.39, ga: 0.68 },
  "Belgium": { name: "Belgium", pele: 1899, gf: 3.29, ga: 0.7 },
  "Senegal": { name: "Senegal", pele: 1897, gf: 2.93, ga: 0.57 },
  "Switzerland": { name: "Switzerland", pele: 1885, gf: 3.12, ga: 0.69 },
  "Croatia": { name: "Croatia", pele: 1878, gf: 3.09, ga: 0.66 },
  "Japan": { name: "Japan", pele: 1869, gf: 3.03, ga: 0.72 },
  "Mexico": { name: "Mexico", pele: 1859, gf: 2.71, ga: 0.69, homeField: 145 },
  "Morocco": { name: "Morocco", pele: 1857, gf: 2.58, ga: 0.61 },
  "Paraguay": { name: "Paraguay", pele: 1849, gf: 2.68, ga: 0.69 },
  "Austria": { name: "Austria", pele: 1832, gf: 2.88, ga: 0.84 },
  "Scotland": { name: "Scotland", pele: 1808, gf: 2.55, ga: 0.83 },
  "USA": { name: "USA", pele: 1807, gf: 2.66, ga: 0.87, homeField: 88 },
  "Algeria": { name: "Algeria", pele: 1802, gf: 2.57, ga: 0.88 },
  "Canada": { name: "Canada", pele: 1800, gf: 2.45, ga: 0.85, homeField: 86 },
  "Ivory Coast": { name: "Ivory Coast", pele: 1786, gf: 2.38, ga: 0.89 },
  "Sweden": { name: "Sweden", pele: 1782, gf: 2.56, ga: 0.94 },
  "Czechia": { name: "Czechia", pele: 1775, gf: 2.4, ga: 0.96 },
  "Australia": { name: "Australia", pele: 1775, gf: 2.34, ga: 0.88 },
  "Egypt": { name: "Egypt", pele: 1770, gf: 2.32, ga: 0.9 },
  "South Korea": { name: "South Korea", pele: 1769, gf: 2.27, ga: 0.88 },
  "Panama": { name: "Panama", pele: 1741, gf: 2.18, ga: 1.02 },
  "DR Congo": { name: "DR Congo", pele: 1733, gf: 2.12, ga: 1.02 },
  "Iran": { name: "Iran", pele: 1728, gf: 2.01, ga: 1.02 },
  "Uzbekistan": { name: "Uzbekistan", pele: 1714, gf: 2.08, ga: 1.07 },
  "Bosnia and Herzegovina": { name: "Bosnia and Herzegovina", pele: 1707, gf: 2.13, ga: 1.18 },
  "Tunisia": { name: "Tunisia", pele: 1689, gf: 1.85, ga: 1.08 },
  "South Africa": { name: "South Africa", pele: 1671, gf: 1.76, ga: 1.13 },
  "Ghana": { name: "Ghana", pele: 1662, gf: 1.77, ga: 1.23 },
  "Iraq": { name: "Iraq", pele: 1660, gf: 1.69, ga: 1.22 },
  "Jordan": { name: "Jordan", pele: 1659, gf: 1.79, ga: 1.28 },
  "New Zealand": { name: "New Zealand", pele: 1641, gf: 1.72, ga: 1.34 },
  "Saudi Arabia": { name: "Saudi Arabia", pele: 1638, gf: 1.6, ga: 1.24 },
  "Haiti": { name: "Haiti", pele: 1634, gf: 1.82, ga: 1.47 },
  "Cape Verde": { name: "Cape Verde", pele: 1623, gf: 1.52, ga: 1.27 },
  "Curacao": { name: "Curacao", pele: 1573, gf: 1.47, ga: 1.63 },
  "Qatar": { name: "Qatar", pele: 1550, gf: 1.44, ga: 1.8 },
};
