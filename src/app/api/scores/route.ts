import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { parseBracketData } from '@/lib/bracketData';
import { fetchLiveScores, fetchScoresByDate, fetchGroupStandings } from '@/lib/espnSync';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') ?? 'scores';
  const date = searchParams.get('date'); // YYYYMMDD

  const db = getDb();
  const row = db.prepare('SELECT bracket_data FROM tournaments ORDER BY year DESC LIMIT 1').get() as
    | { bracket_data: string }
    | undefined;

  if (!row || !row.bracket_data || row.bracket_data === '{}') {
    return NextResponse.json({ ok: false, error: 'No tournament data' }, { status: 404 });
  }

  const bracketData = parseBracketData(row.bracket_data);

  if (type === 'standings') {
    const standings = await fetchGroupStandings(bracketData);
    return NextResponse.json({ ok: true, standings });
  }

  // When a date is provided, fetch fixtures for that specific day.
  // Otherwise default to ESPN's "current" scoreboard (which only returns today/live).
  const games = date
    ? await fetchScoresByDate(bracketData, date)
    : await fetchLiveScores(bracketData);
  return NextResponse.json({ ok: true, games });
}
