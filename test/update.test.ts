import { describe, expect, it } from 'vitest';
import { runUpdate } from '../src/update.ts';
import { fakeEspn, game, memoryStore, record } from './helpers.ts';

describe('runUpdate', () => {
  // The 2025 season (ESPN's 2026) is over: NYK won the Finals. The 2026 season opens Oct 20, 2026.
  const espn = () =>
    fakeEspn([
      game({ date: '2025-10-21T23:30:00Z', home: 'OKC', away: 'HOU', score: [125, 124], espnSeason: 2026 }),
      game({ date: '2026-04-15T23:30:00Z', home: 'GSW', away: 'MEM', score: [121, 116], espnSeason: 2026, type: 5 }),
      game({ date: '2026-06-14T00:30:00Z', home: 'SAS', away: 'NYK', score: [90, 94], espnSeason: 2026, type: 3, nbaFinals: true }),
      game({ date: '2026-10-03T23:00:00Z', home: 'NYK', away: 'BOS', score: [100, 90], espnSeason: 2027, type: 1 }),
      game({ date: '2026-10-20T23:30:00Z', home: 'NYK', away: 'CLE', espnSeason: 2027 }),
      game({ date: '2027-01-15T00:30:00Z', home: 'NYK', away: 'MIA', espnSeason: 2027 }),
    ]);
  const finished2025 = record('OKC', '20260415', {
    status: 'final',
    defenses: 40,
    startedAt: '2025-10-21T23:30:00.000Z',
  });

  it('keeps the finished season during the offseason, refreshing only its timestamp', async () => {
    const store = memoryStore(2025, finished2025);
    const rec = await runUpdate(store, espn().fetchDay, new Date('2026-09-26T16:00:00Z'));
    expect(rec).toEqual({ ...finished2025, updatedAt: '2026-09-26T16:00:00.000Z' });
    expect(await store.trackedSeason()).toBe(2025);
  });

  it("starts the new season on opening day with last season's champion holding the belt", async () => {
    const store = memoryStore(2025, finished2025);
    const rec = await runUpdate(store, espn().fetchDay, new Date('2026-10-20T12:00:00Z'));
    expect(rec).toMatchObject({ season: 2026, startingHolder: 'NYK', holder: 'NYK', status: 'in_progress' });
    expect(rec.nextGame).toMatchObject({ home: 'NYK', away: 'CLE' });
    expect(await store.trackedSeason()).toBe(2026);
    expect(await store.getRecord(2026)).toEqual(rec);
    expect((await store.getRecord(2025))?.status).toBe('final');
  });

  it("doesn't start the new season during its preseason", async () => {
    const store = memoryStore(2025, finished2025);
    await runUpdate(store, espn().fetchDay, new Date('2026-10-04T12:00:00Z'));
    expect(await store.trackedSeason()).toBe(2025);
  });
});
