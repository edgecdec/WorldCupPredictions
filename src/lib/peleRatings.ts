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
  "Argentina": { name: "Argentina", pele: 2082, gf: 4.57, ga: 0.33 },
  "Spain": { name: "Spain", pele: 2059, gf: 4.44, ga: 0.37 },
  "England": { name: "England", pele: 2042, gf: 4.21, ga: 0.38 },
  "France": { name: "France", pele: 2041, gf: 4.41, ga: 0.38 },
  "Germany": { name: "Germany", pele: 1993, gf: 4.4, ga: 0.56 },
  "Brazil": { name: "Brazil", pele: 1993, gf: 3.85, ga: 0.47 },
  "Portugal": { name: "Portugal", pele: 1963, gf: 3.63, ga: 0.52 },
  "Norway": { name: "Norway", pele: 1962, gf: 3.85, ga: 0.56 },
  "Colombia": { name: "Colombia", pele: 1958, gf: 3.4, ga: 0.49 },
  "Netherlands": { name: "Netherlands", pele: 1953, gf: 3.77, ga: 0.55 },
  "Uruguay": { name: "Uruguay", pele: 1899, gf: 2.98, ga: 0.6 },
  "Japan": { name: "Japan", pele: 1892, gf: 3.24, ga: 0.67 },
  "Switzerland": { name: "Switzerland", pele: 1891, gf: 3.17, ga: 0.68 },
  "Ecuador": { name: "Ecuador", pele: 1891, gf: 2.86, ga: 0.6 },
  "Morocco": { name: "Morocco", pele: 1885, gf: 2.8, ga: 0.56 },
  "Senegal": { name: "Senegal", pele: 1881, gf: 2.8, ga: 0.6 },
  "Belgium": { name: "Belgium", pele: 1877, gf: 3.09, ga: 0.75 },
  "Mexico": { name: "Mexico", pele: 1867, gf: 2.77, ga: 0.67, homeField: 145 },
  "Croatia": { name: "Croatia", pele: 1865, gf: 2.98, ga: 0.69 },
  "Turkiye": { name: "Turkiye", pele: 1856, gf: 2.92, ga: 0.79 },
  "USA": { name: "USA", pele: 1853, gf: 3.04, ga: 0.76, homeField: 88 },
  "Paraguay": { name: "Paraguay", pele: 1849, gf: 2.68, ga: 0.69 },
  "Austria": { name: "Austria", pele: 1825, gf: 2.82, ga: 0.86 },
  "Canada": { name: "Canada", pele: 1820, gf: 2.6, ga: 0.8, homeField: 86 },
  "Ivory Coast": { name: "Ivory Coast", pele: 1809, gf: 2.54, ga: 0.83 },
  "Scotland": { name: "Scotland", pele: 1801, gf: 2.5, ga: 0.85 },
  "Algeria": { name: "Algeria", pele: 1796, gf: 2.53, ga: 0.9 },
  "Egypt": { name: "Egypt", pele: 1794, gf: 2.49, ga: 0.84 },
  "Australia": { name: "Australia", pele: 1793, gf: 2.46, ga: 0.84 },
  "South Korea": { name: "South Korea", pele: 1782, gf: 2.36, ga: 0.85 },
  "Sweden": { name: "Sweden", pele: 1780, gf: 2.55, ga: 0.95 },
  "Czechia": { name: "Czechia", pele: 1754, gf: 2.26, ga: 1.02 },
  "DR Congo": { name: "DR Congo", pele: 1743, gf: 2.18, ga: 0.99 },
  "Iran": { name: "Iran", pele: 1733, gf: 2.04, ga: 1.01 },
  "Panama": { name: "Panama", pele: 1719, gf: 2.05, ga: 1.09 },
  "Uzbekistan": { name: "Uzbekistan", pele: 1707, gf: 2.04, ga: 1.09 },
  "Ghana": { name: "Ghana", pele: 1685, gf: 1.89, ga: 1.15 },
  "Bosnia and Herzegovina": { name: "Bosnia and Herzegovina", pele: 1684, gf: 1.99, ga: 1.26 },
  "South Africa": { name: "South Africa", pele: 1674, gf: 1.78, ga: 1.12 },
  "Cape Verde": { name: "Cape Verde", pele: 1663, gf: 1.71, ga: 1.13 },
  "Saudi Arabia": { name: "Saudi Arabia", pele: 1648, gf: 1.65, ga: 1.2 },
  "Iraq": { name: "Iraq", pele: 1645, gf: 1.62, ga: 1.27 },
  "Jordan": { name: "Jordan", pele: 1644, gf: 1.71, ga: 1.34 },
  "Tunisia": { name: "Tunisia", pele: 1642, gf: 1.62, ga: 1.24 },
  "New Zealand": { name: "New Zealand", pele: 1633, gf: 1.68, ga: 1.37 },
  "Haiti": { name: "Haiti", pele: 1618, gf: 1.74, ga: 1.54 },
  "Curacao": { name: "Curacao", pele: 1576, gf: 1.48, ga: 1.62 },
  "Qatar": { name: "Qatar", pele: 1551, gf: 1.44, ga: 1.79 },
};
