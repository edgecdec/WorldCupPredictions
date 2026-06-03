import { NextResponse } from 'next/server';
import { syncEspnResults } from '@/lib/syncResults';

/**
 * Public auto-sync endpoint. Pulls latest ESPN data and updates the
 * tournament's results_data with any newly-completed matches.
 * Debounced server-side to avoid hammering ESPN.
 */
export async function POST() {
  try {
    const result = await syncEspnResults();
    return NextResponse.json(result);
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Sync failed' },
      { status: 500 },
    );
  }
}
