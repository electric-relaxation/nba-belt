// The belt rules.
//  1. The belt starts the season with last season's NBA champion.
//  2. It changes hands only when the holder loses a completed regular-season game.
// Preseason, play-in, playoff and NBA Cup final games don't count, nor do postponed or canceled ones.

import type { Game, NextGame, SeasonRecord, TeamCode } from './types.ts';

/** A regular-season game of this season between two NBA teams. The NBA Cup final doesn't count. */
export function isBeltGame(game: Game, season: number): boolean {
  return (
    game.seasonType === 2 &&
    game.espnSeason === season + 1 &&
    !game.cupFinal &&
    game.home.team !== null &&
    game.away.team !== null
  );
}

/** The holder's belt game among one day's games, ignoring postponed and canceled games. */
export function holderGame(games: Game[], record: SeasonRecord): Game | undefined {
  return games.find(
    (g) => isBeltGame(g, record.season) && !g.postponed && involves(g, record.holder),
  );
}

function involves(game: Game, team: TeamCode): boolean {
  return game.home.team === team || game.away.team === team;
}

/**
 * Counts a completed holder game (mutates `record`).
 * A win is a successful defense; a loss hands the belt to the winner.
 */
export function applyResult(record: SeasonRecord, game: Game): void {
  const holderIsHome = game.home.team === record.holder;
  const holder = holderIsHome ? game.home : game.away;
  const opponent = holderIsHome ? game.away : game.home;
  if (holder.winner) {
    record.defenses += 1;
    return;
  }
  const newHolder = opponent.team as TeamCode;
  record.transfers.push({
    gameId: game.id,
    date: game.date,
    home: { team: game.home.team as TeamCode, score: game.home.score ?? 0 },
    away: { team: game.away.team as TeamCode, score: game.away.score ?? 0 },
    from: record.holder,
    to: newHolder,
  });
  record.holder = newHolder;
  record.defenses = 0;
}

export function toNextGame(game: Game): NextGame {
  const next: NextGame = {
    gameId: game.id,
    date: game.date,
    home: game.home.team as TeamCode,
    away: game.away.team as TeamCode,
  };
  if (game.state === 'in') {
    next.live = { homeScore: game.home.score ?? 0, awayScore: game.away.score ?? 0, detail: game.detail };
  }
  return next;
}
