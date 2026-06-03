// PELE ratings — World Cup-adjusted (Silver Bulletin, June 2026)
// Source: Nate Silver's PELE model with WC-specific adjustments for
// 26-man rosters and recent form. Home field advantage stored as a
// separate per-team value (homeField) and applied per-match in the
// simulation worker — only when that team plays a match at home.
//
// GF/GA scaled so that a PELE delta D shifts the Poisson lambda ratio
// by exactly 10^(D/400) — i.e., one Elo-equivalent unit. Since both
// gf and ga are scaled (by F and 1/F), each gets factor 10^(D/800).
//
// GF = expected goals scored per match against an average opponent
// GA = expected goals conceded per match against an average opponent
// homeField = PELE point bonus when this team plays in their host country

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
  "Spain": { name: "Spain", pele: 2077, gf: 4.61, ga: 0.35 },
  "Argentina": { name: "Argentina", pele: 2065, gf: 4.37, ga: 0.35 },
  "England": { name: "England", pele: 2027, gf: 4.04, ga: 0.4 },
  "France": { name: "France", pele: 2026, gf: 4.11, ga: 0.41 },
  "Brazil": { name: "Brazil", pele: 1989, gf: 3.82, ga: 0.47 },
  "Germany": { name: "Germany", pele: 1975, gf: 4.19, ga: 0.58 },
  "Portugal": { name: "Portugal", pele: 1972, gf: 3.73, ga: 0.5 },
  "Norway": { name: "Norway", pele: 1953, gf: 3.79, ga: 0.58 },
  "Colombia": { name: "Colombia", pele: 1949, gf: 3.34, ga: 0.5 },
  "Netherlands": { name: "Netherlands", pele: 1939, gf: 3.54, ga: 0.58 },
  "Ecuador": { name: "Ecuador", pele: 1932, gf: 3.23, ga: 0.53 },
  "Uruguay": { name: "Uruguay", pele: 1931, gf: 3.28, ga: 0.54 },
  "Turkiye": { name: "Turkiye", pele: 1909, gf: 3.47, ga: 0.67 },
  "Senegal": { name: "Senegal", pele: 1897, gf: 2.93, ga: 0.57 },
  "Belgium": { name: "Belgium", pele: 1892, gf: 3.29, ga: 0.69 },
  "Switzerland": { name: "Switzerland", pele: 1889, gf: 3.17, ga: 0.67 },
  "Croatia": { name: "Croatia", pele: 1877, gf: 3.02, ga: 0.67 },
  "Japan": { name: "Japan", pele: 1872, gf: 3.05, ga: 0.71 },
  "Morocco": { name: "Morocco", pele: 1866, gf: 2.64, ga: 0.59 },
  "Paraguay": { name: "Paraguay", pele: 1855, gf: 2.74, ga: 0.67 },
  "Mexico": { name: "Mexico", pele: 1853, gf: 2.74, ga: 0.68, homeField: 145 },
  "Austria": { name: "Austria", pele: 1832, gf: 2.89, ga: 0.84 },
  "USA": { name: "USA", pele: 1810, gf: 2.69, ga: 0.86, homeField: 88 },
  "Canada": { name: "Canada", pele: 1806, gf: 2.52, ga: 0.82, homeField: 86 },
  "Scotland": { name: "Scotland", pele: 1802, gf: 2.51, ga: 0.84 },
  "Algeria": { name: "Algeria", pele: 1794, gf: 2.56, ga: 0.89 },
  "Sweden": { name: "Sweden", pele: 1781, gf: 2.54, ga: 0.95 },
  "Ivory Coast": { name: "Ivory Coast", pele: 1777, gf: 2.38, ga: 0.9 },
  "Australia": { name: "Australia", pele: 1772, gf: 2.32, ga: 0.89 },
  "Egypt": { name: "Egypt", pele: 1770, gf: 2.32, ga: 0.9 },
  "South Korea": { name: "South Korea", pele: 1770, gf: 2.28, ga: 0.88 },
  "Czechia": { name: "Czechia", pele: 1769, gf: 2.4, ga: 0.96 },
  "Panama": { name: "Panama", pele: 1739, gf: 2.2, ga: 1.01 },
  "DR Congo": { name: "DR Congo", pele: 1729, gf: 2.1, ga: 1.02 },
  "Iran": { name: "Iran", pele: 1722, gf: 2.02, ga: 1.02 },
  "Uzbekistan": { name: "Uzbekistan", pele: 1714, gf: 2.06, ga: 1.08 },
  "Bosnia and Herzegovina": { name: "Bosnia and Herzegovina", pele: 1706, gf: 2.13, ga: 1.18 },
  "Tunisia": { name: "Tunisia", pele: 1695, gf: 1.86, ga: 1.07 },
  "South Africa": { name: "South Africa", pele: 1667, gf: 1.72, ga: 1.15 },
  "Ghana": { name: "Ghana", pele: 1662, gf: 1.77, ga: 1.23 },
  "Jordan": { name: "Jordan", pele: 1661, gf: 1.81, ga: 1.26 },
  "Iraq": { name: "Iraq", pele: 1653, gf: 1.69, ga: 1.21 },
  "New Zealand": { name: "New Zealand", pele: 1639, gf: 1.73, ga: 1.34 },
  "Haiti": { name: "Haiti", pele: 1637, gf: 1.84, ga: 1.45 },
  "Saudi Arabia": { name: "Saudi Arabia", pele: 1632, gf: 1.57, ga: 1.27 },
  "Cape Verde": { name: "Cape Verde", pele: 1621, gf: 1.5, ga: 1.28 },
  "Curacao": { name: "Curacao", pele: 1570, gf: 1.46, ga: 1.63 },
  "Qatar": { name: "Qatar", pele: 1550, gf: 1.45, ga: 1.79 },
};
