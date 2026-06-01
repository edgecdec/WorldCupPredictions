// PELE ratings from Nate Silver's Silver Bulletin (June 1, 2026)
// GF = expected goals scored per match, GA = expected goals conceded per match
// Against an average opponent. Used for Poisson match simulation.

export interface PeleRating {
  name: string;
  pele: number;
  gf: number;
  ga: number;
}

// Average GA across all 211 FIFA teams (used as baseline for matchup adjustment)
export const AVG_GA = 2.3430;

export const PELE_RATINGS: Record<string, PeleRating> = {
  "Spain": { name: "Spain", pele: 2089.2, gf: 4.77, ga: 0.34 },
  "Argentina": { name: "Argentina", pele: 2066.5, gf: 4.39, ga: 0.35 },
  "England": { name: "England", pele: 2032, gf: 4.1, ga: 0.39 },
  "France": { name: "France", pele: 2028.2, gf: 4.14, ga: 0.41 },
  "Brazil": { name: "Brazil", pele: 2004.5, gf: 3.99, ga: 0.45 },
  "Portugal": { name: "Portugal", pele: 1972.5, gf: 3.74, ga: 0.5 },
  "Germany": { name: "Germany", pele: 1972.3, gf: 4.16, ga: 0.58 },
  "Netherlands": { name: "Netherlands", pele: 1956.2, gf: 3.72, ga: 0.55 },
  "Colombia": { name: "Colombia", pele: 1946.3, gf: 3.31, ga: 0.5 },
  "Norway": { name: "Norway", pele: 1938.8, gf: 3.64, ga: 0.6 },
  "Ecuador": { name: "Ecuador", pele: 1922.3, gf: 3.14, ga: 0.54 },
  "Uruguay": { name: "Uruguay", pele: 1922.3, gf: 3.2, ga: 0.55 },
  "Turkiye": { name: "Turkiye", pele: 1896.9, gf: 3.35, ga: 0.69 },
  "Belgium": { name: "Belgium", pele: 1893.5, gf: 3.3, ga: 0.69 },
  "Switzerland": { name: "Switzerland", pele: 1891.2, gf: 3.19, ga: 0.67 },
  "Senegal": { name: "Senegal", pele: 1889.8, gf: 2.87, ga: 0.58 },
  "Croatia": { name: "Croatia", pele: 1879.4, gf: 3.04, ga: 0.67 },
  "Japan": { name: "Japan", pele: 1874.9, gf: 3.08, ga: 0.7 },
  "Morocco": { name: "Morocco", pele: 1856.9, gf: 2.57, ga: 0.61 },
  "Paraguay": { name: "Paraguay", pele: 1851.4, gf: 2.71, ga: 0.68 },
  "Mexico": { name: "Mexico", pele: 1850.4, gf: 2.72, ga: 0.69 },
  "Austria": { name: "Austria", pele: 1835.6, gf: 2.92, ga: 0.83 },
  "Canada": { name: "Canada", pele: 1812.3, gf: 2.57, ga: 0.81 },
  "USA": { name: "USA", pele: 1810, gf: 2.69, ga: 0.86 },
  "Scotland": { name: "Scotland", pele: 1809.9, gf: 2.57, ga: 0.82 },
  "Algeria": { name: "Algeria", pele: 1794.1, gf: 2.56, ga: 0.89 },
  "Sweden": { name: "Sweden", pele: 1793.7, gf: 2.63, ga: 0.92 },
  "Czechia": { name: "Czechia", pele: 1773, gf: 2.43, ga: 0.95 },
  "Ivory Coast": { name: "Ivory Coast", pele: 1772.4, gf: 2.35, ga: 0.91 },
  "Australia": { name: "Australia", pele: 1765.3, gf: 2.28, ga: 0.91 },
  "Egypt": { name: "Egypt", pele: 1764.1, gf: 2.28, ga: 0.92 },
  "South Korea": { name: "South Korea", pele: 1763.5, gf: 2.24, ga: 0.9 },
  "DR Congo": { name: "DR Congo", pele: 1736.7, gf: 2.15, ga: 1 },
  "Panama": { name: "Panama", pele: 1736.3, gf: 2.18, ga: 1.02 },
  "Iran": { name: "Iran", pele: 1727.6, gf: 2.05, ga: 1 },
  "Uzbekistan": { name: "Uzbekistan", pele: 1711.6, gf: 2.05, ga: 1.09 },
  "Bosnia and Herzegovina": { name: "Bosnia and Herzegovina", pele: 1701.8, gf: 2.1, ga: 1.19 },
  "Tunisia": { name: "Tunisia", pele: 1701.5, gf: 1.9, ga: 1.05 },
  "Ghana": { name: "Ghana", pele: 1673, gf: 1.83, ga: 1.19 },
  "South Africa": { name: "South Africa", pele: 1670.7, gf: 1.74, ga: 1.14 },
  "Jordan": { name: "Jordan", pele: 1655.4, gf: 1.78, ga: 1.28 },
  "Iraq": { name: "Iraq", pele: 1648.6, gf: 1.67, ga: 1.23 },
  "New Zealand": { name: "New Zealand", pele: 1633.7, gf: 1.7, ga: 1.36 },
  "Saudi Arabia": { name: "Saudi Arabia", pele: 1630.9, gf: 1.57, ga: 1.27 },
  "Haiti": { name: "Haiti", pele: 1628.7, gf: 1.8, ga: 1.49 },
  "Cape Verde": { name: "Cape Verde", pele: 1624.5, gf: 1.52, ga: 1.27 },
  "Curacao": { name: "Curacao", pele: 1566.5, gf: 1.45, ga: 1.65 },
  "Qatar": { name: "Qatar", pele: 1545.9, gf: 1.43, ga: 1.81 },
};
