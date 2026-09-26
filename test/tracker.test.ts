import { describe, expect, it } from 'vitest';
import { advanceSeason, newSeasonRecord } from '../src/tracker.ts';
import { fakeEspn, game, record, type GameSpec } from './helpers.ts';

// Times are UTC: a 7:30pm EDT tip-off is 23:30Z.

describe('advanceSeason', () => {
  it('counts wins as defenses and hands the belt to whoever beats the holder', async () => {
    const espn = fakeEspn([
      game({ date: '2025-10-21T23:30:00Z', home: 'OKC', away: 'HOU', score: [125, 124] }), // defense
      game({ date: '2025-10-23T23:30:00Z', home: 'DEN', away: 'OKC', score: [120, 110] }), // DEN takes it
      game({ date: '2025-10-23T23:30:00Z', home: 'BOS', away: 'NYK', score: [100, 90] }), // not the holder
      game({ date: '2025-10-24T23:30:00Z', home: 'DEN', away: 'LAL', score: [99, 101] }), // LAL takes it
      game({ date: '2025-10-26T22:00:00Z', home: 'LAL', away: 'PHX' }),
    ]);
    const rec = await advanceSeason(record('OKC', '20251021'), {
      fetchDay: espn.fetchDay,
      now: new Date('2025-10-25T16:00:00Z'),
    });
    expect(rec.holder).toBe('LAL');
    expect(rec.transfers.map((t) => `${t.from}->${t.to}`)).toEqual(['OKC->DEN', 'DEN->LAL']);
    expect(rec.transfers[1]).toMatchObject({ home: { team: 'DEN', score: 99 }, away: { team: 'LAL', score: 101 } });
    expect(rec.defenses).toBe(0);
    expect(rec.nextGame).toEqual({ gameId: expect.any(String), date: '2025-10-26T22:00:00.000Z', home: 'LAL', away: 'PHX' });
    expect(rec.status).toBe('in_progress');
    expect(rec.startedAt).toBe('2025-10-21T23:30:00.000Z');
    expect(rec.updatedAt).toBe('2025-10-25T16:00:00.000Z');
  });

  it('ignores preseason, postponed, NBA Cup final, play-in and playoff games', async () => {
    const espn = fakeEspn([
      game({ date: '2025-10-10T23:30:00Z', home: 'HOU', away: 'OKC', score: [130, 100], type: 1 }),
      game({ date: '2025-10-21T23:30:00Z', home: 'OKC', away: 'HOU', score: [125, 124] }),
      game({ date: '2025-11-05T00:30:00Z', home: 'MIN', away: 'OKC', postponed: true }),
      game({ date: '2025-12-17T01:30:00Z', home: 'SAS', away: 'OKC', score: [113, 100], cupFinal: true }),
      game({ date: '2026-04-12T23:30:00Z', home: 'OKC', away: 'UTA', score: [120, 100] }),
      game({ date: '2026-04-15T23:30:00Z', home: 'GSW', away: 'MEM', score: [121, 116], type: 5 }),
      game({ date: '2026-04-19T23:30:00Z', home: 'OKC', away: 'MEM', score: [100, 110], type: 3 }),
    ]);
    const rec = await advanceSeason(record('OKC', '20251010'), {
      fetchDay: espn.fetchDay,
      now: new Date('2026-05-01T12:00:00Z'),
      maxFetches: Infinity,
    });
    expect(rec).toMatchObject({ holder: 'OKC', transfers: [], defenses: 2, status: 'final', nextGame: null });
  });

  it('stops at a live holder game and reports the score', async () => {
    const espn = fakeEspn([
      game({ date: '2025-10-21T23:30:00Z', home: 'OKC', away: 'HOU', score: [58, 60], state: 'in', detail: '5:32 - 3rd' }),
      game({ date: '2025-10-23T23:30:00Z', home: 'DEN', away: 'OKC' }),
    ]);
    const rec = await advanceSeason(record('OKC', '20251021'), {
      fetchDay: espn.fetchDay,
      now: new Date('2025-10-22T01:00:00Z'),
    });
    expect(rec.cursor).toBe('20251021');
    expect(rec.holder).toBe('OKC');
    expect(rec.nextGame).toMatchObject({ home: 'OKC', away: 'HOU', live: { homeScore: 58, awayScore: 60, detail: '5:32 - 3rd' } });
  });

  it('keeps following a late game past midnight Eastern, then counts it', async () => {
    const late: GameSpec = { date: '2025-10-22T02:30:00Z', home: 'LAL', away: 'OKC' }; // 10:30pm EDT Oct 21
    const next: GameSpec = { date: '2025-10-23T23:30:00Z', home: 'LAL', away: 'SAC' };
    const live = fakeEspn([game({ ...late, score: [90, 88], state: 'in', detail: '1:02 - 4th' }), game(next)]);
    let rec = await advanceSeason(record('OKC', '20251021'), {
      fetchDay: live.fetchDay,
      now: new Date('2025-10-22T04:40:00Z'), // 12:40am EDT Oct 22
    });
    expect(rec.cursor).toBe('20251021');
    expect(rec.nextGame?.live?.detail).toBe('1:02 - 4th');

    const finished = fakeEspn([game({ ...late, score: [101, 99] }), game(next)]);
    rec = await advanceSeason(rec, { fetchDay: finished.fetchDay, now: new Date('2025-10-22T05:10:00Z') });
    expect(rec.holder).toBe('LAL');
    expect(rec.nextGame).toMatchObject({ home: 'LAL', away: 'SAC' });
    expect(rec.nextGame?.live).toBeUndefined();
  });

  it('picks up where it left off when a run hits its fetch limit', async () => {
    const games = [
      game({ date: '2025-10-21T23:30:00Z', home: 'OKC', away: 'HOU', score: [100, 90] }),
      game({ date: '2025-10-22T23:30:00Z', home: 'BOS', away: 'NYK', score: [100, 90] }),
      game({ date: '2025-10-23T23:30:00Z', home: 'DEN', away: 'OKC', score: [120, 110] }),
      game({ date: '2025-10-24T23:30:00Z', home: 'DEN', away: 'LAL', score: [99, 101] }),
      game({ date: '2025-10-25T23:30:00Z', home: 'LAL', away: 'PHX', score: [99, 101] }),
      game({ date: '2025-10-27T23:30:00Z', home: 'PHX', away: 'SAC' }),
    ];
    const now = new Date('2025-10-26T16:00:00Z');
    const { fetchDay } = fakeEspn(games);

    let rec = await advanceSeason(record('OKC', '20251021'), { fetchDay, now, maxFetches: 2 });
    expect(rec.cursor).toBe('20251023');
    for (let i = 0; i < 4; i++) rec = await advanceSeason(rec, { fetchDay, now, maxFetches: 2 });

    const inOneGo = await advanceSeason(record('OKC', '20251021'), { fetchDay, now, maxFetches: Infinity });
    expect(rec).toEqual(inOneGo);
    expect(rec.holder).toBe('PHX');
    expect(rec.nextGame).toMatchObject({ home: 'PHX', away: 'SAC' });
  });

  it("isn't final until every game on the last night of the regular season has finished", async () => {
    const lastNight = (other: Partial<GameSpec>) =>
      fakeEspn([
        game({ date: '2026-04-12T19:00:00Z', home: 'OKC', away: 'UTA', score: [120, 100] }),
        game({ date: '2026-04-12T23:30:00Z', home: 'BOS', away: 'NYK', ...other }),
        game({ date: '2026-04-15T23:30:00Z', home: 'GSW', away: 'MEM', score: [121, 116], type: 5 }),
      ]);
    const during = await advanceSeason(record('OKC', '20260412'), {
      fetchDay: lastNight({ score: [50, 48], state: 'in' }).fetchDay,
      now: new Date('2026-04-13T00:30:00Z'),
    });
    expect(during).toMatchObject({ status: 'in_progress', nextGame: null, defenses: 1 });

    const after = await advanceSeason(during, {
      fetchDay: lastNight({ score: [100, 98] }).fetchDay,
      now: new Date('2026-04-13T02:30:00Z'),
    });
    expect(after.status).toBe('final');
  });

  it("doesn't call a season final before it has started", async () => {
    const espn = fakeEspn([
      game({ date: '2025-10-02T23:00:00Z', home: 'NYK', away: 'PHI', type: 1 }),
      game({ date: '2025-10-04T23:00:00Z', home: 'OKC', away: 'CHA', type: 1 }),
    ]);
    const rec = await advanceSeason(record('OKC', '20251002'), {
      fetchDay: espn.fetchDay,
      now: new Date('2025-09-26T12:00:00Z'),
    });
    expect(rec).toMatchObject({ status: 'in_progress', startedAt: null, nextGame: null });
  });

  it('skips a holder game ESPN never marked as played', async () => {
    const espn = fakeEspn([
      game({ date: '2025-11-01T23:30:00Z', home: 'OKC', away: 'NOP' }),
      game({ date: '2025-11-05T00:30:00Z', home: 'OKC', away: 'SAC', score: [90, 100] }),
    ]);
    const rec = await advanceSeason(record('OKC', '20251101'), {
      fetchDay: espn.fetchDay,
      now: new Date('2025-11-06T12:00:00Z'),
    });
    expect(rec.holder).toBe('SAC');
  });
});

