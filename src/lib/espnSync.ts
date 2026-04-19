import { BracketData, LiveGame } from '@/types';
import { getTeamByEspnId } from '@/lib/bracketData';

const SCOREBOARD_URL =
  'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';
const STANDINGS_URL =
  'https://site.api.espn.com/apis/v2/sports/soccer/fifa.world/standings';

export interface GroupStanding {
  team: string;
  espnId: number;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  goalDifference: number;
  gamesPlayed: number;
}

export interface GroupTable {
  groupName: string;
  standings: GroupStanding[];
}

function resolveTeamName(
  espnId: number,
  fallbackName: string,
  bracketData: BracketData,
): string {
  const team = getTeamByEspnId(bracketData, espnId);
  return team ? team.name : fallbackName;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function parseCompetitor(c: any): { espnId: number; name: string; score: string; logo: string } {
  return {
    espnId: parseInt(c.id ?? '0', 10),
    name: c.team?.displayName ?? c.team?.name ?? 'TBD',
    score: c.score ?? '0',
    logo: c.team?.logo ?? '',
  };
}

export async function fetchLiveScores(bracketData: BracketData): Promise<LiveGame[]> {
  const res = await fetch(SCOREBOARD_URL, { next: { revalidate: 30 } });
  if (!res.ok) return [];
  const data = await res.json();
  const events: any[] = data.events ?? [];

  return events.map((event: any) => {
    const competition = event.competitions?.[0];
    const status = competition?.status ?? event.status ?? {};
    const competitors = competition?.competitors ?? [];

    const home = competitors.find((c: any) => c.homeAway === 'home') ?? competitors[0];
    const away = competitors.find((c: any) => c.homeAway === 'away') ?? competitors[1];

    const homeParsed = parseCompetitor(home ?? {});
    const awayParsed = parseCompetitor(away ?? {});

    return {
      id: String(event.id ?? ''),
      name: event.name ?? '',
      status: status.type?.description ?? '',
      detail: status.type?.detail ?? status.detail ?? '',
      state: status.type?.state ?? '',
      clock: status.displayClock ?? '',
      period: status.period ?? 0,
      home: {
        name: resolveTeamName(homeParsed.espnId, homeParsed.name, bracketData),
        score: homeParsed.score,
        logo: homeParsed.logo,
      },
      away: {
        name: resolveTeamName(awayParsed.espnId, awayParsed.name, bracketData),
        score: awayParsed.score,
        logo: awayParsed.logo,
      },
    };
  });
}

function parseStat(stats: any[], name: string): number {
  const stat = stats?.find((s: any) => s.name === name || s.abbreviation === name);
  return stat ? parseInt(stat.value ?? '0', 10) : 0;
}

export async function fetchGroupStandings(
  bracketData: BracketData,
): Promise<GroupTable[]> {
  const res = await fetch(STANDINGS_URL, { next: { revalidate: 60 } });
  if (!res.ok) return [];
  const data = await res.json();
  const children: any[] = data.children ?? [];

  return children.map((child: any) => {
    const groupName = (child.name ?? child.abbreviation ?? '').replace('Group ', '');
    const entries: any[] = child.standings?.entries ?? [];

    const standings: GroupStanding[] = entries.map((entry: any) => {
      const espnId = parseInt(entry.team?.id ?? '0', 10);
      const stats: any[] = entry.stats ?? [];
      return {
        team: resolveTeamName(espnId, entry.team?.displayName ?? 'TBD', bracketData),
        espnId,
        points: parseStat(stats, 'points'),
        wins: parseStat(stats, 'wins'),
        draws: parseStat(stats, 'draws') || parseStat(stats, 'ties'),
        losses: parseStat(stats, 'losses'),
        goalDifference: parseStat(stats, 'goalDifference') || parseStat(stats, 'pointDifferential'),
        gamesPlayed: parseStat(stats, 'gamesPlayed'),
      };
    });

    return { groupName, standings };
  });
}
/* eslint-enable @typescript-eslint/no-explicit-any */
