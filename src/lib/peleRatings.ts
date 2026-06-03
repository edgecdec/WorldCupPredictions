// PELE ratings — World Cup-adjusted (Silver Bulletin, June 2026)
// Source: Nate Silver's PELE model with WC-specific adjustments for
// 26-man rosters and recent form. GF/GA scaled proportionally to the
// PELE delta from base (factor = 10^(delta/400)).
//
// GF = expected goals scored per match against an average opponent
// GA = expected goals conceded per match against an average opponent

export interface PeleRating {
  name: string;
  pele: number;
  gf: number;
  ga: number;
}

// Average GA across all 211 FIFA teams (used as baseline for matchup adjustment)
export const AVG_GA = 2.3430;

export const PELE_RATINGS: Record<string, PeleRating> = {
  "Spain": { name: "Spain", pele: 2077, gf: 4.45, ga: 0.36 },
  "Argentina": { name: "Argentina", pele: 2065, gf: 4.35, ga: 0.35 },
  "England": { name: "England", pele: 2027, gf: 3.98, ga: 0.4 },
  "France": { name: "France", pele: 2026, gf: 4.09, ga: 0.42 },
  "Brazil": { name: "Brazil", pele: 1989, gf: 3.65, ga: 0.49 },
  "Germany": { name: "Germany", pele: 1975, gf: 4.23, ga: 0.57 },
  "Portugal": { name: "Portugal", pele: 1972, gf: 3.73, ga: 0.5 },
  "Norway": { name: "Norway", pele: 1953, gf: 3.95, ga: 0.55 },
  "Colombia": { name: "Colombia", pele: 1949, gf: 3.36, ga: 0.49 },
  "Netherlands": { name: "Netherlands", pele: 1939, gf: 3.37, ga: 0.61 },
  "Ecuador": { name: "Ecuador", pele: 1932, gf: 3.32, ga: 0.51 },
  "Uruguay": { name: "Uruguay", pele: 1931, gf: 3.36, ga: 0.52 },
  "Turkiye": { name: "Turkiye", pele: 1909, gf: 3.59, ga: 0.64 },
  "Senegal": { name: "Senegal", pele: 1897, gf: 2.99, ga: 0.56 },
  "Belgium": { name: "Belgium", pele: 1892, gf: 3.27, ga: 0.7 },
  "Switzerland": { name: "Switzerland", pele: 1889, gf: 3.15, ga: 0.68 },
  "Croatia": { name: "Croatia", pele: 1877, gf: 3, ga: 0.68 },
  "Japan": { name: "Japan", pele: 1872, gf: 3.03, ga: 0.71 },
  "Morocco": { name: "Morocco", pele: 1866, gf: 2.71, ga: 0.58 },
  "Paraguay": { name: "Paraguay", pele: 1855, gf: 2.77, ga: 0.67 },
  "Mexico": { name: "Mexico", pele: 1853, gf: 2.76, ga: 0.68 },
  "Austria": { name: "Austria", pele: 1832, gf: 2.86, ga: 0.85 },
  "USA": { name: "USA", pele: 1810, gf: 2.69, ga: 0.86 },
  "Canada": { name: "Canada", pele: 1806, gf: 2.48, ga: 0.84 },
  "Scotland": { name: "Scotland", pele: 1802, gf: 2.46, ga: 0.86 },
  "Algeria": { name: "Algeria", pele: 1794, gf: 2.56, ga: 0.89 },
  "Sweden": { name: "Sweden", pele: 1781, gf: 2.44, ga: 0.99 },
  "Ivory Coast": { name: "Ivory Coast", pele: 1777, gf: 2.41, ga: 0.89 },
  "Australia": { name: "Australia", pele: 1772, gf: 2.37, ga: 0.88 },
  "Egypt": { name: "Egypt", pele: 1770, gf: 2.36, ga: 0.89 },
  "South Korea": { name: "South Korea", pele: 1770, gf: 2.33, ga: 0.87 },
  "Czechia": { name: "Czechia", pele: 1769, gf: 2.37, ga: 0.97 },
  "Panama": { name: "Panama", pele: 1739, gf: 2.21, ga: 1 },
  "DR Congo": { name: "DR Congo", pele: 1729, gf: 2.06, ga: 1.05 },
  "Iran": { name: "Iran", pele: 1722, gf: 1.98, ga: 1.03 },
  "Uzbekistan": { name: "Uzbekistan", pele: 1714, gf: 2.08, ga: 1.08 },
  "Bosnia and Herzegovina": { name: "Bosnia and Herzegovina", pele: 1706, gf: 2.15, ga: 1.16 },
  "Tunisia": { name: "Tunisia", pele: 1695, gf: 1.83, ga: 1.09 },
  "South Africa": { name: "South Africa", pele: 1667, gf: 1.7, ga: 1.16 },
  "Ghana": { name: "Ghana", pele: 1662, gf: 1.72, ga: 1.27 },
  "Jordan": { name: "Jordan", pele: 1661, gf: 1.84, ga: 1.24 },
  "Iraq": { name: "Iraq", pele: 1653, gf: 1.71, ga: 1.2 },
  "New Zealand": { name: "New Zealand", pele: 1639, gf: 1.75, ga: 1.32 },
  "Haiti": { name: "Haiti", pele: 1637, gf: 1.89, ga: 1.42 },
  "Saudi Arabia": { name: "Saudi Arabia", pele: 1632, gf: 1.58, ga: 1.26 },
  "Cape Verde": { name: "Cape Verde", pele: 1621, gf: 1.49, ga: 1.3 },
  "Curacao": { name: "Curacao", pele: 1570, gf: 1.48, ga: 1.62 },
  "Qatar": { name: "Qatar", pele: 1550, gf: 1.46, ga: 1.77 },
};
