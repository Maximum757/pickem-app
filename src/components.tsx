/**
 * React Components for Pick 'Em App
 */

import React, { useState, useEffect } from "react";
import { useLeague } from "./LeagueContext";
import { useAuth } from "./AuthContext";
import { getTeamColor, getTeamDisplayName, getTeamLogoUrl } from "./teamColors";
import * as firebaseUtils from "./firebase-utils";
import * as schema from "./firestore-schema";

// Shared kickoff-time formatter — every place a game's time gets displayed
// uses this, so they can't drift out of sync with each other. Explicit
// options rather than a bare toLocaleString() because the default includes
// seconds, which is just noise for a kickoff time nobody needs to the
// second.
// Games are always discussed/scheduled in Eastern time regardless of who's
// looking — explicitly pinning the timezone here means this can't silently
// drift 4-5 hours off if a viewer's device happens to be set to a
// different timezone (which is exactly what was happening before this: no
// timeZone override meant it fell back to whatever the device reported,
// UTC included).
function formatKickoff(date: Date): string {
  return (
    date.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/New_York",
    }) + " ET"
  );
}

function finalScoreLine(game: schema.UIGame): string | null {
  const r = game.result;
  if (!r) return null;
  const hasScore = (r.winnerScore || 0) > 0 || (r.loserScore || 0) > 0;
  if (!hasScore) return `Final · ${r.winner}`;
  const awayScore = r.winner === game.awayTeam ? r.winnerScore : r.loserScore;
  const homeScore = r.winner === game.homeTeam ? r.winnerScore : r.loserScore;
  return `Final · ${game.awayTeam} ${awayScore}–${homeScore} ${game.homeTeam}`;
}

function gameTimeOrScoreLabel(game: schema.UIGame): string {
  const finalLine = finalScoreLine(game);
  if (finalLine) return finalLine;
  if (game.live) {
    const clock = game.live.detail ? ` · ${game.live.detail}` : "";
    return `${game.awayTeam} ${game.live.awayScore}–${game.live.homeScore} ${game.homeTeam}${clock}`;
  }
  if (game.timeTBD || !game.gameTime) return "Time TBD";
  return formatKickoff(new Date(game.gameTime));
}

