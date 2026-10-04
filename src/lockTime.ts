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

/**
 * Sunday night is the latest Sunday kickoff. Monday night is the week's
 * Monday game. A week with anything other than one Monday game has no
 * single Monday night game, so this returns null for that side.
 */
export function primetimeGames<T extends TimedGame>(weekGames: T[]): { snf: T | null; mnf: T | null } {
  let snf: T | null = null;
  const monday: T[] = [];
  weekGames.forEach((g) => {
    if (g.timeTBD || !g.gameTime) return;
    const kickoff = g.gameTime;
    const day = etWeekday(kickoff);
    if (day === "Sun" && (!snf?.gameTime || kickoff > snf.gameTime)) snf = g;
    if (day === "Mon") monday.push(g);
  });
  return { snf, mnf: monday.length === 1 ? monday[0] : null };
}