describe('newSeasonRecord', () => {
  const seasons = [
    game({ date: '2024-10-22T23:30:00Z', home: 'BOS', away: 'NYK', score: [132, 109], espnSeason: 2025 }),
    game({ date: '2025-06-23T00:00:00Z', home: 'OKC', away: 'IND', score: [103, 91], espnSeason: 2025, type: 3, nbaFinals: true }),
    game({ date: '2025-10-02T23:00:00Z', home: 'NYK', away: 'PHI', score: [99, 90], espnSeason: 2026, type: 1 }),
    game({ date: '2025-10-21T23:30:00Z', home: 'OKC', away: 'HOU', espnSeason: 2026 }),
  ];

  it("gives the belt to last season's champion and starts at the first game date", async () => {
    const rec = await newSeasonRecord(2025, fakeEspn(seasons).fetchDay, new Date('2025-10-01T12:00:00Z'));
    expect(rec).toMatchObject({ season: 2025, startingHolder: 'OKC', holder: 'OKC', cursor: '20251002', transfers: [] });
  });

  it("refuses to guess when last season's Finals result is missing", async () => {
    const withoutFinals = seasons.filter((g) => !g.nbaFinals);
    await expect(newSeasonRecord(2025, fakeEspn(withoutFinals).fetchDay, new Date())).rejects.toThrow(/NBA Finals/);
  });
});