// React only re-runs a component's render when something actually triggers
// it — a state change, a prop change, user interaction. A plain `new
// Date()` inline in a render is only ever as fresh as the last render, so
// a "locks at kickoff" check silently goes stale the moment nobody's
// touched the page since before kickoff, even though the underlying logic
// is correct. This hook forces a re-render on an interval so any
// kickoff-time comparison downstream of it naturally catches up on its
// own, without requiring the user to click something or reload.
function useNow(intervalMs: number = 30000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

// ============================================================================
// PICKS SCREEN - Player picks entry
// ============================================================================
//
// Ported from the approved chat mockups: colored team tiles, a status circle
// between them (VS -> colored VS once picked -> lock icon once closed ->
// points-earned or X once final), gold/grey/green/red pick borders, bold
// text throughout, and no submit button anywhere — every tap autosaves.

function PickTile({
  abbr,
  isPicked,
  showColor,
  isClickable,
  borderClass,
  subtext,
  showLogo,
  onClick,
}: {
  abbr: string;
  isPicked: boolean;
  showColor: boolean;
  isClickable: boolean;
  borderClass: string;
  subtext: string;
  showLogo: boolean;
  onClick: () => void;
}) {
  const colors = getTeamColor(abbr);
  // Only the team you actually picked shows its real color+border. The one
  // you didn't pick greys out — same plain look every tile had before
  // colors existed, so the picked one stays the only thing drawing the eye.
  const bg = showColor ? colors.bg : "#e5e7eb";
  const fg = showColor ? colors.fg : "#6b7280";
  const logoUrl = showLogo ? getTeamLogoUrl(abbr) : null; // null for Week 0's college teams either way
  const [logoFailed, setLogoFailed] = useState(false);
  return (
    <div
      onClick={isClickable ? onClick : undefined}
      className={`flex-1 rounded-md px-2 py-2.5 text-center font-bold select-none ${borderClass} ${
        isClickable ? "cursor-pointer" : "cursor-not-allowed"
      }`}
      style={{ background: bg, color: fg, border: "5px solid transparent" }}
    >
      {logoUrl && !logoFailed ? (
        <div className="flex flex-col items-center gap-1">
          <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center p-1.5">
            <img
              src={logoUrl}
              alt={getTeamDisplayName(abbr)}
              className="w-full h-full object-contain"
              style={{ filter: showColor ? "none" : "grayscale(1) opacity(0.6)" }}
              onError={() => setLogoFailed(true)}
            />
          </div>
          <div className="text-xs font-medium opacity-90">{subtext}</div>
        </div>
      ) : (
        <>
          <div className="font-extrabold text-[15px] leading-tight">{getTeamDisplayName(abbr)}</div>
          <div className="text-xs font-medium opacity-90 mt-0.5">{subtext}</div>
        </>
      )}
    </div>
  );
}

function StatusCircle({
  game,
  picked,
}: {
  game: ReturnType<typeof useLeague>["games"][number];
  picked: string | undefined;
}) {
  const { userPickResults } = useLeague();
  const now = useNow();
  const isFinal = !!game.result;
  // Same real-time-vs-stale-field issue as the results-entry screen — a
  // game whose kickoff has passed should show as locked here too, not
  // just once something explicitly flips the isLocked field. useNow()
  // keeps this live rather than only ever as fresh as the last render.
  const isPastKickoff = !game.timeTBD && !!game.gameTime && new Date(game.gameTime) <= now;
  const isLocked = (game.isLocked || isPastKickoff) && !isFinal;

  if (isLocked) {
    return (
      <div className="w-9 h-9 rounded-full border-2 border-gray-400 bg-gray-100 flex items-center justify-center text-base flex-shrink-0">
        🔒
      </div>
    );
  }

  if (isFinal) {
    const result = game.result!;
    const won = picked === result.winner;
    return (
      <div
        className={`w-9 h-9 rounded-full border-2 flex items-center justify-center text-sm font-bold flex-shrink-0 ${
          won ? "border-green-600 bg-green-50 text-green-700" : "border-red-600 bg-red-50 text-red-700"
        }`}
      >
        {won ? userPickResults[game.id]?.pointsAwarded ?? "✓" : "✕"}
      </div>
    );
  }

  // Open: neutral VS, or colored to the pick once one's made
  const colors = picked ? getTeamColor(picked) : null;
  return (
    <div
      className="w-9 h-9 rounded-full border-2 flex items-center justify-center text-xs font-bold flex-shrink-0"
      style={
        colors
          ? { background: colors.bg, color: colors.fg, borderColor: colors.bg }
          : { borderColor: "#9ca3af", color: "#6b7280" }
      }
    >
      VS
    </div>
  );
}

// Shared week selector — used on every player-facing screen that's scoped
// to one week (Picks, My Summary, Weekly Summary). Browsing to a different
// week here is purely local UI state (setCurrentWeek), separate from the
// commissioner's advanceToWeek() action that changes what week the league
// opens to by default for everyone — one player poking around Week 3 never
// affects what anyone else sees.
function WeekSelector({
  currentWeek,
  officialWeek,
  onChange,
  children,
}: {
  currentWeek: number;
  officialWeek: number | undefined;
  onChange: (week: number) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 mb-3">
      <select
        value={currentWeek}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="border rounded px-2 py-1 text-sm font-semibold shrink-0"
      >
        {Array.from({ length: 18 }, (_, i) => i + 1).map((w) => (
          <option key={w} value={w}>
            Week {w}
          </option>
        ))}
      </select>
      {officialWeek !== undefined && currentWeek !== officialWeek && (
        <button
          onClick={() => onChange(officialWeek)}
          className="text-xs text-blue-600 font-medium hover:underline shrink-0 mt-1.5"
        >
          Back to current week
        </button>
      )}
      {children}
    </div>
  );
}

export function PicksScreen() {
  const {
    games,
    userPicks,
    userPickResults,
    currentWeek,
    setCurrentWeek,
    league,
    loading,
    submitSinglePick,
    tiebreakerQuestion,
    tiebreakerRule,
    tiebreakerAnswer,
    tiebreakerLocked,
    myTiebreakerGuess,
    submitMyTiebreakerGuess,
    weeklyLeader,
    leagueMaxWeeklyPoints,
    playerId,
    leagueId,
    isCommissioner,
    myWeekLocked,
    setMyWeekLocked,
  } = useLeague();
  const now = useNow();
  const [tbDraft, setTbDraft] = useState<string>(myTiebreakerGuess?.toString() ?? "");
  const [visibleWeekPicks, setVisibleWeekPicks] = useState<schema.PickDoc[]>([]);
  // Per-device preference, not per-account — a shared family tablet stays
  // in logo mode across whoever's signed in, which is the actual use case
  // (a parent picks once, a kid uses the same device later).
  const [showLogos, setShowLogos] = useState<boolean>(
    () => localStorage.getItem("pickem-show-logos") === "true"
  );
  const toggleLogos = () => {
    setShowLogos((prev) => {
      localStorage.setItem("pickem-show-logos", String(!prev));
      return !prev;
    });
  };
  const [tbSaved, setTbSaved] = useState(false);

  React.useEffect(() => {
    if (!leagueId || !playerId) return;
    (async () => {
      try {
        setVisibleWeekPicks(
          await firebaseUtils.getVisiblePicksForWeek(leagueId, currentWeek, playerId)
        );
      } catch {
        setVisibleWeekPicks([]);
      }
    })();
  }, [leagueId, playerId, currentWeek]);

  const countsFromVisiblePicks = new Map<string, { [team: string]: number }>();
  visibleWeekPicks.forEach((p) => {
    if (!countsFromVisiblePicks.has(p.gameId)) countsFromVisiblePicks.set(p.gameId, {});
    const byTeam = countsFromVisiblePicks.get(p.gameId)!;
    byTeam[p.pickedTeam] = (byTeam[p.pickedTeam] || 0) + 1;
  });

  const handlePick = (gameId: string, team: string) => {
    if (myWeekLocked) return;
    submitSinglePick(gameId, team);
  };

  const handleTiebreakerBlur = () => {
    if (tiebreakerLocked) return;
    const val = parseFloat(tbDraft);
    if (!isNaN(val) && val !== myTiebreakerGuess) {
      submitMyTiebreakerGuess(val);
      setTbSaved(true);
      setTimeout(() => setTbSaved(false), 1500);
    }
  };

  if (loading) return <div className="p-4">Loading...</div>;

  // How many games this player has actually picked vs. the full slate, and
  // how they're doing on the ones that have gone final so far — shown as a
  // quick-glance badge rather than making someone scroll the whole list to
  // find out.
  const picksMade = games.filter((g) => !!userPicks[g.id]).length;
  const totalGames = games.length;
  const picksComplete = totalGames > 0 && picksMade === totalGames;
  const weeklyCorrect = games.filter((g) => userPickResults[g.id]?.isCorrect === true).length;
  const weeklyPoints = games.reduce((sum, g) => sum + (userPickResults[g.id]?.pointsAwarded || 0), 0);

  return (
    <div className="p-4">
      <WeekSelector currentWeek={currentWeek} officialWeek={league?.currentWeek} onChange={setCurrentWeek} />
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={toggleLogos}
          className={`text-xs font-bold px-3 py-1.5 rounded-full ${
            showLogos ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-600"
          }`}
        >
          {showLogos ? "🏈 Logos on" : "Show team logos"}
        </button>
        {showLogos && (
          <span className="text-xs text-gray-500">
            Tap a team's picture to pick — handy for younger players who can't read the names yet.
          </span>
        )}
      </div>
      {isCommissioner && (
        <div className="mb-3 flex items-center gap-2">
          <button
            onClick={() => setMyWeekLocked(!myWeekLocked)}
            className={`text-xs font-bold px-3 py-1.5 rounded-full ${
              myWeekLocked
                ? "bg-gray-200 text-gray-700"
                : "bg-purple-100 text-purple-700 hover:bg-purple-200"
            }`}
          >
            {myWeekLocked ? "🔒 My picks are locked — everyone can see them" : "Lock my picks for this week"}
          </button>
          {!myWeekLocked && (
            <span className="text-xs text-gray-500">
              Nobody sees these until you lock — lock when you're actually done deciding.
            </span>
          )}
        </div>
      )}
      <div className="flex items-start justify-between mb-1">
        <h2 className="text-2xl font-bold">Week {currentWeek} Picks</h2>
        <div className="text-right">
          <div
            className={`text-xs font-bold px-2 py-1 rounded-full inline-block ${
              picksComplete ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
            }`}
          >
            {picksMade} / {totalGames} picked
          </div>
          {picksComplete && myTiebreakerGuess === null && (
            <div className="text-xs font-bold px-2 py-1 rounded-full inline-block bg-amber-100 text-amber-700 mt-1">
              ⚠ Tiebreaker not entered
            </div>
          )}
          <div className="text-xs text-gray-600 mt-1">
            {weeklyCorrect} correct · {weeklyPoints} pts so far this week
          </div>
          {weeklyLeader && (
            <div className="text-xs text-gray-500 mt-0.5">
              {weeklyLeader.playerId === playerId ? "You're" : `${weeklyLeader.name} is`} leading
              this week ({weeklyLeader.points} pts)
            </div>
          )}
          {leagueMaxWeeklyPoints !== null && leagueMaxWeeklyPoints > 0 && (
            <div className="text-xs text-gray-400 mt-0.5">
              League record: {leagueMaxWeeklyPoints} pts in a week
            </div>
          )}
        </div>
      </div>
      <p className="text-sm text-gray-600 mb-4">Tap a team to pick — it saves instantly</p>

      {/* Always shown — a player wanting to get their picks in early shouldn't
          be blocked just because the commissioner hasn't decided on this
          week's tiebreaker question yet. The guess itself doesn't depend on
          the question existing; only the display text does. */}
      <div className="border rounded-lg p-4 mb-4 bg-gray-50">
        <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-1">
          This week's tiebreaker
        </div>
        <div className="text-sm font-semibold mb-1">
          {tiebreakerQuestion || (
            <span className="text-gray-500 font-normal italic">
              Not set yet — you can still enter your guess now
            </span>
          )}
        </div>
        {tiebreakerRule && (
          <div className="text-xs text-gray-500 mb-1">
            {tiebreakerRule === "closest_without_going_over"
              ? "Price Is Right rules: closest without going over wins"
              : "Closest guess wins (going over is fine)"}
          </div>
        )}
        {tiebreakerAnswer !== null && (
          <div className="text-xs font-bold text-green-700 mb-3">
            Correct answer: {tiebreakerAnswer}
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Enter Tiebreaker ➞➞</span>
          <input
            type="number"
            value={tbDraft}
            onChange={(e) => setTbDraft(e.target.value)}
            onBlur={handleTiebreakerBlur}
            disabled={tiebreakerLocked}
            className="w-24 border rounded px-2 py-1 disabled:bg-gray-100 disabled:text-gray-500"
          />
          {tbSaved && <span className="text-xs text-green-600">✓ Saved</span>}
          {tiebreakerLocked && (
            <span className="text-xs font-semibold text-gray-500">🔒 Locked</span>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {games.map((game) => {
          const picked = userPicks[game.id];
          const isFinal = !!game.result;
          // Mirrors the server-side rule in firestore.rules (gameIsOpen):
          // a game is closed once its own kickoff time passes, even if
          // nobody's flipped isLocked yet. Checking it here too means the
          // button visibly disables instead of inviting a click the server
          // will reject anyway.
          const isPastKickoff = !game.timeTBD && !!game.gameTime && new Date(game.gameTime) <= now;
          const isLocked = (game.isLocked || isPastKickoff) && !isFinal;
          const isClickable = !isLocked && !isFinal && !myWeekLocked;

          function borderClassFor(abbr: string): string {
            if (picked !== abbr) return "";
            if (isFinal) {
              return game.result!.winner === abbr
                ? "!border-green-600"
                : "!border-red-600";
            }
            if (isLocked) return "!border-gray-400";
            return "!border-yellow-400";
          }

          function subtextFor(abbr: string): string {
            const isAway = abbr === game.awayTeam;
            // Spread is only useful while the game is still open. Finals
            // count as locked too — the old check skipped them, which is
            // why +3/-3 was still showing under finished games.
            const hasClosed = game.isLocked || isPastKickoff || isFinal;
            if (hasClosed) {
              const counts = game.pickCounts || countsFromVisiblePicks.get(game.id);
              const count = counts?.[abbr] || 0;
              return `${count} pick${count === 1 ? "" : "s"}`;
            }
            const spread = isAway ? game.awaySpread : game.homeSpread;
            return spread || "";
          }

          return (
            <div key={game.id} className="border rounded-lg p-3 bg-white">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-600">{gameTimeOrScoreLabel(game)}</span>
                {isLocked && !game.live && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide bg-gray-100 border border-gray-300 text-gray-600 rounded-full px-2 py-0.5">
                    Locked
                  </span>
                )}
                {game.live && !isFinal && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide bg-blue-100 text-blue-800 rounded-full px-2 py-0.5">
                    Live
                  </span>
                )}
                {isFinal && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide bg-green-100 text-green-700 rounded-full px-2 py-0.5">
                    Final
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <PickTile
                  abbr={game.awayTeam}
                  isPicked={picked === game.awayTeam}
                  showColor={!picked || picked === game.awayTeam}
                  isClickable={isClickable}
                  borderClass={borderClassFor(game.awayTeam)}
                  subtext={subtextFor(game.awayTeam)}
                  showLogo={showLogos}
                  onClick={() => handlePick(game.id, game.awayTeam)}
                />
                <StatusCircle game={game} picked={picked} />
                <PickTile
                  abbr={game.homeTeam}
                  isPicked={picked === game.homeTeam}
                  showColor={!picked || picked === game.homeTeam}
                  isClickable={isClickable}
                  borderClass={borderClassFor(game.homeTeam)}
                  subtext={subtextFor(game.homeTeam)}
                  showLogo={showLogos}
                  onClick={() => handlePick(game.id, game.homeTeam)}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// STANDINGS SCREEN - View season standings
// ============================================================================

// ============================================================================
// MY SUMMARY - Personal pick recap for one week: colored+points if you won
// that game, greyed out with nothing if you lost. Every player's own tab —
// not commissioner-gated, since it's only ever their own data.
// ============================================================================

export function MySummaryScreen() {
  const { leagueId, playerId, loading } = useLeague();
  const [allGames, setAllGames] = useState<schema.UIGame[]>([]);
  const [allPicks, setAllPicks] = useState<schema.PickDoc[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(true);

  React.useEffect(() => {
    if (!leagueId || !playerId) return;
    setLoadingSummary(true);
    (async () => {
      const [gamesData, picksData] = await Promise.all([
        firebaseUtils.getAllGamesForLeague(leagueId),
        firebaseUtils.getPlayerAllPicks(leagueId, playerId),
      ]);
      setAllGames(
        gamesData.map((g) => ({
          id: g.id,
          week: g.week,
          order: g.order,
          playoffMultiplier: g.playoffMultiplier,
          homeTeam: g.homeTeam,
          awayTeam: g.awayTeam,
          gameTime: g.gameTime ? g.gameTime.toDate() : null,
          timeTBD: g.timeTBD,
          isLocked: g.isLocked,
          result: g.result,
        }))
      );
      setAllPicks(picksData);
      setLoadingSummary(false);
    })();
  }, [leagueId, playerId]);

  if (loading || loadingSummary) return <div className="p-4">Loading...</div>;

  // Group games by week, sorted by that week's display order — this is
  // what makes each column's row order match the picks screen. Week 0 (the
  // test slate) is excluded here too — same reasoning as everywhere else.
  const gamesByWeek = new Map<number, schema.UIGame[]>();
  allGames.forEach((g) => {
    if (g.week === 0) return;
    if (!gamesByWeek.has(g.week)) gamesByWeek.set(g.week, []);
    gamesByWeek.get(g.week)!.push(g);
  });
  const weeks = Array.from(gamesByWeek.keys()).sort((a, b) => a - b);
  const maxRows = Math.max(0, ...weeks.map((w) => gamesByWeek.get(w)!.length));

  const pickByGameId = new Map<string, schema.PickDoc>();
  allPicks.forEach((p) => pickByGameId.set(p.gameId, p));

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-1">My Summary</h2>
      <p className="text-sm text-gray-600 mb-4">
        Every pick, every week. Winning picks show your points; losing picks grey out.
      </p>

      {weeks.length === 0 ? (
        <p className="text-sm text-gray-500">No weeks with games yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="border-collapse">
            <thead>
              <tr>
                {weeks.map((w) => (
                  <th key={w} className="text-xs font-bold text-gray-600 px-1 pb-2 text-left whitespace-nowrap">
                    Week {w}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: maxRows }, (_, rowIndex) => (
                <tr key={rowIndex}>
                  {weeks.map((w) => {
                    const game = gamesByWeek.get(w)![rowIndex];
                    if (!game) return <td key={w} className="p-0.5" />;
                    const pick = pickByGameId.get(game.id);
                    if (!pick) {
                      return (
                        <td key={w} className="p-0.5">
                          <div className="w-20 h-9 rounded flex items-center justify-center text-xs text-gray-300 border border-dashed">
                            —
                          </div>
                        </td>
                      );
                    }
                    const isFinal = !!game.result;
                    const isCorrect = pick.isCorrect === true;
                    const colors = getTeamColor(pick.pickedTeam);
                    // Pending: show real color, no points yet (outcome
                    // unknown). Final + correct: real color + points. Final
                    // + incorrect: grey, nothing — same rule as My Picks.
                    const showColor = !isFinal || isCorrect;
                    return (
                      <td key={w} className="p-0.5">
                        <div
                          className="w-20 h-9 rounded flex items-center justify-center text-center text-xs font-bold"
                          style={{
                            background: showColor ? colors.bg : "#e5e7eb",
                            color: showColor ? colors.fg : "#6b7280",
                          }}
                        >
                          {pick.pickedTeam}
                          {isFinal && isCorrect && pick.pointsAwarded !== undefined && (
                            <span>&nbsp;({pick.pointsAwarded})</span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="border-t-2">
                {weeks.map((w) => {
                  const weekGames = gamesByWeek.get(w)!;
                  const total = weekGames.reduce((sum, g) => {
                    const pick = pickByGameId.get(g.id);
                    return sum + (pick?.isCorrect ? pick.pointsAwarded || 0 : 0);
                  }, 0);
                  return (
                    <td key={w} className="p-1 text-xs font-bold text-gray-700">
                      {total}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// PAYOUTS - Dues and prize structure. Visible to everyone; only the
// commissioner can edit. Playoff-portion payouts are a deliberately
// separate, not-yet-built feature (see product notes) — this only covers
// the regular-season dues/weekly/season structure.
// ============================================================================

// One entry/prize pool's editable card — used twice (regular season and
// playoffs), which are genuinely separate pools with their own entry fee
// and prize structure, not one combined number split visually.
function PayoutPoolCard({
  title,
  isCommissioner,
  entryFee,
  weeklyPayout, // null/undefined means this pool has no weekly component (playoffs)
  payouts,
  dflAmount, // undefined means this pool has no DFL line (playoffs) — null means
             // it's available but not yet set
  activeCount,
  totalWeeks,
  onSave,
}: {
  title: string;
  isCommissioner: boolean;
  entryFee: number | null;
  weeklyPayout?: number | null;
  payouts: (number | null)[];
  dflAmount?: number | null;
  activeCount: number;
  totalWeeks?: number; // only relevant if weeklyPayout is used
  onSave: (settings: {
    entryFee: number | null;
    weeklyPayout?: number | null;
    payouts: (number | null)[];
    dflAmount?: number | null;
  }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [entryFeeDraft, setEntryFeeDraft] = useState("");
  const [weeklyDraft, setWeeklyDraft] = useState("");
  const [payoutDrafts, setPayoutDrafts] = useState<string[]>(["", "", "", "", ""]);
  const [dflDraft, setDflDraft] = useState("");

  const totalPot = entryFee !== null ? entryFee * activeCount : null;
  const totalWeeklyCommitment =
    weeklyPayout !== undefined && weeklyPayout !== null && totalWeeks ? weeklyPayout * totalWeeks : 0;
  const totalPayoutCommitment = payouts.reduce((sum: number, p) => sum + (p || 0), 0);
  // DFL is typically a penalty (negative), not a prize — only add it to the
  // committed-vs-pot check when it's actually a positive payout, since a
  // negative amount is money coming IN, not going out.
  const dflCommitment = dflAmount !== undefined && dflAmount !== null && dflAmount > 0 ? dflAmount : 0;
  const totalCommitted = totalWeeklyCommitment + totalPayoutCommitment + dflCommitment;

  const startEditing = () => {
    setEntryFeeDraft(entryFee !== null ? String(entryFee) : "");
    setWeeklyDraft(weeklyPayout !== null && weeklyPayout !== undefined ? String(weeklyPayout) : "");
    setPayoutDrafts(payouts.map((p) => (p !== null ? String(p) : "")));
    setDflDraft(dflAmount !== null && dflAmount !== undefined ? String(dflAmount) : "");
    setEditing(true);
  };

  const save = () => {
    onSave({
      entryFee: entryFeeDraft ? parseFloat(entryFeeDraft) : null,
      ...(weeklyPayout !== undefined
        ? { weeklyPayout: weeklyDraft ? parseFloat(weeklyDraft) : null }
        : {}),
      payouts: payoutDrafts.map((d) => (d ? parseFloat(d) : null)),
      ...(dflAmount !== undefined ? { dflAmount: dflDraft ? parseFloat(dflDraft) : null } : {}),
    });
    setEditing(false);
  };

  const placeLabels = ["1st", "2nd", "3rd", "4th", "5th"];

  return (
    <div className="border rounded-lg p-4 bg-white">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold">{title}</h3>
        {isCommissioner && !editing && (
          <button onClick={startEditing} className="text-xs font-semibold text-blue-600 hover:underline">
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Entry fee (per player)</label>
            <input
              type="number"
              value={entryFeeDraft}
              onChange={(e) => setEntryFeeDraft(e.target.value)}
              placeholder="e.g. 100"
              className="w-32 border p-2 rounded text-sm"
            />
          </div>
          {weeklyPayout !== undefined && (
            <div>
              <label className="block text-sm font-medium mb-1">Weekly payout (to that week's leader)</label>
              <input
                type="number"
                value={weeklyDraft}
                onChange={(e) => setWeeklyDraft(e.target.value)}
                placeholder="e.g. 100"
                className="w-32 border p-2 rounded text-sm"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-2">Payouts</label>
            <div className="space-y-2">
              {placeLabels.map((label, i) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="text-sm text-gray-600 w-10">{label}</span>
                  <input
                    type="number"
                    value={payoutDrafts[i]}
                    onChange={(e) => {
                      const next = [...payoutDrafts];
                      next[i] = e.target.value;
                      setPayoutDrafts(next);
                    }}
                    placeholder="0"
                    className="w-32 border p-2 rounded text-sm"
                  />
                </div>
              ))}
            </div>
          </div>
          {dflAmount !== undefined && (
            <div>
              <label className="block text-sm font-medium mb-1">
                DFL <span className="text-gray-400 font-normal">(last place — negative for a penalty)</span>
              </label>
              <input
                type="number"
                value={dflDraft}
                onChange={(e) => setDflDraft(e.target.value)}
                placeholder="e.g. -50"
                className="w-32 border p-2 rounded text-sm"
              />
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={save}
              className="bg-blue-500 hover:bg-blue-600 text-white font-semibold px-4 py-2 rounded text-sm"
            >
              Save
            </button>
            <button onClick={() => setEditing(false)} className="text-sm text-gray-500 px-2">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-sm">
            {entryFee !== null ? (
              <>
                ${entryFee} × {activeCount} players = <span className="font-bold">${totalPot} total pot</span>
              </>
            ) : (
              <span className="text-gray-500">Entry fee not set yet.</span>
            )}
          </div>

          {weeklyPayout !== undefined && (
            <div className="text-sm">
              {weeklyPayout !== null ? (
                <>${weeklyPayout} to that week's points leader, every week</>
              ) : (
                <span className="text-gray-500">Weekly payout not set yet.</span>
              )}
            </div>
          )}

          <div className="space-y-1">
            {placeLabels.map((label, i) => (
              <div key={label} className="flex justify-between text-sm">
                <span className="text-gray-600">{label}</span>
                <span className="font-semibold">${payouts[i] || 0}</span>
              </div>
            ))}
            {dflAmount !== undefined && (
              <div className="flex justify-between text-sm pt-1 border-t mt-1">
                <span className="text-gray-600">DFL</span>
                <span className={`font-semibold ${dflAmount && dflAmount < 0 ? "text-red-600" : ""}`}>
                  {dflAmount ? `${dflAmount < 0 ? "-$" + Math.abs(dflAmount) : "$" + dflAmount}` : "$0"}
                </span>
              </div>
            )}
          </div>

          {totalPot !== null && (
            <div
              className={`border rounded p-3 text-xs ${
                totalCommitted > totalPot ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"
              }`}
            >
              <div className="flex justify-between font-semibold">
                <span>Total committed</span>
                <span>${totalCommitted}</span>
              </div>
              <div className="flex justify-between">
                <span>Total pot collected</span>
                <span>${totalPot}</span>
              </div>
              {totalCommitted > totalPot && (
                <p className="text-red-700 font-semibold mt-1">
                  Committed payouts exceed the current pot.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function PayoutsScreen() {
  const { league, players, isCommissioner, setRegularSeasonPayoutSettings, setPlayoffPayoutSettings } =
    useLeague();

  const activeCount = players.filter((p) => !p.removedFromLeague).length;

  return (
    <div className="p-4 max-w-3xl">
      <h2 className="text-2xl font-bold mb-1">Payouts</h2>
      <p className="text-sm text-gray-600 mb-4">
        Regular season and playoffs are separate pools — separate entry fees, separate prizes.
        Season payout reflects today's rank, which will keep shifting until the season ends.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <PayoutPoolCard
          title="Regular Season"
          isCommissioner={isCommissioner}
          entryFee={league?.regularSeasonEntryFee ?? null}
          weeklyPayout={league?.regularSeasonWeeklyPayout ?? null}
          payouts={league?.regularSeasonPayouts ?? [null, null, null, null, null]}
          dflAmount={league?.regularSeasonDflAmount ?? null}
          activeCount={activeCount}
          totalWeeks={18}
          onSave={(settings) =>
            setRegularSeasonPayoutSettings({
              entryFee: settings.entryFee,
              weeklyPayout: settings.weeklyPayout ?? null,
              payouts: settings.payouts,
              dflAmount: settings.dflAmount ?? null,
            })
          }
        />
        <PayoutPoolCard
          title="Playoffs"
          isCommissioner={isCommissioner}
          entryFee={league?.playoffEntryFee ?? null}
          payouts={league?.playoffPayouts ?? [null, null, null, null, null]}
          activeCount={activeCount}
          onSave={(settings) =>
            setPlayoffPayoutSettings({ entryFee: settings.entryFee, payouts: settings.payouts })
          }
        />
      </div>
    </div>
  );
}

type StandingsSort =
  | { column: "season" }
  | { column: "total"; dir: "desc" | "asc" }
  | { column: "week"; week: number; dir: "desc" | "asc" };

export function StandingsScreen() {
  const { leagueId, playerId, standings, league, loading } = useLeague();
  const [allGames, setAllGames] = useState<schema.GameDoc[]>([]);
  const [allPicks, setAllPicks] = useState<schema.PickDoc[]>([]);
  const [tiebreakersByWeek, setTiebreakersByWeek] = useState<
    Map<number, schema.WeeklyTiebreakerDoc>
  >(new Map());
  const [loadingGrid, setLoadingGrid] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Default is season rank (the cached standings order). Clicking Total or
  // a week header re-sorts the rows by that column; clicking Rank returns
  // to season order. Rank numbers themselves stay season rank so you can
  // still see overall place after reordering by a week.
  const [sort, setSort] = useState<StandingsSort>({ column: "season" });

  React.useEffect(() => {
    if (!leagueId || !playerId) return;
    setLoadingGrid(true);
    setLoadError(null);
    (async () => {
      try {
        const gamesData = await firebaseUtils.getAllGamesForLeague(leagueId);
        setAllGames(gamesData);

        // Two explicitly-filtered queries per week (own picks + visible
        // picks), not one broad query — real testing showed Firestore only
        // reliably allows a list query when its own WHERE filter matches,
        // field for field, what the security rule checks. See
        // getVisiblePicksForWeek in firebase-utils.ts for the full story;
        // this replaced an earlier version that (still incorrectly)
        // assumed a broad query plus a "simple" rule condition would work.
        const weeksInLeague = Array.from(new Set(gamesData.map((g) => g.week))).sort((a, b) => a - b);
        const [picksByWeek, tiebreakerDocs] = await Promise.all([
          Promise.all(weeksInLeague.map((w) => firebaseUtils.getVisiblePicksForWeek(leagueId, w, playerId))),
          // weeklyTiebreakers is openly readable — no special query pattern
          // needed here, unlike picks.
          Promise.all(weeksInLeague.map((w) => firebaseUtils.getWeeklyTiebreaker(leagueId, w))),
        ]);
        setAllPicks(picksByWeek.flat());
        const tbMap = new Map<number, schema.WeeklyTiebreakerDoc>();
        weeksInLeague.forEach((w, i) => {
          const tb = tiebreakerDocs[i];
          if (tb) tbMap.set(w, tb);
        });
        setTiebreakersByWeek(tbMap);
      } catch (err) {
        setLoadError(`Failed to load standings: ${err}`);
      } finally {
        setLoadingGrid(false);
      }
    })();
  }, [leagueId, playerId]);

  if (loading || loadingGrid) return <div className="p-4">Loading...</div>;
  if (loadError) return <div className="p-4 text-red-600 text-sm">{loadError}</div>;

  // Week 0 was the test slate — excluded from the real standings grid, same
  // as it's excluded from the real season point totals (see
  // recalculateSeasonStandings in firebase-utils.ts). Data stays in
  // Firestore either way, just not shown here anymore.
  const weeks = Array.from(new Set(allGames.map((g) => g.week)))
    .filter((w) => w > 0)
    .sort((a, b) => a - b);

  // Points AND correct-picks-count per player per week, from whatever picks
  // are actually visible to this viewer (their own always; others' only
  // once revealed — see the picks read rule). A week that's fully hidden
  // from a regular player just shows blank for everyone but themselves and
  // the commissioner, same reveal timing as everywhere else in the app.
  const pointsByPlayerWeek = new Map<string, Map<number, number>>();
  const correctByPlayerWeek = new Map<string, Map<number, number>>();
  allPicks.forEach((p) => {
    if (p.pointsAwarded === undefined) return;
    if (!pointsByPlayerWeek.has(p.playerId)) pointsByPlayerWeek.set(p.playerId, new Map());
    const weekMap = pointsByPlayerWeek.get(p.playerId)!;
    weekMap.set(p.week, (weekMap.get(p.week) || 0) + p.pointsAwarded);

    if (p.isCorrect) {
      if (!correctByPlayerWeek.has(p.playerId)) correctByPlayerWeek.set(p.playerId, new Map());
      const correctMap = correctByPlayerWeek.get(p.playerId)!;
      correctMap.set(p.week, (correctMap.get(p.week) || 0) + 1);
    }
  });

  // Weekly winnings: whoever had the most points that week wins the
  // payout. A genuine points TIE gets broken by that week's tiebreaker —
  // only if the tiebreaker hasn't actually been resolved yet (no answer
  // recorded) does it fall back to an even split, and even then only
  // among players who are BOTH tied on points AND (if they guessed)
  // matched by the tiebreaker's own resolution.
  const weeklyWinningsByPlayer = new Map<string, number>();
  if (league?.regularSeasonWeeklyPayout) {
    weeks.forEach((w) => {
      const weekGames = allGames.filter((g) => g.week === w);
      const weekComplete = weekGames.length > 0 && weekGames.every((g) => !!g.result);
      if (!weekComplete) return;

      let maxPts = 0;
      let leaders: string[] = [];
      pointsByPlayerWeek.forEach((weekMap, playerId) => {
        const pts = weekMap.get(w);
        if (pts === undefined) return;
        if (pts > maxPts) {
          maxPts = pts;
          leaders = [playerId];
        } else if (pts === maxPts && pts > 0) {
          leaders.push(playerId);
        }
      });
      if (maxPts === 0 || leaders.length === 0) return;

      let payoutTo = leaders;
      if (leaders.length > 1) {
        const tb = tiebreakersByWeek.get(w);
        const resolved = tb?.resolvedWinnerIds;
        if (resolved && resolved.length > 0) {
          // Only trust the resolution for players actually tied on points —
          // resolvedWinnerIds could in principle include someone outside
          // this particular points-tie if the tiebreaker doc's stale.
          const stillTied = resolved.filter((id) => leaders.includes(id));
          if (stillTied.length > 0) payoutTo = stillTied;
        }
        // No recorded/resolved tiebreaker for this week — fall back to
        // splitting evenly among the points-tied leaders, same as before.
      }

      const share = league.regularSeasonWeeklyPayout! / payoutTo.length;
      payoutTo.forEach((pid) => {
        weeklyWinningsByPlayer.set(pid, (weeklyWinningsByPlayer.get(pid) || 0) + share);
      });
    });
  }

  // Season winnings only appear once the regular season has actually
  // finished (every Week 18 game final) — showing "1st/2nd/3rd get paid
  // this much" while the season's still in progress implies a result that
  // hasn't actually happened yet. Standings/rank stay live throughout;
  // it's specifically the $ payout that waits.
  const finalWeekGames = allGames.filter((g) => g.week === 18);
  const seasonComplete = finalWeekGames.length > 0 && finalWeekGames.every((g) => !!g.result);

  const seasonWinningsByPlayer = new Map<string, number>();
  if (seasonComplete && league?.regularSeasonPayouts) {
    standings.forEach((s) => {
      if (s.rank >= 1 && s.rank <= 5) {
        const amount = league.regularSeasonPayouts![s.rank - 1];
        if (amount) seasonWinningsByPlayer.set(s.playerId, amount);
      }
    });
  }
  // DFL — whoever's in last place once the season's actually over. Can be
  // negative (a penalty they owe, subtracted from their total) or positive
  // (a consolation prize), per however the commissioner entered it.
  if (seasonComplete && league?.regularSeasonDflAmount && standings.length > 0) {
    const lastPlace = standings[standings.length - 1];
    seasonWinningsByPlayer.set(
      lastPlace.playerId,
      (seasonWinningsByPlayer.get(lastPlace.playerId) || 0) + league.regularSeasonDflAmount
    );
  }

  const totalWinnings = (playerId: string) =>
    (weeklyWinningsByPlayer.get(playerId) || 0) + (seasonWinningsByPlayer.get(playerId) || 0);

  const clickSort = (next: StandingsSort) => {
    setSort((prev) => {
      if (next.column === "season") return { column: "season" };
      if (next.column === "total" && prev.column === "total") {
        return { column: "total", dir: prev.dir === "desc" ? "asc" : "desc" };
      }
      if (next.column === "week" && prev.column === "week" && prev.week === next.week) {
        return { column: "week", week: next.week, dir: prev.dir === "desc" ? "asc" : "desc" };
      }
      return next;
    });
  };

  const sortedStandings = [...standings].sort((a, b) => {
    const byRank = a.rank - b.rank;
    if (sort.column === "season") return byRank;

    const dir = sort.dir === "desc" ? -1 : 1;
    if (sort.column === "total") {
      if (a.totalPoints !== b.totalPoints) return (a.totalPoints - b.totalPoints) * dir;
      return byRank;
    }

    const aPts = pointsByPlayerWeek.get(a.playerId)?.get(sort.week);
    const bPts = pointsByPlayerWeek.get(b.playerId)?.get(sort.week);
    if (aPts === undefined && bPts === undefined) return byRank;
    if (aPts === undefined) return 1;
    if (bPts === undefined) return -1;
    if (aPts !== bPts) return (aPts - bPts) * dir;
    return byRank;
  });

  const sortMark = (active: boolean, dir?: "desc" | "asc") =>
    active ? (dir === "asc" ? " ▲" : " ▼") : "";

  // The raw weekly-high score per week, regardless of tiebreaker resolution —
  // this is a "who scored the most this week" visual, separate from (and
  // simpler than) the $ payout logic above, which can differ in a genuine tie.
  const maxPointsByWeek = new Map<number, number>();
  weeks.forEach((w) => {
    let max = 0;
    pointsByPlayerWeek.forEach((weekMap) => {
      const pts = weekMap.get(w);
      if (pts !== undefined && pts > max) max = pts;
    });
    if (max > 0) maxPointsByWeek.set(w, max);
  });

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-1">Standings</h2>
      <p className="text-xs text-gray-500 mb-2">
        Tap Total or a week to sort. Rank is always season place.
      </p>
      {league?.regularSeasonPayouts && !seasonComplete && (
        <p className="text-xs text-gray-500 mb-4">
          Season-long payouts aren't awarded until Week 18 finishes — weekly winnings still show as
          each week wraps up.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="border-collapse text-sm">
          <thead>
            <tr className="border-b-2">
              <th className="text-left py-2 pr-3 sticky left-0 bg-white">
                <button
                  type="button"
                  onClick={() => clickSort({ column: "season" })}
                  className={`whitespace-nowrap font-bold ${
                    sort.column === "season" ? "text-black" : "text-gray-600 hover:text-black"
                  }`}
                >
                  Rank{sort.column === "season" ? " ▼" : ""}
                </button>
              </th>
              <th className="text-left py-2 pr-4 sticky left-8 bg-white">Player</th>
              <th className="text-center py-2 px-3 font-bold border-l-2 border-r-2">
                <button
                  type="button"
                  onClick={() => clickSort({ column: "total", dir: "desc" })}
                  className={`whitespace-nowrap ${
                    sort.column === "total" ? "text-black" : "hover:text-black"
                  }`}
                >
                  Total{sortMark(sort.column === "total", sort.column === "total" ? sort.dir : undefined)}
                </button>
              </th>
              {weeks.map((w) => (
                <th key={w} className="text-center py-2 px-2 font-semibold text-gray-600 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => clickSort({ column: "week", week: w, dir: "desc" })}
                    className={`whitespace-nowrap ${
                      sort.column === "week" && sort.week === w
                        ? "text-black font-bold"
                        : "hover:text-black"
                    }`}
                  >
                    Wk {w}
                    {sortMark(
                      sort.column === "week" && sort.week === w,
                      sort.column === "week" && sort.week === w ? sort.dir : undefined
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedStandings.map((s) => {
              const weekMap = pointsByPlayerWeek.get(s.playerId);
              const correctMap = correctByPlayerWeek.get(s.playerId);
              const winnings = totalWinnings(s.playerId);
              return (
                <React.Fragment key={s.playerId}>
                  <tr className="bg-green-50">
                    <td className="py-2 pr-3 font-bold text-lg sticky left-0 bg-green-50">
                      {s.rank}
                    </td>
                    <td className="pt-2 pr-4 font-bold text-base sticky left-8 bg-green-50">
                      {s.playerName}
                    </td>
                    <td className="text-center pt-2 px-3 font-bold text-lg border-l-2 border-r-2">
                      {s.totalPoints}
                    </td>
                    {weeks.map((w) => {
                      const pts = weekMap?.get(w);
                      const isWeeklyHigh = pts !== undefined && pts > 0 && pts === maxPointsByWeek.get(w);
                      return (
                        <td
                          key={w}
                          className={`text-center pt-2 px-2 font-semibold ${
                            isWeeklyHigh ? "bg-yellow-100 text-yellow-800 rounded" : ""
                          }`}
                        >
                          {pts !== undefined ? pts : "—"}
                        </td>
                      );
                    })}
                  </tr>
                  <tr className="border-b-2 border-gray-200">
                    <td className="pb-2 pr-3 sticky left-0 bg-white"></td>
                    <td className="pb-2 pr-4 text-xs text-gray-500 sticky left-8 bg-white">
                      {winnings > 0 ? `$${winnings.toLocaleString()} won` : ""}
                    </td>
                    <td className="text-center whitespace-nowrap pb-2 px-3 text-xs text-gray-500 border-l-2 border-r-2">
                      {s.totalCorrect} correct
                    </td>
                    {weeks.map((w) => (
                      <td key={w} className="text-center pb-2 px-2 text-xs text-gray-400">
                        {correctMap?.get(w) !== undefined ? correctMap.get(w) : ""}
                      </td>
                    ))}
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// COMMISSIONER DASHBOARD - Enter results and manage league
// ============================================================================

// ============================================================================
// SCHEDULE MANAGER - Reorder games and set/edit kickoff times (commissioner only)
// ============================================================================
//
// The real NFL schedule isn't static: Sunday games can flex into primetime,
// and the last week or two of the season often has no real days/times until
// days before kickoff. Display/pick-sheet order is controlled by `order`,
// which is independent of `gameTime` — so a TBD game still has a definite
// position on the sheet even with no known kickoff. Reordering uses simple
// up/down buttons rather than drag-and-drop: it's more reliable on mobile
// touch, and a commissioner doing this occasionally doesn't need a drag
// gesture to get it right every time.

export function ScheduleManager() {
  const { games, currentWeek, reorderGames, updateGameSchedule, setManualLock } = useLeague();
  const [editingGameId, setEditingGameId] = useState<string | null>(null);
  const [draftTime, setDraftTime] = useState("");
  const [draftTBD, setDraftTBD] = useState(false);

  const moveGame = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= games.length) return;
    const reordered = [...games];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);
    reorderGames(reordered.map((g) => g.id));
  };

  const startEditingTime = (game: (typeof games)[number]) => {
    setEditingGameId(game.id);
    setDraftTBD(game.timeTBD);
    setDraftTime(
      game.gameTime ? new Date(game.gameTime).toISOString().slice(0, 16) : ""
    );
  };

  const saveTime = async (gameId: string) => {
    if (draftTBD) {
      await updateGameSchedule(gameId, null, true);
    } else if (draftTime) {
      await updateGameSchedule(gameId, new Date(draftTime), false);
    }
    setEditingGameId(null);
  };

  return (
    <div className="mb-8 border p-4 rounded bg-gray-50">
      <h3 className="text-lg font-bold mb-1">Week {currentWeek} Schedule</h3>
      <p className="text-sm text-gray-600 mb-4">
        Reorder games with the arrows, or set/edit a kickoff time. Games can stay
        "Time TBD" — they'll still hold their position on the pick sheet.
      </p>

      <div className="space-y-2">
        {games.map((game, index) => (
          <div key={game.id} className="border rounded bg-white p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex flex-col">
                  <button
                    onClick={() => moveGame(index, -1)}
                    disabled={index === 0}
                    className="text-xs px-2 py-0.5 border rounded disabled:opacity-30"
                    aria-label="Move up"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => moveGame(index, 1)}
                    disabled={index === games.length - 1}
                    className="text-xs px-2 py-0.5 border rounded disabled:opacity-30"
                    aria-label="Move down"
                  >
                    ▼
                  </button>
                </div>
                <div>
                  <div className="text-sm font-semibold">
                    {game.awayTeam} @ {game.homeTeam}
                  </div>
                  <div className="text-xs text-gray-600">
                    {game.timeTBD
                      ? "Time TBD"
                      : game.gameTime
                      ? formatKickoff(new Date(game.gameTime))
                      : "Time TBD"}
                    {game.isManuallyLocked && (
                      <span className="ml-2 text-red-600 font-medium">Manually locked</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {editingGameId !== game.id && (
                  <button
                    onClick={() => startEditingTime(game)}
                    className="text-xs text-blue-600 font-medium"
                  >
                    Edit time
                  </button>
                )}
                {game.timeTBD && (
                  <button
                    onClick={() => setManualLock(game.id, !game.isManuallyLocked)}
                    className="text-xs text-red-600 font-medium"
                  >
                    {game.isManuallyLocked ? "Unlock" : "Lock now"}
                  </button>
                )}
              </div>
            </div>

            {editingGameId === game.id && (
              <div className="mt-3 pt-3 border-t space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draftTBD}
                    onChange={(e) => setDraftTBD(e.target.checked)}
                  />
                  Time TBD (not yet announced)
                </label>
                {!draftTBD && (
                  <input
                    type="datetime-local"
                    value={draftTime}
                    onChange={(e) => setDraftTime(e.target.value)}
                    className="w-full border p-2 rounded text-sm"
                  />
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => saveTime(game.id)}
                    className="text-sm bg-green-500 hover:bg-green-600 text-white font-medium py-1 px-3 rounded"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingGameId(null)}
                    className="text-sm bg-gray-200 hover:bg-gray-300 font-medium py-1 px-3 rounded"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CommissionerDashboard() {
  const {
    games,
    players,
    currentWeek,
    loading,
    leagueId,
    league,
    setCurrentWeek,
    advanceToWeek,
    enterGameResult,
    tiebreakerQuestion,
    tiebreakerLocked,
    setTiebreakerQuestion,
    setTiebreakerAnswer,
    lockTiebreaker,
    unlockTiebreaker,
    assignMissedPick,
    setLeagueMaxPlayers,
    setLeagueName,
    lockAllPassedKickoffGames,
  } = useLeague();
  const now = useNow();
  const [maxPlayersDraft, setMaxPlayersDraft] = useState<string>("");
  const [leagueNameDraft, setLeagueNameDraft] = useState<string>("");
  const [lockingAll, setLockingAll] = useState(false);
  const [lastLockResult, setLastLockResult] = useState<string | null>(null);
  const [editingResultGameId, setEditingResultGameId] = useState<string | null>(null);
  const [tiebreakerQ, setTiebreakerQ] = useState("");
  const [tiebreakerAnswerDraft, setTiebreakerAnswerDraft] = useState("");
  const [tiebreakerRule, setTiebreakerRule] = useState<"closest" | "closest_without_going_over">(
    "closest"
  );

  // Who has/hasn't picked each game, and who has/hasn't entered the
  // tiebreaker — commissioner-only data (players list has emails for the
  // per-game "copy contacts" reminder action). pickDetailsByGame keeps the
  // actual pick + whether it was wildcard-assigned, so an already-assigned
  // pick can be shown (and changed) rather than only ever tracking who's
  // picked at all.
  const [pickedByGame, setPickedByGame] = useState<{ [gameId: string]: Set<string> }>({});
  const [pickDetailsByGame, setPickDetailsByGame] = useState<{
    [gameId: string]: { [playerId: string]: { pickedTeam: string; isWildcard: boolean } };
  }>({});
  const [tiebreakerEnteredBy, setTiebreakerEnteredBy] = useState<Set<string>>(new Set());
  const [tiebreakerGuessValues, setTiebreakerGuessValues] = useState<{ [playerId: string]: number }>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [fillingGameId, setFillingGameId] = useState<string | null>(null);
  // Per-row UI state for the fill-in panel, keyed by `${gameId}_${playerId}`
  // — gives real feedback on click instead of the button silently doing
  // nothing until a page reload happened to show the result.
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);

  const refreshPickedByGame = React.useCallback(async () => {
    if (!leagueId) return;
    const [allPicks, allGuesses] = await Promise.all([
      firebaseUtils.getAllPicksForWeek(leagueId, currentWeek),
      firebaseUtils.getAllTiebreakerGuessesForWeek(leagueId, currentWeek),
    ]);
    const byGame: { [gameId: string]: Set<string> } = {};
    const detailsByGame: {
      [gameId: string]: { [playerId: string]: { pickedTeam: string; isWildcard: boolean } };
    } = {};
    allPicks.forEach((p) => {
      if (!byGame[p.gameId]) byGame[p.gameId] = new Set();
      byGame[p.gameId].add(p.playerId);
      if (!detailsByGame[p.gameId]) detailsByGame[p.gameId] = {};
      detailsByGame[p.gameId][p.playerId] = { pickedTeam: p.pickedTeam, isWildcard: !!p.isWildcard };
    });
    setPickedByGame(byGame);
    setPickDetailsByGame(detailsByGame);
    setTiebreakerEnteredBy(new Set(allGuesses.map((g) => g.playerId)));
    const guessValues: { [playerId: string]: number } = {};
    allGuesses.forEach((g) => (guessValues[g.playerId] = g.guess));
    setTiebreakerGuessValues(guessValues);
  }, [leagueId, currentWeek]);

  React.useEffect(() => {
    refreshPickedByGame();
  }, [refreshPickedByGame]);

  // Wraps the context action with real per-row feedback: a "Saving…" state
  // while the write is in flight, a brief "✓ Saved" confirmation once the
  // refreshed data actually confirms it landed, and a visible error right
  // in this panel if it didn't — rather than the button appearing to do
  // nothing either way, which was the actual bug being fixed here.
  const handleAssignAndRefresh = async (gameId: string, forPlayerId: string, pickedTeam: string) => {
    const key = `${gameId}_${forPlayerId}`;
    setSavingKey(key);
    setAssignError(null);
    try {
      await assignMissedPick(gameId, forPlayerId, pickedTeam);
      await refreshPickedByGame();
      setSavedKey(key);
      setTimeout(() => setSavedKey((k) => (k === key ? null : k)), 2000);
    } catch (err) {
      setAssignError(`Failed to save pick: ${err}`);
    } finally {
      setSavingKey((k) => (k === key ? null : k));
    }
  };


  const copyMissingContacts = (key: string, missingPlayerIds: string[]) => {
    const emails = players
      .filter((p) => missingPlayerIds.includes(p.id) && p.email)
      .map((p) => p.email)
      .join(", ");
    if (navigator.clipboard) navigator.clipboard.writeText(emails);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const handleDeclareWinner = async (gameId: string, winner: string, loser: string) => {
    // No score entry — contrarian scoring only ever cared about win/loss
    // (scoreGameImmediately has always passed 0/0 to the engine), so there
    // was never a real reason to require it here. One click, done.
    await enterGameResult(gameId, winner, loser, 0, 0);
  };

  const handleSetTiebreakerQuestion = async () => {
    if (!tiebreakerQ) return;
    await setTiebreakerQuestion(currentWeek, tiebreakerQ, tiebreakerRule);
    setTiebreakerQ("");
  };

  const handleSetTiebreakerAnswer = async () => {
    if (!tiebreakerAnswerDraft) return;
    await setTiebreakerAnswer(currentWeek, parseFloat(tiebreakerAnswerDraft));
    setTiebreakerAnswerDraft("");
  };

  const handleToggleLock = async () => {
    if (tiebreakerLocked) {
      await unlockTiebreaker(currentWeek);
    } else {
      await lockTiebreaker(currentWeek);
    }
  };

  if (loading) return <div className="p-4">Loading...</div>;

  const allPlayerIds = players.filter((p) => !p.removedFromLeague).map((p) => p.id);
  const tiebreakerMissing = allPlayerIds.filter((id) => !tiebreakerEnteredBy.has(id));
  const isViewingCurrentWeek = league?.currentWeek === currentWeek;

  return (
    <div className="p-4 max-w-2xl">
      <h2 className="text-2xl font-bold mb-1">Commissioner Dashboard</h2>

      {/* Week selector — this hub always opens on the league's current week,
          but the commissioner can browse other weeks (e.g. to enter a late
          result after the pointer's already advanced) without changing what
          players see by default. Advancing is a separate, explicit action —
          each week's tiebreaker/pick-counts/results are already naturally
          "fresh" since everything is keyed by week/gameId in Firestore. */}
      <div className="flex items-center gap-3 mb-6">
        <select
          value={currentWeek}
          onChange={(e) => setCurrentWeek(parseInt(e.target.value))}
          className="border p-2 rounded text-sm font-medium"
        >
          {Array.from({ length: 19 }, (_, i) => i).map((w) => (
            <option key={w} value={w}>
              Week {w}
            </option>
          ))}
        </select>
        {isViewingCurrentWeek ? (
          <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-1 rounded-full">
            Current week for players
          </span>
        ) : (
          <button
            onClick={() => advanceToWeek(currentWeek)}
            className="text-xs font-semibold text-white bg-blue-500 hover:bg-blue-600 px-3 py-1.5 rounded-full"
          >
            Make Week {currentWeek} current for players
          </button>
        )}
      </div>

      {/* League Settings */}
      <div className="mb-6 border p-4 rounded bg-gray-50">
        <h3 className="text-sm font-bold mb-2">League Settings</h3>
        <div className="flex items-center gap-2 mb-3">
          <label className="text-xs text-gray-600">League name:</label>
          <input
            type="text"
            placeholder={league?.name || "League name"}
            value={leagueNameDraft}
            onChange={(e) => setLeagueNameDraft(e.target.value)}
            className="flex-1 border p-1.5 rounded text-sm"
          />
          <button
            onClick={() => {
              if (leagueNameDraft.trim()) {
                setLeagueName(leagueNameDraft.trim());
                setLeagueNameDraft("");
              }
            }}
            className="text-xs font-semibold text-white bg-blue-500 hover:bg-blue-600 px-3 py-1.5 rounded"
          >
            Save
          </button>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-600">Signup cap:</label>
          <input
            type="number"
            placeholder={league?.maxPlayers != null ? String(league.maxPlayers) : "No cap"}
            value={maxPlayersDraft}
            onChange={(e) => setMaxPlayersDraft(e.target.value)}
            className="w-24 border p-1.5 rounded text-sm"
          />
          <button
            onClick={() => {
              const parsed = parseInt(maxPlayersDraft);
              setLeagueMaxPlayers(isNaN(parsed) ? null : parsed);
              setMaxPlayersDraft("");
            }}
            className="text-xs font-semibold text-white bg-blue-500 hover:bg-blue-600 px-3 py-1.5 rounded"
          >
            Save
          </button>
          {league?.maxPlayers != null && (
            <button
              onClick={() => setLeagueMaxPlayers(null)}
              className="text-xs text-gray-500 hover:text-red-600"
            >
              Remove cap
            </button>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {league?.maxPlayers != null
            ? `New signups are blocked once the league reaches ${league.maxPlayers} players.`
            : "No cap set — anyone with the link can sign up."}
        </p>
      </div>

      <ScheduleManager />

      {/* Enter Results Section */}
      <div className="mb-8 border p-4 rounded bg-blue-50">
        <h3 className="text-lg font-bold mb-1">Enter Game Results</h3>
        <p className="text-sm text-gray-600 mb-4">
          Tap the winning team — that's it, saves and scores immediately. Games
          you can't click yet are still open for picks. Kickoff lock and finals
          also come in from ESPN on game days; use this if that hasn't caught
          up yet, or tap Wrong? Fix it if the auto result is off.
        </p>

        <div className="mb-4 flex items-center gap-2">
          <button
            onClick={async () => {
              setLockingAll(true);
              const count = await lockAllPassedKickoffGames();
              setLastLockResult(
                count > 0 ? `Locked ${count} game${count === 1 ? "" : "s"}.` : "Nothing to lock right now."
              );
              setLockingAll(false);
            }}
            disabled={lockingAll}
            className="text-xs font-bold px-3 py-1.5 rounded-full bg-purple-100 text-purple-700 hover:bg-purple-200 disabled:opacity-50"
          >
            {lockingAll ? "Locking…" : "Lock all games past kickoff"}
          </button>
          <span className="text-xs text-gray-500">
            {lastLockResult ||
              "On game days a background job locks kickoffs and enters ESPN finals — this does the lock immediately."}
          </span>
        </div>

        <div className="space-y-3">
          {games.map((g) => {
            // Was purely `g.isLocked` — but nothing ever flips that field
            // true just because kickoff passed (that's enforced in the
            // security rules for picks, not reflected back onto the game
            // doc). Without this real-time check, results couldn't be
            // entered for a game that's already happened until someone
            // separately went to Schedule Manager and manually locked it —
            // a confusing dead end. Mirrors the same check PicksScreen
            // already does correctly.
            const isPastKickoff = !g.timeTBD && !!g.gameTime && new Date(g.gameTime) <= now;
            const canDeclare = g.isLocked || isPastKickoff;
            const isEditing = editingResultGameId === g.id;

            // A decided game that's NOT being edited shows compactly, with
            // a Fix link — clicking a team here calls the exact same
            // handleDeclareWinner as a fresh decision, which overwrites
            // the previous result and correctly re-scores everyone from
            // scratch (scoreGameImmediately always recomputes fresh, so
            // fixing a fat-fingered pick is just re-declaring the actual
            // winner, no separate "undo" mechanism needed).
            if (g.result && !isEditing) {
              return (
                <div
                  key={g.id}
                  className="flex items-center justify-between border rounded bg-gray-50 px-3 py-2"
                >
                  <span className="text-sm">
                    <span className="font-semibold">{g.result.winner}</span>
                    <span className="text-gray-500"> beat {g.result.loser}</span>
                  </span>
                  <button
                    onClick={() => setEditingResultGameId(g.id)}
                    className="text-xs font-semibold text-blue-600 hover:underline"
                  >
                    Wrong? Fix it
                  </button>
                </div>
              );
            }

            return (
              <div key={g.id} className="border rounded bg-white p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500">
                    {g.timeTBD || !g.gameTime ? "Time TBD" : formatKickoff(new Date(g.gameTime))}
                  </span>
                  {g.result ? (
                    <button
                      onClick={() => setEditingResultGameId(null)}
                      className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 hover:underline"
                    >
                      Cancel
                    </button>
                  ) : (
                    !canDeclare && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">
                        Still open — locks at kickoff
                      </span>
                    )
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      canDeclare && handleDeclareWinner(g.id, g.awayTeam, g.homeTeam);
                      setEditingResultGameId(null);
                    }}
                    disabled={!canDeclare}
                    className={`flex-1 py-2 px-3 rounded text-sm font-semibold ${
                      g.result?.winner === g.awayTeam
                        ? "bg-green-100 border-2 border-green-600"
                        : canDeclare
                        ? "bg-gray-100 hover:bg-green-100 hover:border-green-600 border-2 border-transparent cursor-pointer"
                        : "bg-gray-50 text-gray-400 cursor-not-allowed"
                    }`}
                  >
                    {g.awayTeam}
                  </button>
                  <button
                    onClick={() => {
                      canDeclare && handleDeclareWinner(g.id, g.homeTeam, g.awayTeam);
                      setEditingResultGameId(null);
                    }}
                    disabled={!canDeclare}
                    className={`flex-1 py-2 px-3 rounded text-sm font-semibold ${
                      g.result?.winner === g.homeTeam
                        ? "bg-green-100 border-2 border-green-600"
                        : canDeclare
                        ? "bg-gray-100 hover:bg-green-100 hover:border-green-600 border-2 border-transparent cursor-pointer"
                        : "bg-gray-50 text-gray-400 cursor-not-allowed"
                    }`}
                  >
                    {g.homeTeam}
                  </button>
                </div>
              </div>
            );
          })}
          {games.length === 0 && <p className="text-sm text-gray-500">No games this week yet.</p>}
        </div>
      </div>

      {/* Tiebreaker Section */}
      <div className="mb-8 border p-4 rounded bg-yellow-50">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold">Weekly Tiebreaker</h3>
          {tiebreakerLocked ? (
            <span className="text-xs font-bold px-2 py-1 rounded-full bg-gray-200 text-gray-700">
              🔒 Locked
            </span>
          ) : tiebreakerQuestion ? (
            <span className="text-xs font-bold px-2 py-1 rounded-full bg-green-100 text-green-700">
              Open
            </span>
          ) : null}
        </div>

        <div className="space-y-3 mb-4">
          <p className="text-xs text-gray-600">
            Set the question now — you don't need to know the correct answer yet.
            Record that separately once the relevant game finishes.
          </p>
          <div>
            <label className="block text-sm font-medium mb-2">
              Question {tiebreakerQuestion && <span className="font-normal text-gray-500">(current: "{tiebreakerQuestion}")</span>}
            </label>
            <input
              type="text"
              placeholder="e.g., Total combined points, Patriots @ Seahawks"
              value={tiebreakerQ}
              onChange={(e) => setTiebreakerQ(e.target.value)}
              disabled={tiebreakerLocked}
              className="w-full border p-2 rounded disabled:bg-gray-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Rule</label>
            <select
              value={tiebreakerRule}
              onChange={(e) =>
                setTiebreakerRule(e.target.value as "closest" | "closest_without_going_over")
              }
              disabled={tiebreakerLocked}
              className="w-full border p-2 rounded disabled:bg-gray-100"
            >
              <option value="closest">Closest</option>
              <option value="closest_without_going_over">Closest Without Going Over</option>
            </select>
          </div>

          <button
            onClick={handleSetTiebreakerQuestion}
            disabled={tiebreakerLocked || !tiebreakerQ}
            className="w-full bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-300 text-white font-bold py-2 px-4 rounded"
          >
            {tiebreakerQuestion ? "Update Question" : "Set Question"}
          </button>
        </div>

        <div className="border-t pt-3 space-y-2">
          <label className="block text-sm font-medium">Record Correct Answer</label>
          <p className="text-xs text-gray-500">
            Fill this in once you actually know it — usually after the relevant game
            finishes. Shown to everyone on the picks screen once you save it.
          </p>
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="Actual result"
              value={tiebreakerAnswerDraft}
              onChange={(e) => setTiebreakerAnswerDraft(e.target.value)}
              className="flex-1 border p-2 rounded text-sm"
            />
            <button
              onClick={handleSetTiebreakerAnswer}
              disabled={!tiebreakerAnswerDraft}
              className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white font-semibold py-2 px-4 rounded text-sm"
            >
              Save
            </button>
          </div>
        </div>

        <div className="border-t pt-3 mt-3">
          <label className="block text-sm font-medium mb-2">
            Entries ({Object.keys(tiebreakerGuessValues).length} / {players.filter((p) => !p.removedFromLeague).length})
          </label>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {players
              .filter((p) => !p.removedFromLeague)
              .map((p) => {
                const guess = tiebreakerGuessValues[p.id];
                return (
                  <div key={p.id} className="flex justify-between text-sm px-1">
                    <span className={guess === undefined ? "text-gray-400" : ""}>{p.name}</span>
                    <span className={guess === undefined ? "text-gray-400 italic" : "font-semibold"}>
                      {guess !== undefined ? guess : "No entry"}
                    </span>
                  </div>
                );
              })}
            {players.filter((p) => !p.removedFromLeague).length === 0 && (
              <p className="text-xs text-gray-400">No active members yet.</p>
            )}
          </div>
        </div>

        <div className="border-t pt-3 mt-3">
          <button
            onClick={handleToggleLock}
            className={`w-full font-bold py-2 px-4 rounded text-sm ${
              tiebreakerLocked
                ? "bg-gray-200 hover:bg-gray-300 text-gray-800"
                : "bg-red-500 hover:bg-red-600 text-white"
            }`}
          >
            {tiebreakerLocked ? "Unlock Tiebreaker" : "Lock Tiebreaker"}
          </button>
          {!tiebreakerLocked && (
            <p className="text-xs text-gray-500 mt-1">
              Locking stops new guesses and automatically fills in a guess (carried
              forward from their last submitted week) for anyone who never entered one.
            </p>
          )}
        </div>
      </div>

      {/* Pick Counts by Game — tiebreaker status first, then every game in
          kickoff order, each with its own "copy contacts" for exactly the
          people who haven't picked THAT game yet (not a blanket reminder). */}
      <div className="mb-8 border p-4 rounded bg-gray-50">
        <h3 className="text-lg font-bold mb-1">Pick Counts by Game</h3>
        <p className="text-sm text-gray-600 mb-4">
          Reminders are per-game — someone who's locked in Thursday's pick but is still
          deciding Sunday's won't get pulled into a Sunday reminder.
        </p>

        <div className="space-y-2">
          {/* Tiebreaker row */}
          <div className="flex items-center justify-between border rounded bg-white px-3 py-2 border-dashed">
            <div>
              <div className="text-xs text-gray-500">This week</div>
              <div className="text-sm font-semibold">Tiebreaker entered</div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`text-xs font-bold px-2 py-1 rounded-full ${
                  tiebreakerMissing.length === 0
                    ? "bg-green-100 text-green-700"
                    : "bg-red-100 text-red-700"
                }`}
              >
                {allPlayerIds.length - tiebreakerMissing.length} / {allPlayerIds.length}
              </span>
              {tiebreakerMissing.length === 0 ? (
                <span className="text-xs text-gray-400">All set</span>
              ) : (
                <button
                  onClick={() => copyMissingContacts("tiebreaker", tiebreakerMissing)}
                  className="text-xs font-semibold text-blue-600"
                >
                  {copiedKey === "tiebreaker" ? "Copied!" : "Copy contacts"}
                </button>
              )}
            </div>
          </div>

          {/* One row per game, in kickoff/display order */}
          {games.map((game) => {
            const picked = pickedByGame[game.id] || new Set<string>();
            const missing = allPlayerIds.filter((id) => !picked.has(id));
            const isComplete = missing.length === 0;
            const key = `game-${game.id}`;
            const isExpanded = fillingGameId === game.id;
            // Only makes sense to fill in a missed pick once the game's
            // actually locked — before that, the player can still just pick
            // it themselves. Same real-time check as the results-entry
            // section above: g.isLocked alone doesn't reflect kickoff
            // having passed, only an explicit lock/result action.
            const gameIsPastKickoff =
              !game.timeTBD && !!game.gameTime && new Date(game.gameTime) <= now;
            const gameDetails = pickDetailsByGame[game.id] || {};
            const wildcardAssignedIds = Object.keys(gameDetails).filter(
              (pid) => gameDetails[pid].isWildcard
            );
            // Anyone the panel should let the commissioner set/change a pick
            // for: still missing entirely, or already has a wildcard-
            // assigned pick that might need correcting. A player's own
            // deliberate pick isn't editable here — only ones the
            // commissioner made on someone's behalf.
            const editablePlayerIds = Array.from(new Set([...missing, ...wildcardAssignedIds]));
            const canFillIn = (game.isLocked || gameIsPastKickoff) && editablePlayerIds.length > 0;
            return (
              <div key={game.id} className="border rounded bg-white px-3 py-2 mb-1">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-gray-500">
                      {game.timeTBD || !game.gameTime
                        ? "Time TBD"
                        : formatKickoff(new Date(game.gameTime))}
                    </div>
                    <div className="text-sm font-semibold">
                      {game.awayTeam} @ {game.homeTeam}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-bold px-2 py-1 rounded-full ${
                        isComplete ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                      }`}
                    >
                      {allPlayerIds.length - missing.length} / {allPlayerIds.length}
                    </span>
                    {isComplete ? (
                      <span className="text-xs text-gray-400">All set</span>
                    ) : (
                      <button
                        onClick={() => copyMissingContacts(key, missing)}
                        className="text-xs font-semibold text-blue-600"
                      >
                        {copiedKey === key ? "Copied!" : "Copy contacts"}
                      </button>
                    )}
                    {canFillIn && (
                      <button
                        onClick={() => setFillingGameId(isExpanded ? null : game.id)}
                        className="text-xs font-semibold text-purple-600"
                      >
                        {isExpanded ? "Close" : "Fill in"}
                      </button>
                    )}
                  </div>
                </div>

                {isExpanded && canFillIn && (
                  <div className="mt-2 pt-2 border-t space-y-2">
                    <p className="text-xs text-gray-500">
                      Assign or fix a pick on their behalf — marked as a wildcard/assigned pick.
                    </p>
                    {assignError && (
                      <p className="text-xs text-red-600 font-semibold">{assignError}</p>
                    )}
                    {editablePlayerIds.map((ePlayerId) => {
                      const player = players.find((p) => p.id === ePlayerId);
                      const awayColors = getTeamColor(game.awayTeam);
                      const homeColors = getTeamColor(game.homeTeam);
                      const current = gameDetails[ePlayerId]?.pickedTeam;
                      const rowKey = `${game.id}_${ePlayerId}`;
                      const isSaving = savingKey === rowKey;
                      const justSaved = savedKey === rowKey;
                      return (
                        <div key={ePlayerId} className="flex items-center gap-2">
                          <span className="text-xs flex-1 truncate">{player?.name || ePlayerId}</span>
                          {justSaved && <span className="text-xs text-green-600 font-semibold">✓</span>}
                          {isSaving && <span className="text-xs text-gray-400">Saving…</span>}
                          <button
                            onClick={() => handleAssignAndRefresh(game.id, ePlayerId, game.awayTeam)}
                            disabled={isSaving}
                            style={{ background: awayColors.bg, color: awayColors.fg }}
                            className={`text-xs font-bold px-2 py-1 rounded disabled:opacity-50 ${
                              current === game.awayTeam ? "ring-2 ring-offset-1 ring-blue-500" : ""
                            }`}
                          >
                            {game.awayTeam}
                          </button>
                          <button
                            onClick={() => handleAssignAndRefresh(game.id, ePlayerId, game.homeTeam)}
                            disabled={isSaving}
                            style={{ background: homeColors.bg, color: homeColors.fg }}
                            className={`text-xs font-bold px-2 py-1 rounded disabled:opacity-50 ${
                              current === game.homeTeam ? "ring-2 ring-offset-1 ring-blue-500" : ""
                            }`}
                          >
                            {game.homeTeam}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// WEEKLY SUMMARY - What you screenshot and send out
// ============================================================================
//
// Matches the format from the real message snapshot: a colored grid of every
// player's picks for the week that just locked (with points on correct
// cells), a weekly-results table and a separate season-standings table, and
// the commissioner's own picks for the NEXT week as compact chips. Built to
// be screenshotted and emailed.

// ============================================================================
// EVERYONE'S PICKS - The genuinely player-facing "who picked what" view.
// Separate from WeeklySummary (which is the commissioner's screenshot-and-
// send recap tool, with scoring/rank baggage that isn't the point here).
// This is just: for each game this week, who picked which team — visible
// exactly per the same reveal rules as everywhere else (a game's picks
// show once it locks; the commissioner's own may show earlier if they've
// locked their week). Tiebreaker guesses get their own row, tied to the
// last game on the pick sheet — that row only appears once that game
// locks, same moment those last-game picks become public.
// ============================================================================

export function EveryonesPicksScreen() {
  const {
    leagueId,
    playerId,
    games,
    players,
    currentWeek,
    setCurrentWeek,
    league,
    loading,
    isCommissioner,
  } = useLeague();
  const now = useNow();
  const [picks, setPicks] = useState<schema.PickDoc[]>([]);
  const [tiebreaker, setTiebreaker] = useState<schema.WeeklyTiebreakerDoc | null>(null);
  const [tiebreakerGuesses, setTiebreakerGuesses] = useState<schema.TiebreakerGuessDoc[]>([]);
  const [loadingPicks, setLoadingPicks] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  React.useEffect(() => {
    if (!leagueId || !playerId) return;
    setLoadingPicks(true);
    setLoadError(null);
    (async () => {
      try {
        const picksData = await firebaseUtils.getVisiblePicksForWeek(leagueId, currentWeek, playerId);
        setPicks(picksData);
        const tb = await firebaseUtils.getWeeklyTiebreaker(leagueId, currentWeek);
        setTiebreaker(tb);
        try {
          const guesses = isCommissioner
            ? await firebaseUtils.getAllTiebreakerGuessesForWeek(leagueId, currentWeek)
            : await firebaseUtils.getVisibleTiebreakerGuessesForWeek(leagueId, currentWeek, playerId);
          setTiebreakerGuesses(guesses);
        } catch {
          // Guess list needs the new visibleToAll rule/index. Don't blank
          // the whole summary if that query isn't allowed yet.
          setTiebreakerGuesses([]);
        }
      } catch (err) {
        setLoadError(`Failed to load picks: ${err}`);
      } finally {
        setLoadingPicks(false);
      }
    })();
  }, [leagueId, playerId, currentWeek, isCommissioner]);

  if (loading || loadingPicks) return <div className="p-4">Loading...</div>;
  if (loadError) return <div className="p-4 text-red-600 text-sm">{loadError}</div>;

  // Same visual pattern as My Summary's grid, pivoted: columns are players
  // instead of weeks, since this is one week at a time rather than one
  // player across the whole season. A cell with no data means either the
  // player hasn't picked, or they have but it isn't revealed to this
  // viewer yet (their own picks always come through; everyone else's only
  // once locked) — deliberately indistinguishable, same "—" placeholder
  // either way, since that's the honest amount of information to show.
  const pickByPlayerGame = new Map<string, schema.PickDoc>();
  picks.forEach((p) => pickByPlayerGame.set(`${p.playerId}_${p.gameId}`, p));

  const guessByPlayer = new Map<string, schema.TiebreakerGuessDoc>();
  tiebreakerGuesses.forEach((g) => guessByPlayer.set(g.playerId, g));

  const sortedGames = [...games].sort((a, b) => a.order - b.order); // pick-sheet order
  const lastGame = sortedGames.length > 0 ? sortedGames[sortedGames.length - 1] : null;
  const lastGamePastKickoff =
    !!lastGame && !lastGame.timeTBD && !!lastGame.gameTime && new Date(lastGame.gameTime) <= now;
  // TB row is tied to the last pick-sheet game: hidden until that game
  // has locked, same moment that game's picks become public.
  const showTiebreakerRow =
    !!lastGame && (lastGame.isLocked || lastGame.isManuallyLocked || lastGamePastKickoff);

  // Viewer's own column first, then the commissioner's (skipped if that's
  // the same person — a commissioner viewing their own summary just gets
  // their one column up front, no duplicate), then everyone else
  // alphabetical.
  const commissionerId = league?.commissionerId;
  const sortedPlayers = [...players]
    .filter((p) => !p.removedFromLeague)
    .sort((a, b) => {
      const rank = (p: typeof a) => (p.id === playerId ? 0 : p.id === commissionerId ? 1 : 2);
      const rankDiff = rank(a) - rank(b);
      if (rankDiff !== 0) return rankDiff;
      return a.name.localeCompare(b.name);
    });

  const pointsByPlayer = new Map<string, number>();
  sortedPlayers.forEach((p) => {
    const total = sortedGames.reduce((sum, g) => {
      const pick = pickByPlayerGame.get(`${p.id}_${g.id}`);
      return sum + (pick?.isCorrect ? pick.pointsAwarded || 0 : 0);
    }, 0);
    pointsByPlayer.set(p.id, total);
  });
  const maxPoints = Math.max(0, ...Array.from(pointsByPlayer.values()));
  const weeklyLeaders = sortedPlayers
    .filter((p) => maxPoints > 0 && pointsByPlayer.get(p.id) === maxPoints)
    .map((p) => p.id);

  const guessValues = new Map<string, number>();
  tiebreakerGuesses.forEach((g) => guessValues.set(g.playerId, g.guess));

  // Only a real points-tie makes the TB matter. Closest guess in the whole
  // field is not a week win — yellow is reserved for "broke the tie."
  const wonWeekOnTiebreaker =
    showTiebreakerRow &&
    weeklyLeaders.length > 1 &&
    tiebreaker?.answer !== null &&
    tiebreaker?.answer !== undefined
      ? new Set(
          firebaseUtils.winningTiebreakerPlayerIds(
            weeklyLeaders,
            guessValues,
            tiebreaker.answer,
            tiebreaker.rule ?? "closest"
          )
        )
      : new Set<string>();

  return (
    <div className="p-4">
      <WeekSelector currentWeek={currentWeek} officialWeek={league?.currentWeek} onChange={setCurrentWeek}>
        {tiebreaker?.question && (
          <span className="text-sm text-gray-700 leading-snug pt-1">
            {tiebreaker.question}
          </span>
        )}
      </WeekSelector>
      <h2 className="text-2xl font-bold mb-1">Weekly Summary</h2>
      <p className="text-sm text-gray-600 mb-4">
        Who picked what this week. A game's picks show up once it locks at kickoff — until then
        it's still private, same as everywhere else.
      </p>

      {sortedGames.length === 0 || sortedPlayers.length === 0 ? (
        <p className="text-sm text-gray-500">No games or members yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="border-collapse mx-auto text-center">
            <thead>
              <tr>
                <th className="w-24 min-w-[6rem] text-xs font-bold text-gray-600 px-1 pb-2 whitespace-nowrap bg-white align-bottom text-center">
                  Game
                </th>
                {sortedPlayers.map((p) => (
                  <th key={p.id} className="w-20 px-0 pb-2 align-bottom">
                    <div
                      className="text-xs font-bold text-gray-600 whitespace-nowrap mx-auto"
                      style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
                    >
                      {p.name}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedGames.map((g) => (
                <tr key={g.id}>
                  <td className="w-24 min-w-[6rem] p-0.5 text-xs text-gray-600 bg-white" style={{ textAlign: "center" }}>
                    <div className="flex flex-col items-center justify-center min-h-[2.25rem] leading-tight py-0.5">
                      <div className="whitespace-nowrap">{g.awayTeam} @ {g.homeTeam}</div>
                      {g.result && (g.result.winnerScore > 0 || g.result.loserScore > 0) && (
                        <div className="text-[10px] font-semibold text-gray-800">
                          {g.result.winner === g.awayTeam ? g.result.winnerScore : g.result.loserScore}
                          –
                          {g.result.winner === g.homeTeam ? g.result.winnerScore : g.result.loserScore}
                        </div>
                      )}
                    </div>
                  </td>
                  {sortedPlayers.map((p) => {
                    const pick = pickByPlayerGame.get(`${p.id}_${g.id}`);
                    if (!pick) {
                      return (
                        <td key={p.id} className="p-0.5">
                          <div className="w-20 h-9 rounded flex items-center justify-center text-xs text-gray-300 border border-dashed mx-auto">
                            —
                          </div>
                        </td>
                      );
                    }
                    const isFinal = !!g.result;
                    const isCorrect = pick.isCorrect === true;
                    const colors = getTeamColor(pick.pickedTeam);
                    const showColor = !isFinal || isCorrect;
                    return (
                      <td key={p.id} className="p-0.5">
                        <div
                          className="w-20 h-9 rounded flex items-center justify-center text-center text-xs font-bold mx-auto"
                          style={{
                            background: showColor ? colors.bg : "#e5e7eb",
                            color: showColor ? colors.fg : "#6b7280",
                          }}
                        >
                          {pick.pickedTeam}
                          {isFinal && isCorrect && pick.pointsAwarded !== undefined && (
                            <span>&nbsp;({pick.pointsAwarded})</span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {showTiebreakerRow && lastGame && (
                <tr>
                  <td className="w-24 min-w-[6rem] p-0.5 text-xs text-gray-600 bg-white" style={{ textAlign: "center" }}>
                    <div className="flex flex-col items-center justify-center min-h-[2.25rem] leading-tight">
                      <div className="font-bold text-gray-700 whitespace-nowrap">Tiebreaker</div>
                      {tiebreaker?.answer !== null && tiebreaker?.answer !== undefined && (
                        <div className="text-[10px] font-bold text-green-700">
                          Answer: {tiebreaker.answer}
                        </div>
                      )}
                      {wonWeekOnTiebreaker.size > 0 && (
                        <div className="text-[10px] font-semibold text-yellow-800">
                          Broke the tie
                        </div>
                      )}
                    </div>
                  </td>
                  {sortedPlayers.map((p) => {
                    const guess = guessByPlayer.get(p.id);
                    if (!guess) {
                      return (
                        <td key={p.id} className="p-0.5">
                          <div className="w-20 h-9 rounded flex items-center justify-center text-xs text-gray-300 border border-dashed mx-auto">
                            —
                          </div>
                        </td>
                      );
                    }
                    const brokeTheTie = wonWeekOnTiebreaker.has(p.id);
                    return (
                      <td key={p.id} className="p-0.5">
                        <div
                          className={`w-20 min-h-[2.25rem] rounded flex flex-col items-center justify-center text-center text-xs font-bold mx-auto px-0.5 ${
                            brokeTheTie
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {guess.guess}
                          {brokeTheTie && (
                            <span className="text-[9px] font-semibold leading-none mt-0.5">Won TB</span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              )}
              <tr className="border-t-2">
                <td className="w-24 min-w-[6rem] p-1 text-xs font-bold text-gray-700 bg-white" style={{ textAlign: "center" }}>
                  Total
                </td>
                {sortedPlayers.map((p) => {
                  const total = sortedGames.reduce((sum, g) => {
                    const pick = pickByPlayerGame.get(`${p.id}_${g.id}`);
                    return sum + (pick?.isCorrect ? pick.pointsAwarded || 0 : 0);
                  }, 0);
                  return (
                    <td key={p.id} className="p-1 text-xs font-bold text-gray-700 text-center">
                      {total}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Distinct, print/email-friendly line colors for the Weekly Recap progress
// chart. Assigned by roster order so a player's color stays put when the
// weekly ranking reshuffles.
const PLAYER_LINE_COLORS = [
  "#1d4ed8",
  "#dc2626",
  "#15803d",
  "#b45309",
  "#7c3aed",
  "#0e7490",
  "#be185d",
  "#374151",
  "#ca8a04",
  "#0f766e",
  "#9333ea",
  "#c2410c",
  "#2563eb",
  "#166534",
  "#9f1239",
  "#0369a1",
  "#3f6212",
  "#9a3412",
  "#5b21b6",
  "#115e59",
];

function niceChartMax(value: number): number {
  if (value <= 5) return 5;
  if (value <= 10) return 10;
  if (value <= 15) return 15;
  if (value <= 20) return 20;
  if (value <= 30) return 30;
  if (value <= 40) return 40;
  if (value <= 50) return 50;
  if (value <= 80) return 80;
  if (value <= 100) return 100;
  return Math.ceil(value / 25) * 25;
}

function chartYTicks(max: number): number[] {
  let step = 5;
  if (max <= 5) step = 1;
  else if (max <= 10) step = 2;
  else if (max <= 20) step = 5;
  else if (max <= 40) step = 10;
  else if (max <= 80) step = 20;
  else step = 25;
  const ticks: number[] = [];
  for (let v = 0; v <= max; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] !== max) ticks.push(max);
  return ticks;
}

/** Catmull-Rom spline as cubic Bézier — keeps the chart a plain SVG. */
function smoothLinePath(xs: number[], ys: number[], tension = 0.5): string {
  if (xs.length === 0) return "";
  const pts = xs.map((x, i) => ({ x, y: ys[i] }));
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  if (pts.length === 1) return d;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const k = tension / 6;
    const c1x = p1.x + (p2.x - p0.x) * k;
    const c1y = p1.y + (p2.y - p0.y) * k;
    const c2x = p2.x - (p3.x - p1.x) * k;
    const c2y = p2.y - (p3.y - p1.y) * k;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

type RecapPickCell = { pickedTeam: string; isCorrect?: boolean; pointsAwarded?: number };

function WeeklyProgressChart({
  games,
  rankedPlayers,
  pickLookup,
  colorByPlayerId,
  width,
  height,
}: {
  games: schema.UIGame[];
  rankedPlayers: schema.PlayerDoc[];
  pickLookup: { [playerId: string]: { [gameId: string]: RecapPickCell } };
  colorByPlayerId: { [playerId: string]: string };
  width: number;
  height: number;
}) {
  const finalGames = games.filter((g) => g.result).sort((a, b) => a.order - b.order);
  if (finalGames.length === 0 || rankedPlayers.length === 0) return null;

  const series = rankedPlayers.map((player) => {
    let cum = 0;
    const values = [
      0,
      ...finalGames.map((g) => {
        cum += pickLookup[player.id]?.[g.id]?.pointsAwarded || 0;
        return cum;
      }),
    ];
    return {
      player,
      color: colorByPlayerId[player.id] || PLAYER_LINE_COLORS[0],
      values,
      label: player.name.length > 18 ? `${player.name.slice(0, 17)}…` : player.name,
      total: values[values.length - 1] ?? 0,
    };
  });

  // Players with identical point paths draw exactly on top of each other,
  // so each one in a shared path gets an interleaved dash of its own color.
  const DASH = 8;
  const sharedPaths = new Map<string, string[]>();
  series.forEach((s) => {
    const key = s.values.join(",");
    sharedPaths.set(key, [...(sharedPaths.get(key) || []), s.player.id]);
  });
  const dashFor = (s: (typeof series)[number]) => {
    const group = sharedPaths.get(s.values.join(",")) || [];
    if (group.length < 2) return null;
    const idx = group.indexOf(s.player.id);
    return {
      dasharray: `${DASH} ${DASH * (group.length - 1)}`,
      dashoffset: -idx * DASH,
      sharedWith: group.length - 1,
    };
  };

  const yMax = niceChartMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const yTicks = chartYTicks(yMax);

  const W = width;
  const H = height;
  const padL = 48;
  const padR = 230;
  const padT = 20;
  const padB = 40;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const xStep = innerW / finalGames.length;

  const xAt = (i: number) => padL + i * xStep;
  const yAt = (v: number) => padT + innerH - (v / yMax) * innerH;

  // End-of-line name labels sit as close to each player's last dot as they
  // can: labels that would collide merge into a block centered on the
  // average of their dots, so the nudge is split up and down evenly.
  const LABEL_GAP = 20;
  const lastIdx = finalGames.length;
  const endLabels = series
    .map((s) => ({ s, dotY: yAt(s.total), y: yAt(s.total) }))
    .sort((a, b) => a.dotY - b.dotY || b.s.total - a.s.total);
  const labelTop = padT;
  const labelBottom = H - padB;
  type LabelBlock = { items: typeof endLabels; top: number };
  const placeBlock = (items: typeof endLabels): LabelBlock => {
    const center = items.reduce((sum, l) => sum + l.dotY, 0) / items.length;
    const span = (items.length - 1) * LABEL_GAP;
    const top = Math.min(Math.max(center - span / 2, labelTop), labelBottom - span);
    return { items, top };
  };
  const blocks: LabelBlock[] = [];
  endLabels.forEach((label) => {
    blocks.push(placeBlock([label]));
    while (blocks.length > 1) {
      const cur = blocks[blocks.length - 1];
      const prev = blocks[blocks.length - 2];
      if (prev.top + prev.items.length * LABEL_GAP <= cur.top) break;
      blocks.splice(-2, 2, placeBlock([...prev.items, ...cur.items]));
    }
  });
  blocks.forEach((b) => b.items.forEach((l, i) => (l.y = b.top + i * LABEL_GAP)));

  return (
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="block"
          role="img"
          aria-label="Cumulative weekly points after each final, in pick-sheet order"
        >
          <title>Cumulative weekly points after each final</title>
          {yTicks.map((tick) => {
            const y = yAt(tick);
            return (
              <g key={tick}>
                <line
                  x1={padL}
                  y1={y}
                  x2={W - padR}
                  y2={y}
                  stroke="#e5e7eb"
                  strokeWidth={1}
                />
                <text
                  x={padL - 8}
                  y={y + 4}
                  textAnchor="end"
                  fill="#6b7280"
                  fontSize={14}
                  fontFamily="system-ui, sans-serif"
                >
                  {tick}
                </text>
              </g>
            );
          })}
          {/* Draw lower-ranked lines first so the leader sits on top. */}
          {[...series].reverse().map((s) => {
            const xs = s.values.map((_, i) => xAt(i));
            const ys = s.values.map((v) => yAt(v));
            const dash = dashFor(s);
            return (
              <g key={s.player.id}>
                {s.values.length > 1 && (
                  <path
                    d={smoothLinePath(xs, ys)}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={dash ? 4 : 3}
                    strokeLinejoin="round"
                    strokeLinecap="butt"
                    strokeDasharray={dash?.dasharray}
                    strokeDashoffset={dash?.dashoffset}
                  />
                )}
                {s.values.map((v, i) =>
                  i === 0 ? null : (
                    <circle key={finalGames[i - 1].id} cx={xAt(i)} cy={yAt(v)} r={4} fill={s.color} />
                  )
                )}
              </g>
            );
          })}
          <circle cx={xAt(0)} cy={yAt(0)} r={3.5} fill="#6b7280" />
          <text
            x={xAt(0)}
            y={H - 12}
            textAnchor="middle"
            fill="#6b7280"
            fontSize={13}
            fontFamily="system-ui, sans-serif"
          >
            Start
          </text>
          {finalGames.map((g, i) => (
            <text
              key={g.id}
              x={xAt(i + 1)}
              y={H - 12}
              textAnchor="middle"
              fill="#374151"
              fontSize={14}
              fontWeight={600}
              fontFamily="system-ui, sans-serif"
            >
              {g.result?.winner || `${g.awayTeam}@${g.homeTeam}`}
            </text>
          ))}
          {endLabels.map(({ s, dotY, y }) => {
            const x = xAt(lastIdx);
            return (
              <g key={s.player.id}>
                {Math.abs(y - dotY) > 1 && (
                  <line x1={x + 6} y1={dotY} x2={x + 30} y2={y} stroke={s.color} strokeWidth={1.25} />
                )}
                <text
                  x={x + 34}
                  y={y + 5}
                  fill={s.color}
                  fontSize={15}
                  fontWeight={600}
                  fontFamily="system-ui, sans-serif"
                >
                  {s.label}
                  <tspan fill="#111827" fontWeight={700} dx={5}>
                    {s.total}
                  </tspan>
                </text>
              </g>
            );
          })}
        </svg>
  );
}

export function WeekProgressScreen() {
  const { leagueId, playerId, games, players, currentWeek, setCurrentWeek, league, loading } = useLeague();
  const [picks, setPicks] = useState<schema.PickDoc[]>([]);
  const [loadingPicks, setLoadingPicks] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [chartBox, setChartBox] = useState<HTMLDivElement | null>(null);
  const [chartSize, setChartSize] = useState({ width: 0, height: 0 });

  React.useEffect(() => {
    if (!chartBox) return;
    const measure = () =>
      setChartSize({
        width: chartBox.clientWidth,
        height: Math.max(1400, Math.round(window.innerHeight * 1.4)),
      });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(chartBox);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [chartBox]);

  React.useEffect(() => {
    if (!leagueId || !playerId) return;
    setLoadingPicks(true);
    setLoadError(null);
    firebaseUtils
      .getVisiblePicksForWeek(leagueId, currentWeek, playerId)
      .then(setPicks)
      .catch((err) => setLoadError(`Failed to load picks: ${err}`))
      .finally(() => setLoadingPicks(false));
  }, [leagueId, playerId, currentWeek]);

  const activePlayers = players.filter((p) => !p.removedFromLeague);
  const colorByPlayerId: { [playerId: string]: string } = {};
  activePlayers.forEach((p, i) => {
    colorByPlayerId[p.id] = PLAYER_LINE_COLORS[i % PLAYER_LINE_COLORS.length];
  });

  const pickLookup: { [playerId: string]: { [gameId: string]: RecapPickCell } } = {};
  picks.forEach((p) => {
    if (!pickLookup[p.playerId]) pickLookup[p.playerId] = {};
    pickLookup[p.playerId][p.gameId] = {
      pickedTeam: p.pickedTeam,
      isCorrect: p.isCorrect,
      pointsAwarded: p.pointsAwarded,
    };
  });

  const weekPoints = (id: string) =>
    Object.values(pickLookup[id] || {}).reduce((sum, p) => sum + (p.pointsAwarded || 0), 0);
  const rankedPlayers = [...activePlayers].sort(
    (a, b) => weekPoints(b.id) - weekPoints(a.id) || a.name.localeCompare(b.name)
  );
  const hasFinals = games.some((g) => g.result);

  return (
    <div className="p-4">
      <WeekSelector currentWeek={currentWeek} officialWeek={league?.currentWeek} onChange={setCurrentWeek} />
      <h2 className="text-2xl font-bold mb-1">Week {currentWeek} Progress</h2>
      <p className="text-sm text-gray-600 mb-4">Running point totals after each final, in pick-sheet order.</p>
      {loading || loadingPicks ? (
        <div className="text-sm text-gray-600">Loading...</div>
      ) : loadError ? (
        <div className="text-sm text-red-600">{loadError}</div>
      ) : !hasFinals ? (
        <div className="text-sm text-gray-600">No finals yet this week.</div>
      ) : (
        <div ref={setChartBox} className="border rounded bg-white overflow-hidden">
          {chartSize.width > 0 && (
            <WeeklyProgressChart
              games={games}
              rankedPlayers={rankedPlayers}
              pickLookup={pickLookup}
              colorByPlayerId={colorByPlayerId}
              width={chartSize.width}
              height={chartSize.height}
            />
          )}
        </div>
      )}
    </div>
  );
}

export function WeeklySummary() {
  const { leagueId, playerId, players, standings, currentWeek } = useLeague();
  const [summaryWeek, setSummaryWeek] = useState(currentWeek);
  const [summaryGames, setSummaryGames] = useState<schema.UIGame[]>([]);
  const [summaryPicks, setSummaryPicks] = useState<schema.PickDoc[]>([]);
  const [nextWeekGames, setNextWeekGames] = useState<schema.UIGame[]>([]);
  const [nextWeekPickByGame, setNextWeekPickByGame] = useState<{ [gameId: string]: string }>({});
  const [weekTiebreaker, setWeekTiebreaker] = useState<schema.WeeklyTiebreakerDoc | null>(null);
  const [weekTbGuesses, setWeekTbGuesses] = useState<schema.TiebreakerGuessDoc[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const nextWeek = summaryWeek + 1;

  React.useEffect(() => {
    if (!leagueId) return;
    setLoadingSummary(true);
    (async () => {
      const [gamesData, picksData, upcomingGames, myUpcomingPicks, tb, guesses] = await Promise.all([
        firebaseUtils.getGamesForWeek(leagueId, summaryWeek),
        firebaseUtils.getAllPicksForWeek(leagueId, summaryWeek),
        firebaseUtils.getGamesForWeek(leagueId, nextWeek),
        playerId
          ? firebaseUtils.getPlayerWeeklyPicks(leagueId, playerId, nextWeek)
          : Promise.resolve([] as schema.PickDoc[]),
        firebaseUtils.getWeeklyTiebreaker(leagueId, summaryWeek),
        firebaseUtils.getAllTiebreakerGuessesForWeek(leagueId, summaryWeek).catch(() => [] as schema.TiebreakerGuessDoc[]),
      ]);
      const toUIGame = (g: schema.GameDoc): schema.UIGame => ({
        id: g.id,
        week: g.week,
        order: g.order,
        playoffMultiplier: g.playoffMultiplier,
        homeTeam: g.homeTeam,
        awayTeam: g.awayTeam,
        gameTime: g.gameTime ? g.gameTime.toDate() : null,
        timeTBD: g.timeTBD,
        isLocked: g.isLocked,
        result: g.result,
      });
      setSummaryGames(gamesData.map(toUIGame).sort((a, b) => a.order - b.order));
      setSummaryPicks(picksData);
      setNextWeekGames(upcomingGames.map(toUIGame).sort((a, b) => a.order - b.order));
      const upcomingMap: { [gameId: string]: string } = {};
      myUpcomingPicks.forEach((p) => {
        upcomingMap[p.gameId] = p.pickedTeam;
      });
      setNextWeekPickByGame(upcomingMap);
      setWeekTiebreaker(tb);
      setWeekTbGuesses(guesses);
      setLoadingSummary(false);
    })();
  }, [leagueId, playerId, summaryWeek, nextWeek]);

  const recapPlayers = players.filter((p) => !p.removedFromLeague);

  const pickLookup: {
    [playerId: string]: {
      [gameId: string]: { pickedTeam: string; isCorrect?: boolean; pointsAwarded?: number };
    };
  } = {};
  summaryPicks.forEach((p) => {
    if (!pickLookup[p.playerId]) pickLookup[p.playerId] = {};
    pickLookup[p.playerId][p.gameId] = {
      pickedTeam: p.pickedTeam,
      isCorrect: p.isCorrect,
      pointsAwarded: p.pointsAwarded,
    };
  });

  const tbGuessByPlayer = new Map<string, number>();
  weekTbGuesses.forEach((g) => tbGuessByPlayer.set(g.playerId, g.guess));

  function tiebreakerDistance(playerId: string): number {
    const answer = weekTiebreaker?.answer;
    if (answer === null || answer === undefined) return Number.POSITIVE_INFINITY;
    const guess = tbGuessByPlayer.get(playerId);
    if (guess === undefined) return Number.POSITIVE_INFINITY;
    if (weekTiebreaker?.rule === "closest_without_going_over") {
      if (guess <= answer) return answer - guess;
      return 1_000_000 + (guess - answer);
    }
    return Math.abs(guess - answer);
  }

  const weeklyResults = recapPlayers.map((player) => {
    const theirPicks = summaryPicks.filter((p) => p.playerId === player.id);
    const points = theirPicks.reduce((sum, p) => sum + (p.pointsAwarded || 0), 0);
    const correct = theirPicks.filter((p) => p.isCorrect).length;
    return { player, points, correct };
  });
  weeklyResults.sort(
    (a, b) =>
      b.points - a.points ||
      tiebreakerDistance(a.player.id) - tiebreakerDistance(b.player.id) ||
      b.correct - a.correct ||
      a.player.name.localeCompare(b.player.name)
  );

  const tiedAtTop =
    weeklyResults.length >= 2 &&
    weeklyResults[0].points > 0 &&
    weeklyResults[0].points === weeklyResults[1].points;
  const tbWinnerIds = new Set<string>();
  if (tiedAtTop) {
    const topPoints = weeklyResults[0].points;
    const tiedIds = weeklyResults.filter((r) => r.points === topPoints).map((r) => r.player.id);
    const fromGuesses =
      weekTiebreaker?.answer !== null && weekTiebreaker?.answer !== undefined
        ? firebaseUtils.winningTiebreakerPlayerIds(
            tiedIds,
            tbGuessByPlayer,
            weekTiebreaker.answer,
            weekTiebreaker.rule ?? "closest"
          )
        : [];
    const fromDoc = weekTiebreaker?.resolvedWinnerIds || [];
    [...fromGuesses, ...fromDoc, weeklyResults[0].player.id].forEach((id) => {
      if (tiedIds.includes(id)) tbWinnerIds.add(id);
    });
  }

  const seasonRows = standings.filter((s) => recapPlayers.some((p) => p.id === s.playerId));
  const nextWeekPickedGames = nextWeekGames.filter((g) => nextWeekPickByGame[g.id]);

  return (
    <div className="p-4 max-w-6xl">
      <h2 className="text-2xl font-bold mb-3">Weekly Recap</h2>

      <WeekSelector currentWeek={summaryWeek} officialWeek={currentWeek} onChange={setSummaryWeek} />

      {loadingSummary ? (
        <div className="text-sm text-gray-600 mb-6">Loading...</div>
      ) : (
        <>
          {/* Everyone's picks, color-coded, for the week that just locked */}
          <div className="mb-6 overflow-x-auto border rounded">
            <table className="w-full text-xs border-collapse table-fixed">
              <thead>
                <tr>
                  <th className="p-1 bg-gray-100 sticky left-0 text-left w-20">Game</th>
                  {recapPlayers.map((p) => (
                    <th
                      key={p.id}
                      className="px-0 py-1 bg-gray-100 text-center whitespace-nowrap overflow-hidden"
                      title={p.name}
                    >
                      {p.shortName || p.name.slice(0, 5)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summaryGames.map((g) => (
                  <tr key={g.id}>
                    <td className="p-1 font-semibold whitespace-nowrap sticky left-0 bg-white">
                      {g.awayTeam}@{g.homeTeam}
                    </td>
                    {recapPlayers.map((p) => {
                      const pick = pickLookup[p.id]?.[g.id];
                      if (!pick) {
                        return (
                          <td key={p.id} className="p-0.5">
                            <div className="w-full h-9 box-border border-2 border-dashed border-gray-200 rounded flex items-center justify-center text-[10px] text-gray-300 mx-auto">
                              —
                            </div>
                          </td>
                        );
                      }
                      const colors = getTeamColor(pick.pickedTeam);
                      const isFinal = !!g.result;
                      const showPoints =
                        isFinal && pick.isCorrect === true && pick.pointsAwarded !== undefined;
                      const borderColor =
                        pick.isCorrect === true
                          ? "#16a34a"
                          : pick.isCorrect === false
                          ? "#dc2626"
                          : "transparent";
                      const isLoss = pick.isCorrect === false;
                      return (
                        <td key={p.id} className="p-0.5">
                          <div
                            className="w-full h-9 box-border border-2 rounded flex flex-col items-center justify-center leading-none mx-auto"
                            style={{
                              background: isLoss ? "#ffffff" : colors.bg,
                              color: isLoss ? "#6b7280" : colors.fg,
                              borderColor,
                            }}
                          >
                            <span className="text-[10px] font-bold">{pick.pickedTeam}</span>
                            {showPoints && (
                              <span className="text-[9px] font-semibold">({pick.pointsAwarded})</span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mb-8 grid grid-cols-2 gap-3 items-start">
            <div className="border rounded overflow-hidden min-w-0">
              <div className="bg-gray-100 px-2 py-1.5 text-xs font-bold">Week {summaryWeek} results</div>
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-1.5 w-6">#</th>
                    <th className="text-left p-1.5">Player</th>
                    <th className="text-right p-1.5">Pts</th>
                    <th className="text-right p-1.5">W</th>
                  </tr>
                </thead>
                <tbody>
                  {weeklyResults.map((r, i) => (
                    <tr key={r.player.id} className="border-t">
                      <td className="p-1.5 text-gray-500">{i + 1}</td>
                      <td className="p-1.5 max-w-[9rem]">
                        <div className="truncate" title={r.player.name}>
                          {r.player.name}
                        </div>
                        {tbWinnerIds.has(r.player.id) && (
                          <div className="text-[10px] font-bold text-gray-800 leading-tight whitespace-nowrap">
                            Won on tiebreaker
                          </div>
                        )}
                      </td>
                      <td className="p-1.5 text-right font-semibold">{r.points}</td>
                      <td className="p-1.5 text-right">{r.correct}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="border rounded overflow-hidden min-w-0">
              <div className="bg-gray-100 px-2 py-1.5 text-xs font-bold">Season standings</div>
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-1.5 w-6">#</th>
                    <th className="text-left p-1.5">Player</th>
                    <th className="text-right p-1.5">Pts</th>
                    <th className="text-right p-1.5">W</th>
                  </tr>
                </thead>
                <tbody>
                  {seasonRows.map((s) => (
                    <tr key={s.playerId} className="border-t">
                      <td className="p-1.5 text-gray-500">{s.rank}</td>
                      <td className="p-1.5 max-w-[7.5rem] truncate" title={s.playerName}>
                        {s.playerName}
                      </td>
                      <td className="p-1.5 text-right font-semibold">{s.totalPoints}</td>
                      <td className="p-1.5 text-right">{s.totalCorrect}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <h3 className="text-sm font-bold mb-1">My Week {nextWeek} Picks</h3>
      {nextWeekPickedGames.length === 0 ? (
        <div className="text-xs text-gray-500 mb-4">
          {nextWeekGames.length === 0
            ? `No Week ${nextWeek} games yet.`
            : `No picks made yet for Week ${nextWeek}.`}
        </div>
      ) : (
        <div className="flex flex-col gap-px w-20 mb-4">
          {nextWeekPickedGames.map((g) => {
            const pick = nextWeekPickByGame[g.id];
            const colors = getTeamColor(pick);
            return (
              <div
                key={g.id}
                className="text-[11px] font-bold text-center py-0.5"
                style={{ background: colors.bg, color: colors.fg }}
                title={`${g.awayTeam} @ ${g.homeTeam}`}
              >
                {pick}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================

type ViewType = "picks" | "mysummary" | "everyonespicks" | "progress" | "standings" | "payouts" | "commissioner" | "summary" | "members";

// ============================================================================
// MEMBERS SCREEN - Roster with contact info and dues tracking (commissioner only)
// ============================================================================

export function MembersScreen() {
  const { players, setPlayerPaid, removePlayer, restorePlayer, updatePlayerPhone, updatePlayerShortName } =
    useLeague();
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null);
  const [confirmingUnpay, setConfirmingUnpay] = useState<string | null>(null);
  const [editingPhone, setEditingPhone] = useState<string | null>(null);
  const [phoneDraft, setPhoneDraft] = useState("");
  const [editingShortName, setEditingShortName] = useState<string | null>(null);
  const [shortNameDraft, setShortNameDraft] = useState("");

  const activePlayers = players.filter((p) => !p.removedFromLeague);
  const removedPlayers = players.filter((p) => p.removedFromLeague);
  const paidCount = activePlayers.filter((p) => p.hasPaid).length;

  const startEditingPhone = (p: schema.PlayerDoc) => {
    setPhoneDraft(p.phone || "");
    setEditingPhone(p.id);
  };
  const savePhone = (playerId: string) => {
    updatePlayerPhone(playerId, phoneDraft.trim());
    setEditingPhone(null);
  };

  const startEditingShortName = (p: schema.PlayerDoc) => {
    setShortNameDraft(p.shortName || "");
    setEditingShortName(p.id);
  };
  const saveShortName = (playerId: string) => {
    updatePlayerShortName(playerId, shortNameDraft.trim());
    setEditingShortName(null);
  };

  return (
    <div className="p-4 max-w-2xl">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-2xl font-bold">Members</h2>
        <span className="text-xs font-bold px-2 py-1 rounded-full bg-gray-100 text-gray-700">
          {paidCount} / {activePlayers.length} paid
        </span>
      </div>
      <p className="text-sm text-gray-600 mb-4">
        Names, emails, and phone numbers for everyone in the league, and who's paid their dues. The
        short nickname (max 5 characters) is only used to keep compact grids like Weekly Recap
        readable.
      </p>

      <div className="space-y-2">
        {activePlayers.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between border rounded bg-white px-3 py-2"
          >
            <div>
              <div className="text-sm font-semibold">{p.name}</div>
              <div className="text-xs text-gray-500">{p.email}</div>
              {editingPhone === p.id ? (
                <div className="flex items-center gap-1 mt-1">
                  <input
                    type="tel"
                    value={phoneDraft}
                    onChange={(e) => setPhoneDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && savePhone(p.id)}
                    placeholder="(555) 555-5555"
                    autoFocus
                    className="text-xs border rounded px-2 py-1 w-32"
                  />
                  <button
                    onClick={() => savePhone(p.id)}
                    className="text-xs font-semibold text-green-600"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingPhone(null)}
                    className="text-xs text-gray-400"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => startEditingPhone(p)}
                  className="text-xs text-gray-500 hover:underline mt-0.5"
                >
                  {p.phone || <span className="text-gray-400 italic">Add phone number</span>}
                  {p.phone && <span className="text-gray-400"> ✎</span>}
                </button>
              )}
              {editingShortName === p.id ? (
                <div className="flex items-center gap-1 mt-1">
                  <input
                    type="text"
                    value={shortNameDraft}
                    onChange={(e) => setShortNameDraft(e.target.value.slice(0, 5))}
                    onKeyDown={(e) => e.key === "Enter" && saveShortName(p.id)}
                    placeholder="5 chars"
                    maxLength={5}
                    autoFocus
                    className="text-xs border rounded px-2 py-1 w-20"
                  />
                  <button
                    onClick={() => saveShortName(p.id)}
                    className="text-xs font-semibold text-green-600"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingShortName(null)}
                    className="text-xs text-gray-400"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => startEditingShortName(p)}
                  className="text-xs text-gray-500 hover:underline mt-0.5 block"
                >
                  {p.shortName ? (
                    <>Nickname: {p.shortName}</>
                  ) : (
                    <span className="text-gray-400 italic">Add short nickname</span>
                  )}
                  {p.shortName && <span className="text-gray-400"> ✎</span>}
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {p.hasPaid && confirmingUnpay === p.id ? (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-500">Mark unpaid?</span>
                  <button
                    onClick={() => {
                      setPlayerPaid(p.id, false);
                      setConfirmingUnpay(null);
                    }}
                    className="text-xs font-bold px-2 py-1.5 rounded bg-red-600 text-white"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setConfirmingUnpay(null)}
                    className="text-xs text-gray-500 px-1"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => (p.hasPaid ? setConfirmingUnpay(p.id) : setPlayerPaid(p.id, true))}
                  className={`text-xs font-bold px-3 py-1.5 rounded-full ${
                    p.hasPaid
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {p.hasPaid ? "✓ Paid" : "Not paid"}
                </button>
              )}
              {/* Remove is only offered for someone who hasn't paid — booting
                  a paid member risks losing track of money already collected;
                  if that's genuinely needed, mark them unpaid first (its own
                  confirm step) so it's a deliberate two-step action. */}
              {!p.hasPaid &&
                (confirmingRemove === p.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        removePlayer(p.id);
                        setConfirmingRemove(null);
                      }}
                      className="text-xs font-bold px-2 py-1.5 rounded bg-red-600 text-white"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setConfirmingRemove(null)}
                      className="text-xs text-gray-500 px-1"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmingRemove(p.id)}
                    className="text-xs text-gray-400 hover:text-red-600"
                    title="Remove from league"
                  >
                    Remove
                  </button>
                ))}
            </div>
          </div>
        ))}
        {activePlayers.length === 0 && (
          <p className="text-sm text-gray-500">No members yet.</p>
        )}
      </div>

      {removedPlayers.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-gray-500 mb-2">
            Removed ({removedPlayers.length})
          </h3>
          <div className="space-y-2">
            {removedPlayers.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between border rounded bg-gray-50 px-3 py-2"
              >
                <div>
                  <div className="text-sm font-semibold text-gray-500">{p.name}</div>
                  <div className="text-xs text-gray-400">{p.email}</div>
                </div>
                <button
                  onClick={() => restorePlayer(p.id)}
                  className="text-xs font-semibold text-blue-600"
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function App() {
  const { leagueId, playerId, league, players, loading, error, isCommissioner, updateMyName, updatePlayerPhone } =
    useLeague();
  const { signOut } = useAuth();
  const [view, setView] = useState<ViewType>("picks");

  const myName = players.find((p) => p.id === playerId)?.name || "Signed in";
  const myEmail = players.find((p) => p.id === playerId)?.email || "";
  const myPhone = players.find((p) => p.id === playerId)?.phone || "";
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState("");

  const startEditingMyPhone = () => {
    setPhoneDraft(myPhone);
    setEditingPhone(true);
  };
  const saveMyPhone = () => {
    if (playerId) updatePlayerPhone(playerId, phoneDraft.trim());
    setEditingPhone(false);
  };

  const startEditingName = () => {
    setNameDraft(myName);
    setEditingName(true);
  };

  const saveNameEdit = () => {
    if (nameDraft.trim() && nameDraft.trim() !== myName) {
      updateMyName(nameDraft.trim());
    }
    setEditingName(false);
  };

  if (!leagueId || !playerId) {
    return (
      <div className="p-4">
        <h1 className="text-2xl font-bold mb-4">Contrarian Pick 'Em</h1>
        <p className="text-gray-600">Please initialize with a league ID and player ID</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-100 border border-red-400 rounded">
        <p className="text-red-700">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-start justify-between mb-2">
            <h1 className="text-3xl font-bold">
              {league?.name || "Pick 'Em"} ({league?.season})
            </h1>
            <div className="flex items-center gap-3">
              <div className="text-right">
                {editingName ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveNameEdit()}
                      autoFocus
                      className="text-sm border rounded px-2 py-1 w-40"
                    />
                    <button
                      onClick={saveNameEdit}
                      className="text-xs font-semibold text-green-600 px-1"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingName(false)}
                      className="text-xs text-gray-400 px-1"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={startEditingName}
                    className="text-sm font-semibold text-gray-800 hover:underline"
                    title="Click to edit your display name"
                  >
                    {myName} <span className="text-gray-400 font-normal">✎</span>
                  </button>
                )}
                {myEmail && <div className="text-xs text-gray-500">{myEmail}</div>}
                {editingPhone ? (
                  <div className="flex items-center gap-1 mt-0.5">
                    <input
                      type="tel"
                      value={phoneDraft}
                      onChange={(e) => setPhoneDraft(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveMyPhone()}
                      placeholder="(555) 555-5555"
                      autoFocus
                      className="text-xs border rounded px-2 py-1 w-32"
                    />
                    <button onClick={saveMyPhone} className="text-xs font-semibold text-green-600">
                      Save
                    </button>
                    <button onClick={() => setEditingPhone(false)} className="text-xs text-gray-400">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={startEditingMyPhone}
                    className="text-xs text-gray-500 hover:underline block"
                    title="Click to add/edit your phone number"
                  >
                    {myPhone || <span className="text-gray-400 italic">Add phone number</span>}
                    {myPhone && <span className="text-gray-400"> ✎</span>}
                  </button>
                )}
                {isCommissioner && (
                  <div className="text-xs font-medium text-blue-600">Commissioner</div>
                )}
              </div>
              <button
                onClick={() => signOut()}
                className="text-xs font-medium text-gray-500 hover:text-gray-800 border border-gray-300 rounded px-2 py-1"
              >
                Sign out
              </button>
            </div>
          </div>
          <div className="flex gap-4 text-sm">
            <button
              onClick={() => setView("picks")}
              className={`py-2 px-4 rounded font-medium transition ${
                view === "picks"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-200 hover:bg-gray-300"
              }`}
            >
              My Picks
            </button>
            <button
              onClick={() => setView("mysummary")}
              className={`py-2 px-4 rounded font-medium transition ${
                view === "mysummary"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-200 hover:bg-gray-300"
              }`}
            >
              My Summary
            </button>
            <button
              onClick={() => setView("everyonespicks")}
              className={`py-2 px-4 rounded font-medium transition ${
                view === "everyonespicks"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-200 hover:bg-gray-300"
              }`}
            >
              Weekly Summary
            </button>
            <button
              onClick={() => setView("standings")}
              className={`py-2 px-4 rounded font-medium transition ${
                view === "standings"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-200 hover:bg-gray-300"
              }`}
            >
              Standings
            </button>
            <button
              onClick={() => setView("payouts")}
              className={`py-2 px-4 rounded font-medium transition ${
                view === "payouts"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-200 hover:bg-gray-300"
              }`}
            >
              Payouts
            </button>
            {isCommissioner && (
              <button
                onClick={() => setView("commissioner")}
                className={`py-2 px-4 rounded font-medium transition ${
                  view === "commissioner"
                    ? "bg-blue-500 text-white"
                    : "bg-gray-200 hover:bg-gray-300"
                }`}
              >
                Commissioner
              </button>
            )}
            {isCommissioner && (
              <button
                onClick={() => setView("summary")}
                className={`py-2 px-4 rounded font-medium transition ${
                  view === "summary"
                    ? "bg-blue-500 text-white"
                    : "bg-gray-200 hover:bg-gray-300"
                }`}
              >
                Weekly Recap
              </button>
            )}
            {isCommissioner && (
              <button
                onClick={() => setView("members")}
                className={`py-2 px-4 rounded font-medium transition ${
                  view === "members"
                    ? "bg-blue-500 text-white"
                    : "bg-gray-200 hover:bg-gray-300"
                }`}
              >
                Members
              </button>
            )}
            <button
              onClick={() => setView("progress")}
              className={`py-2 px-4 rounded font-medium transition ${
                view === "progress"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-200 hover:bg-gray-300"
              }`}
            >
              Week Progress
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto">
        {loading && <div className="p-4 text-gray-600">Loading...</div>}
        {!loading && view === "picks" && <PicksScreen />}
        {!loading && view === "mysummary" && <MySummaryScreen />}
        {!loading && view === "everyonespicks" && <EveryonesPicksScreen />}
        {!loading && view === "standings" && <StandingsScreen />}
        {!loading && view === "payouts" && <PayoutsScreen />}
        {!loading && view === "commissioner" && isCommissioner && <CommissionerDashboard />}
        {!loading && view === "summary" && isCommissioner && <WeeklySummary />}
        {!loading && view === "members" && isCommissioner && <MembersScreen />}
      </div>
      {!loading && view === "progress" && <WeekProgressScreen />}
    </div>
  );
}
