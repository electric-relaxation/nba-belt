export type GameId = string | number;

export type BeltGame = {
  gameId: GameId;
  startTimeUtc: string;
  homeTeamAbbr: string;
  awayTeamAbbr: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  isRegularSeason?: boolean;
};

export type BeltTransfer = {
  gameId: GameId;
  startTimeUtc: string;
  fromAbbr: string;
  toAbbr: string;
  homeAbbr: string;
  awayAbbr: string;
  homeScore: number;
  awayScore: number;
  winnerAbbr: string;
};

export type BeltResult = {
  currentHolderAbbr: string;
  transfers: BeltTransfer[];
  nextGame: BeltGame | null;
};

const completedStatuses = new Set(["final", "completed"]);

const isCompletedGame = (game: BeltGame): boolean => {
  if (game.status) {
    return completedStatuses.has(game.status.toLowerCase());
  }
  return typeof game.homeScore === "number" && typeof game.awayScore === "number";
};

const isRegularSeasonGame = (game: BeltGame): boolean => game.isRegularSeason !== false;

const byStartTimeThenId = (a: BeltGame, b: BeltGame): number => {
  const timeDiff = Date.parse(a.startTimeUtc) - Date.parse(b.startTimeUtc);
  if (timeDiff !== 0) {
    return timeDiff;
  }
  return String(a.gameId).localeCompare(String(b.gameId));
};

export const computeBelt = (
  games: BeltGame[],
  startingHolderAbbr: string,
  nowUtcIso: string,
): BeltResult => {
  const completedGames = games
    .filter((game) => isRegularSeasonGame(game) && isCompletedGame(game))
    .slice()
    .sort(byStartTimeThenId);

  let holder = startingHolderAbbr;
  const transfers: BeltTransfer[] = [];

  for (const game of completedGames) {
    const isHolderHome = game.homeTeamAbbr === holder;
    const isHolderAway = game.awayTeamAbbr === holder;

    if (!isHolderHome && !isHolderAway) {
      continue;
    }

    if (game.homeScore === null || game.awayScore === null) {
      continue;
    }

    const winnerAbbr =
      game.homeScore > game.awayScore ? game.homeTeamAbbr : game.awayTeamAbbr;

    if (winnerAbbr !== holder) {
      transfers.push({
        gameId: game.gameId,
        startTimeUtc: game.startTimeUtc,
        fromAbbr: holder,
        toAbbr: winnerAbbr,
        homeAbbr: game.homeTeamAbbr,
        awayAbbr: game.awayTeamAbbr,
        homeScore: game.homeScore,
        awayScore: game.awayScore,
        winnerAbbr,
      });
      holder = winnerAbbr;
    }
  }

  const nowMs = Date.parse(nowUtcIso);
  const holderGames = games.filter(
    (game) => game.homeTeamAbbr === holder || game.awayTeamAbbr === holder,
  );
  const inProgressGame =
    holderGames
      .filter(
        (game) => Date.parse(game.startTimeUtc) <= nowMs && !isCompletedGame(game),
      )
      .slice()
      .sort(byStartTimeThenId)[0] ?? null;
  const nextGame =
    inProgressGame ??
    holderGames
      .filter((game) => Date.parse(game.startTimeUtc) > nowMs)
      .slice()
      .sort(byStartTimeThenId)[0] ??
    null;

  return {
    currentHolderAbbr: holder,
    transfers,
    nextGame,
  };
};
