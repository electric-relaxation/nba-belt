import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isBeltGame } from '../src/belt.ts';
import { parseScoreboard } from '../src/espn.ts';

// Trimmed real ESPN responses.
const fixture = (date: string) =>
  JSON.parse(readFileSync(new URL(`fixtures/scoreboard-${date}.json`, import.meta.url), 'utf8'));
const parse = (date: string) => parseScoreboard(fixture(date));

describe('parseScoreboard', () => {
  it('reads games, scores, winners and the season calendar', () => {
    const day = parse('20250110');
    expect(day.espnSeason).toBe(2025);
    expect(day.calendar).toEqual(['20241004', '20241005', '20250619', '20250622']);
    expect(day.games).toHaveLength(7);
    expect(day.games[0]).toEqual({
      id: '401705091',
      date: '2025-01-11T00:00:00.000Z',
      espnSeason: 2025,
      seasonType: 2,
      cupFinal: false,
      nbaFinals: false,
      home: { team: 'IND', score: 108, winner: true },
      away: { team: 'GSW', score: 96, winner: false },
      state: 'post',
      final: true,
      postponed: false,
      detail: 'Final',
    });
    expect(day.games.every((g) => isBeltGame(g, 2024))).toBe(true);
  });

  it.each(['20231209', '20241217'])('flags the NBA Cup final on %s, which does not count', (date) => {
    const [cupFinal] = parse(date).games;
    expect(cupFinal.seasonType).toBe(2); // ESPN files it under the regular season...
    expect(cupFinal.cupFinal).toBe(true); // ...so we have to spot it ourselves.
    expect(isBeltGame(cupFinal, cupFinal.espnSeason - 1)).toBe(false);
  });

  it('marks postponed games', () => {
    const postponed = parse('20250111').games.filter((g) => g.postponed);
    expect(postponed.map((g) => `${g.away.team}@${g.home.team}`)).toEqual(['HOU@ATL', 'SAS@LAL', 'CHA@LAC']);
    expect(postponed.every((g) => !g.final)).toBe(true);
  });

  it('labels play-in and Finals games', () => {
    expect(parse('20250415').games.map((g) => g.seasonType)).toEqual([5, 5]);
    const [game7] = parse('20250622').games;
    expect(game7).toMatchObject({ seasonType: 3, nbaFinals: true, home: { team: 'OKC', winner: true } });
  });

  it("doesn't treat All-Star teams as NBA teams", () => {
    const allStar = parse('20250216').games;
    expect(allStar.length).toBeGreaterThan(0);
    expect(allStar.every((g) => g.home.team === null && !isBeltGame(g, 2024))).toBe(true);
  });

  it('reads a live game', () => {
    const json = fixture('20250110');
    const comp = json.events[0].competitions[0];
    comp.status.type = { name: 'STATUS_IN_PROGRESS', state: 'in', completed: false, shortDetail: '5:32 - 3rd' };
    comp.competitors.forEach((c: { winner?: boolean }) => delete c.winner);
    const [live] = parseScoreboard(json).games;
    expect(live).toMatchObject({ state: 'in', final: false, detail: '5:32 - 3rd', home: { score: 108 } });
  });
});
