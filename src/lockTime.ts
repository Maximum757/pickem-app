/**
 * Monday Night Football locks when Sunday Night Football does, so the last
 * two games and the tiebreaker are visible Sunday night. Any other game
 * locks at its own kickoff.
 */

type TimedGame = { gameTime: Date | null; timeTBD: boolean };

function etWeekday(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(date);
}

export function effectiveLockTime(game: TimedGame, weekGames: TimedGame[]): Date | null {
  if (game.timeTBD || !game.gameTime) return null;
  if (etWeekday(game.gameTime) !== "Mon") return game.gameTime;

  let latestSunday: Date | null = null;
  weekGames.forEach((g) => {
    if (g.timeTBD || !g.gameTime || etWeekday(g.gameTime) !== "Sun") return;
    if (!latestSunday || g.gameTime > latestSunday) latestSunday = g.gameTime;
  });
  return latestSunday ?? game.gameTime;
}

export function isPastLock(game: TimedGame, weekGames: TimedGame[], now: Date): boolean {
  const lockAt = effectiveLockTime(game, weekGames);
  return !!lockAt && lockAt <= now;
}
