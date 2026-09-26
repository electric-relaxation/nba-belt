import { describe, expect, it } from 'vitest';
import { applyResult, holderGame, isBeltGame } from '../src/belt.ts';
import { game, record, type GameSpec } from './helpers.ts';

const played: GameSpec = { date: '2025-11-01T23:30:00Z', home: 'OKC', away: 'HOU', score: [100, 90] };

describe('isBeltGame', () => {
  it.each<[string, Partial<GameSpec>, boolean]>([
    ['regular-season game', {}, true],
    ['preseason game', { type: 1 }, false],
    ['play-in game', { type: 5 }, false],
    ['playoff game', { type: 3 }, false],
    ['NBA Cup final', { cupFinal: true }, false],
    ["another season's game", { espnSeason: 2025 }, false],
    ['All-Star game (not NBA teams)', { home: null, away: null }, false],
  ])('%s', (_, spec, expected) => {
    expect(isBeltGame(game({ ...played, ...spec }), 2025)).toBe(expected);
  });
});

describe('holderGame', () => {
  it("finds the holder's game and skips postponed ones", () => {
    const games = [
      game({ ...played, home: 'BOS', away: 'NYK' }),
      game({ ...played, home: 'OKC', away: 'MIN', score: undefined, postponed: true }),
    ];
    expect(holderGame(games, record('OKC', '20251101'))).toBeUndefined();
    expect(holderGame(games, record('NYK', '20251101'))?.home.team).toBe('BOS');
  });
});

describe('applyResult', () => {
  it('counts a holder win as a defense', () => {
    const rec = record('OKC', '20251101');
    applyResult(rec, game(played));
    expect(rec).toMatchObject({ holder: 'OKC', defenses: 1, transfers: [] });
  });

  it('hands the belt to the team that beats the holder', () => {
    const rec = record('HOU', '20251101', { defenses: 3 });
    applyResult(rec, game(played));
    expect(rec.holder).toBe('OKC');
    expect(rec.defenses).toBe(0);
    expect(rec.transfers).toEqual([
      {
        gameId: expect.any(String),
        date: '2025-11-01T23:30:00.000Z',
        home: { team: 'OKC', score: 100 },
        away: { team: 'HOU', score: 90 },
        from: 'HOU',
        to: 'OKC',
      },
    ]);
  });
});
