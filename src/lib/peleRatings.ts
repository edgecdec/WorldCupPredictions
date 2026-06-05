// PELE ratings — World Cup-adjusted (Silver Bulletin, June 2026)
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
  "Spain": { name: "Spain", pele: 2069, gf: 4.57, ga: 0.36 },
  "Argentina": { name: "Argentina", pele: 2065, gf: 4.35, ga: 0.35 },
  "England": { name: "England", pele: 2027, gf: 4.03, ga: 0.4 },
  "France": { name: "France", pele: 2025, gf: 4.21, ga: 0.4 },
  "Brazil": { name: "Brazil", pele: 1989, gf: 3.81, ga: 0.47 },
  "Germany": { name: "Germany", pele: 1975, gf: 4.18, ga: 0.58 },
  "Portugal": { name: "Portugal", pele: 1974, gf: 3.75, ga: 0.5 },
  "Norway": { name: "Norway", pele: 1953, gf: 3.75, ga: 0.58 },
  "Colombia": { name: "Colombia", pele: 1948, gf: 3.3, ga: 0.5 },
  "Ecuador": { name: "Ecuador", pele: 1933, gf: 3.22, ga: 0.53 },
  "Uruguay": { name: "Uruguay", pele: 1931, gf: 3.27, ga: 0.54 },
  "Netherlands": { name: "Netherlands", pele: 1930, gf: 3.53, ga: 0.58 },
  "Turkiye": { name: "Turkiye", pele: 1907, gf: 3.38, ga: 0.68 },
  "Senegal": { name: "Senegal", pele: 1897, gf: 2.93, ga: 0.57 },
  "Switzerland": { name: "Switzerland", pele: 1894, gf: 3.2, ga: 0.67 },
  "Belgium": { name: "Belgium", pele: 1892, gf: 3.22, ga: 0.71 },
  "Croatia": { name: "Croatia", pele: 1877, gf: 3.08, ga: 0.66 },
  "Japan": { name: "Japan", pele: 1867, gf: 3.01, ga: 0.72 },
  "Morocco": { name: "Morocco", pele: 1867, gf: 2.66, ga: 0.59 },
  "Mexico": { name: "Mexico", pele: 1861, gf: 2.73, ga: 0.69, homeField: 145 },
  "Paraguay": { name: "Paraguay", pele: 1854, gf: 2.72, ga: 0.68 },
  "Austria": { name: "Austria", pele: 1832, gf: 2.88, ga: 0.84 },
  "USA": { name: "USA", pele: 1810, gf: 2.68, ga: 0.86, homeField: 88 },
  "Canada": { name: "Canada", pele: 1807, gf: 2.5, ga: 0.83, homeField: 86 },
  "Algeria": { name: "Algeria", pele: 1803, gf: 2.58, ga: 0.88 },
  "Scotland": { name: "Scotland", pele: 1802, gf: 2.51, ga: 0.84 },
  "Ivory Coast": { name: "Ivory Coast", pele: 1787, gf: 2.39, ga: 0.89 },
  "Sweden": { name: "Sweden", pele: 1780, gf: 2.55, ga: 0.95 },
  "Australia": { name: "Australia", pele: 1773, gf: 2.33, ga: 0.89 },
  "South Korea": { name: "South Korea", pele: 1770, gf: 2.28, ga: 0.88 },
  "Egypt": { name: "Egypt", pele: 1770, gf: 2.32, ga: 0.9 },
  "Czechia": { name: "Czechia", pele: 1769, gf: 2.36, ga: 0.98 },
  "Panama": { name: "Panama", pele: 1742, gf: 2.19, ga: 1.02 },
  "DR Congo": { name: "DR Congo", pele: 1732, gf: 2.11, ga: 1.02 },
  "Iran": { name: "Iran", pele: 1728, gf: 2.01, ga: 1.02 },
  "Uzbekistan": { name: "Uzbekistan", pele: 1715, gf: 2.09, ga: 1.07 },
  "Bosnia and Herzegovina": { name: "Bosnia and Herzegovina", pele: 1704, gf: 2.11, ga: 1.19 },
  "Tunisia": { name: "Tunisia", pele: 1695, gf: 1.88, ga: 1.06 },
  "South Africa": { name: "South Africa", pele: 1666, gf: 1.73, ga: 1.15 },
  "Ghana": { name: "Ghana", pele: 1662, gf: 1.77, ga: 1.23 },
  "Jordan": { name: "Jordan", pele: 1661, gf: 1.8, ga: 1.27 },
  "Iraq": { name: "Iraq", pele: 1660, gf: 1.69, ga: 1.22 },
  "New Zealand": { name: "New Zealand", pele: 1640, gf: 1.72, ga: 1.34 },
  "Haiti": { name: "Haiti", pele: 1637, gf: 1.84, ga: 1.46 },
  "Saudi Arabia": { name: "Saudi Arabia", pele: 1633, gf: 1.58, ga: 1.26 },
  "Cape Verde": { name: "Cape Verde", pele: 1620, gf: 1.51, ga: 1.28 },
  "Curacao": { name: "Curacao", pele: 1570, gf: 1.46, ga: 1.64 },
  "Qatar": { name: "Qatar", pele: 1550, gf: 1.44, ga: 1.8 },
};
