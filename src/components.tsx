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
      timeZone: "America/New_York",
      month: "numeric",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }) + " ET"
  );
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
}: {
  currentWeek: number;
  officialWeek: number | undefined;
  onChange: (week: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <select
        value={currentWeek}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="border rounded px-2 py-1 text-sm font-semibold"
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
          className="text-xs text-blue-600 font-medium hover:underline"
        >
          Back to current week
        </button>
      )}
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
    isCommissioner,
    myWeekLocked,
    setMyWeekLocked,
  } = useLeague();
  const now = useNow();
  const [tbDraft, setTbDraft] = useState<string>(myTiebreakerGuess?.toString() ?? "");
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
            if (isLocked && game.pickCounts) {
              const count = game.pickCounts[abbr] || 0;
              return `${count} pick${count === 1 ? "" : "s"}`;
            }
            const spread = isAway ? game.awaySpread : game.homeSpread;
            return spread || "";
          }

          return (
            <div key={game.id} className="border rounded-lg p-3 bg-white">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-600">
                  {game.timeTBD || !game.gameTime
                    ? "Time TBD"
                    : formatKickoff(new Date(game.gameTime))}
                </span>
                {isLocked && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide bg-gray-100 border border-gray-300 text-gray-600 rounded-full px-2 py-0.5">
                    Locked
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

export function PayoutsScreen() {
  const { league, players, isCommissioner, setLeaguePayoutSettings } = useLeague();
  const [editing, setEditing] = useState(false);
  const [entryFeeDraft, setEntryFeeDraft] = useState("");
  const [weeklyDraft, setWeeklyDraft] = useState("");
  const [seasonDrafts, setSeasonDrafts] = useState<string[]>(["", "", "", "", ""]);

  const activeCount = players.filter((p) => !p.removedFromLeague).length;
  const entryFee = league?.entryFee ?? null;
  const weeklyPayout = league?.weeklyPayout ?? null;
  const seasonPayouts = league?.seasonPayouts ?? [null, null, null, null, null];

  const totalPot = entryFee !== null ? entryFee * activeCount : null;
  const totalWeeklyCommitment = weeklyPayout !== null ? weeklyPayout * 18 : 0;
  const totalSeasonCommitment = seasonPayouts.reduce((sum: number, p) => sum + (p || 0), 0);
  const totalCommitted = totalWeeklyCommitment + totalSeasonCommitment;

  const startEditing = () => {
    setEntryFeeDraft(entryFee !== null ? String(entryFee) : "");
    setWeeklyDraft(weeklyPayout !== null ? String(weeklyPayout) : "");
    setSeasonDrafts(seasonPayouts.map((p) => (p !== null ? String(p) : "")));
    setEditing(true);
  };

  const save = () => {
    setLeaguePayoutSettings({
      entryFee: entryFeeDraft ? parseFloat(entryFeeDraft) : null,
      weeklyPayout: weeklyDraft ? parseFloat(weeklyDraft) : null,
      seasonPayouts: seasonDrafts.map((d) => (d ? parseFloat(d) : null)),
    });
    setEditing(false);
  };

  const placeLabels = ["1st", "2nd", "3rd", "4th", "5th"];

  return (
    <div className="p-4 max-w-xl">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-2xl font-bold">Payouts</h2>
        {isCommissioner && !editing && (
          <button
            onClick={startEditing}
            className="text-xs font-semibold text-blue-600 hover:underline"
          >
            Edit
          </button>
        )}
      </div>
      <p className="text-sm text-gray-600 mb-4">
        Dues, weekly prize, and season-long payouts. Playoff buy-in and payouts
        aren't set up yet — coming later.
      </p>

      {editing ? (
        <div className="space-y-4 border rounded p-4 bg-gray-50">
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
          <div>
            <label className="block text-sm font-medium mb-2">Season-long payouts</label>
            <div className="space-y-2">
              {placeLabels.map((label, i) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="text-sm text-gray-600 w-10">{label}</span>
                  <input
                    type="number"
                    value={seasonDrafts[i]}
                    onChange={(e) => {
                      const next = [...seasonDrafts];
                      next[i] = e.target.value;
                      setSeasonDrafts(next);
                    }}
                    placeholder="0"
                    className="w-32 border p-2 rounded text-sm"
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={save}
              className="bg-blue-500 hover:bg-blue-600 text-white font-semibold px-4 py-2 rounded text-sm"
            >
              Save
            </button>
            <button
              onClick={() => setEditing(false)}
              className="text-sm text-gray-500 px-2"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="border rounded p-4 bg-white">
            <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">
              Dues
            </div>
            {entryFee !== null ? (
              <div className="text-sm">
                ${entryFee} × {activeCount} players ={" "}
                <span className="font-bold">${totalPot} total pot</span>
              </div>
            ) : (
              <p className="text-sm text-gray-500">Not set yet.</p>
            )}
          </div>

          <div className="border rounded p-4 bg-white">
            <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">
              Weekly Payout
            </div>
            {weeklyPayout !== null ? (
              <div className="text-sm">
                ${weeklyPayout} to that week's points leader, every week
              </div>
            ) : (
              <p className="text-sm text-gray-500">Not set yet.</p>
            )}
          </div>

          <div className="border rounded p-4 bg-white">
            <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">
              Season-Long Payouts
            </div>
            <div className="space-y-1">
              {placeLabels.map((label, i) => (
                <div key={label} className="flex justify-between text-sm">
                  <span className="text-gray-600">{label}</span>
                  <span className="font-semibold">${seasonPayouts[i] || 0}</span>
                </div>
              ))}
            </div>
          </div>

          {totalPot !== null && (
            <div
              className={`border rounded p-4 text-sm ${
                totalCommitted > totalPot ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"
              }`}
            >
              <div className="flex justify-between font-semibold">
                <span>Total committed (weekly × 18 + season)</span>
                <span>${totalCommitted}</span>
              </div>
              <div className="flex justify-between">
                <span>Total pot collected</span>
                <span>${totalPot}</span>
              </div>
              {totalCommitted > totalPot && (
                <p className="text-red-700 font-semibold mt-1">
                  Committed payouts exceed the current pot — either more players
                  need to join/pay, or the amounts need adjusting.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function StandingsScreen() {
  const { leagueId, playerId, standings, league, loading } = useLeague();
  const [allGames, setAllGames] = useState<schema.GameDoc[]>([]);
  const [allPicks, setAllPicks] = useState<schema.PickDoc[]>([]);
  const [tiebreakersByWeek, setTiebreakersByWeek] = useState<
    Map<number, schema.WeeklyTiebreakerDoc>
  >(new Map());
  const [loadingGrid, setLoadingGrid] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

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
  if (league?.weeklyPayout) {
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

      const share = league.weeklyPayout! / payoutTo.length;
      payoutTo.forEach((pid) => {
        weeklyWinningsByPlayer.set(pid, (weeklyWinningsByPlayer.get(pid) || 0) + share);
      });
    });
  }

  // Season winnings: based on CURRENT rank, not a final result — this
  // shifts as the season plays out, same as the standings themselves.
  const seasonWinningsByPlayer = new Map<string, number>();
  if (league?.seasonPayouts) {
    standings.forEach((s) => {
      if (s.rank >= 1 && s.rank <= 5) {
        const amount = league.seasonPayouts![s.rank - 1];
        if (amount) seasonWinningsByPlayer.set(s.playerId, amount);
      }
    });
  }

  const totalWinnings = (playerId: string) =>
    (weeklyWinningsByPlayer.get(playerId) || 0) + (seasonWinningsByPlayer.get(playerId) || 0);

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
      {league?.seasonPayouts && (
        <p className="text-xs text-gray-500 mb-4">
          Winnings shown are current, not final — season payout reflects today's rank, which will
          keep shifting.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="border-collapse text-sm">
          <thead>
            <tr className="border-b-2">
              <th className="text-left py-2 pr-3 sticky left-0 bg-white">Rank</th>
              <th className="text-left py-2 pr-4 sticky left-8 bg-white">Player</th>
              <th className="text-center py-2 px-3 font-bold border-l-2 border-r-2">Total</th>
              {weeks.map((w) => (
                <th key={w} className="text-right py-2 px-2 font-semibold text-gray-600 whitespace-nowrap">
                  Wk {w}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {standings.map((s) => {
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
                          className={`text-right pt-2 px-2 font-semibold ${
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
                      <td key={w} className="text-right pb-2 px-2 text-xs text-gray-400">
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
          you can't click yet are still open for picks; they unlock here the
          moment kickoff passes.
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
              "Games also lock automatically in the background every ~10 minutes — this does it immediately."}
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
            finishes. Players never see this value.
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
// player's picks for the week that just locked, a per-player points/correct
// recap, and the commissioner's own picks for the upcoming week as solid
// colored bars. Built to be screenshotted directly, same as the real one —
// no separate export/share pipeline, since a phone screenshot of this
// section is exactly what the snapshot showed being sent.

// ============================================================================
// EVERYONE'S PICKS - The genuinely player-facing "who picked what" view.
// Separate from WeeklySummary (which is the commissioner's screenshot-and-
// send recap tool, with scoring/rank baggage that isn't the point here).
// This is just: for each game this week, who picked which team — visible
// exactly per the same reveal rules as everywhere else (a game's picks
// show once it locks; the commissioner's own may show earlier if they've
// locked their week).
// ============================================================================

export function EveryonesPicksScreen() {
  const { leagueId, playerId, games, players, currentWeek, setCurrentWeek, league, loading } = useLeague();
  const [picks, setPicks] = useState<schema.PickDoc[]>([]);
  const [loadingPicks, setLoadingPicks] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  React.useEffect(() => {
    if (!leagueId || !playerId) return;
    setLoadingPicks(true);
    setLoadError(null);
    (async () => {
      try {
        const data = await firebaseUtils.getVisiblePicksForWeek(leagueId, currentWeek, playerId);
        setPicks(data);
      } catch (err) {
        setLoadError(`Failed to load picks: ${err}`);
      } finally {
        setLoadingPicks(false);
      }
    })();
  }, [leagueId, playerId, currentWeek]);

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

  const sortedGames = [...games].sort((a, b) => a.order - b.order);
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

  return (
    <div className="p-4">
      <WeekSelector currentWeek={currentWeek} officialWeek={league?.currentWeek} onChange={setCurrentWeek} />
      <h2 className="text-2xl font-bold mb-1">Weekly Summary</h2>
      <p className="text-sm text-gray-600 mb-4">
        Who picked what this week. A game's picks show up once it locks at kickoff — until then
        it's still private, same as everywhere else.
      </p>

      {sortedGames.length === 0 || sortedPlayers.length === 0 ? (
        <p className="text-sm text-gray-500">No games or members yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="border-collapse">
            <thead>
              <tr>
                <th className="text-xs font-bold text-gray-600 px-1 pb-2 text-left whitespace-nowrap sticky left-0 bg-white align-bottom">
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
                  <td className="p-0.5 text-xs text-gray-600 whitespace-nowrap sticky left-0 bg-white pr-2">
                    {g.awayTeam} @ {g.homeTeam}
                  </td>
                  {sortedPlayers.map((p) => {
                    const pick = pickByPlayerGame.get(`${p.id}_${g.id}`);
                    if (!pick) {
                      return (
                        <td key={p.id} className="p-0.5">
                          <div className="w-20 h-9 rounded flex items-center justify-center text-xs text-gray-300 border border-dashed">
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
                <td className="p-1 text-xs font-bold text-gray-700 sticky left-0 bg-white">Total</td>
                {sortedPlayers.map((p) => {
                  const total = sortedGames.reduce((sum, g) => {
                    const pick = pickByPlayerGame.get(`${p.id}_${g.id}`);
                    return sum + (pick?.isCorrect ? pick.pointsAwarded || 0 : 0);
                  }, 0);
                  return (
                    <td key={p.id} className="p-1 text-xs font-bold text-gray-700">
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



export function WeeklySummary() {
  const { leagueId, players, standings, currentWeek, userPicks, games } = useLeague();
  const [summaryWeek, setSummaryWeek] = useState(currentWeek);
  const [summaryGames, setSummaryGames] = useState<schema.UIGame[]>([]);
  const [summaryPicks, setSummaryPicks] = useState<schema.PickDoc[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(false);

  React.useEffect(() => {
    if (!leagueId) return;
    setLoadingSummary(true);
    (async () => {
      const [gamesData, picksData] = await Promise.all([
        firebaseUtils.getGamesForWeek(leagueId, summaryWeek),
        firebaseUtils.getAllPicksForWeek(leagueId, summaryWeek),
      ]);
      setSummaryGames(gamesData.map((g) => ({
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
      })));
      setSummaryPicks(picksData);
      setLoadingSummary(false);
    })();
  }, [leagueId, summaryWeek]);

  // playerId -> gameId -> pickedTeam, for the grid
  // playerId -> gameId -> { pickedTeam, isCorrect }, for the grid — carries
  // correctness through so cells can show green/red like the picks screen,
  // not just the flat team color.
  const pickLookup: {
    [playerId: string]: { [gameId: string]: { pickedTeam: string; isCorrect?: boolean } };
  } = {};
  summaryPicks.forEach((p) => {
    if (!pickLookup[p.playerId]) pickLookup[p.playerId] = {};
    pickLookup[p.playerId][p.gameId] = { pickedTeam: p.pickedTeam, isCorrect: p.isCorrect };
  });

  // Per-player recap for this week: points earned, games correct
  const recap = players.map((player) => {
    const theirPicks = summaryPicks.filter((p) => p.playerId === player.id);
    const points = theirPicks.reduce((sum, p) => sum + (p.pointsAwarded || 0), 0);
    const correct = theirPicks.filter((p) => p.isCorrect).length;
    const standing = standings.find((s) => s.playerId === player.id);
    return { player, points, correct, rank: standing?.rank };
  });
  recap.sort((a, b) => b.points - a.points);

  return (
    <div className="p-4 max-w-2xl">
      <h2 className="text-2xl font-bold mb-1">Weekly Recap</h2>
      <p className="text-sm text-gray-600 mb-4">Screenshot this to send out</p>

      <WeekSelector currentWeek={summaryWeek} officialWeek={currentWeek} onChange={setSummaryWeek} />

      {loadingSummary ? (
        <div className="text-sm text-gray-600 mb-6">Loading...</div>
      ) : (
        <>
          {/* Everyone's picks, color-coded, for the week that just locked */}
          <div className="mb-6 overflow-x-auto border rounded">
            <table className="text-xs border-collapse">
              <thead>
                <tr>
                  <th className="p-1 bg-gray-100 sticky left-0 text-left">Game</th>
                  {players.map((p) => (
                    <th key={p.id} className="p-1 bg-gray-100 text-center whitespace-nowrap">
                      {p.name}
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
                    {players.map((p) => {
                      const pick = pickLookup[p.id]?.[g.id];
                      if (!pick) {
                        return (
                          <td key={p.id} className="p-1 text-center text-gray-300">
                            —
                          </td>
                        );
                      }
                      const colors = getTeamColor(pick.pickedTeam);
                      // Only borders once the game's actually final —
                      // isCorrect is undefined until scoreWeek() has run.
                      const borderColor =
                        pick.isCorrect === true
                          ? "#16a34a"
                          : pick.isCorrect === false
                          ? "#dc2626"
                          : "transparent";
                      return (
                        <td key={p.id} className="p-0.5">
                          <div
                            className="font-bold text-center rounded px-1 py-0.5"
                            style={{
                              background: colors.bg,
                              color: colors.fg,
                              border: `2px solid ${borderColor}`,
                            }}
                          >
                            {pick.pickedTeam}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Points / correct picks recap for the week, plus current overall rank */}
          <div className="mb-8 border rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left p-2">Player</th>
                  <th className="text-right p-2">Points</th>
                  <th className="text-right p-2">Correct</th>
                  <th className="text-right p-2">Overall Rank</th>
                </tr>
              </thead>
              <tbody>
                {recap.map((r) => (
                  <tr key={r.player.id} className="border-t">
                    <td className="p-2">{r.player.name}</td>
                    <td className="p-2 text-right font-semibold">{r.points}</td>
                    <td className="p-2 text-right">{r.correct}</td>
                    <td className="p-2 text-right">{r.rank ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Commissioner's own picks for the upcoming (still-open) week — solid
          colored bars, matching the real message format exactly. */}
      <h3 className="text-lg font-bold mb-2">My Week {currentWeek} Picks:</h3>
      <div className="rounded overflow-hidden border">
        {games
          .filter((g) => userPicks[g.id])
          .map((g) => {
            const pick = userPicks[g.id];
            const colors = getTeamColor(pick);
            return (
              <div
                key={g.id}
                className="text-3xl font-extrabold text-center py-4"
                style={{ background: colors.bg, color: colors.fg }}
              >
                {pick}
              </div>
            );
          })}
        {games.filter((g) => userPicks[g.id]).length === 0 && (
          <div className="p-4 text-sm text-gray-500 text-center">
            No picks made yet for Week {currentWeek}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================

type ViewType = "picks" | "mysummary" | "everyonespicks" | "standings" | "payouts" | "commissioner" | "summary" | "members";

// ============================================================================
// MEMBERS SCREEN - Roster with contact info and dues tracking (commissioner only)
// ============================================================================

export function MembersScreen() {
  const { players, setPlayerPaid, removePlayer, restorePlayer, updatePlayerPhone } = useLeague();
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null);
  const [confirmingUnpay, setConfirmingUnpay] = useState<string | null>(null);
  const [editingPhone, setEditingPhone] = useState<string | null>(null);
  const [phoneDraft, setPhoneDraft] = useState("");

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

  return (
    <div className="p-4 max-w-2xl">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-2xl font-bold">Members</h2>
        <span className="text-xs font-bold px-2 py-1 rounded-full bg-gray-100 text-gray-700">
          {paidCount} / {activePlayers.length} paid
        </span>
      </div>
      <p className="text-sm text-gray-600 mb-4">
        Names, emails, and phone numbers for everyone in the league, and who's paid their dues.
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
  const { leagueId, playerId, league, players, loading, error, isCommissioner, updateMyName } = useLeague();
  const { signOut } = useAuth();
  const [view, setView] = useState<ViewType>("picks");

  const myName = players.find((p) => p.id === playerId)?.name || "Signed in";
  const myEmail = players.find((p) => p.id === playerId)?.email || "";
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

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
    </div>
  );
}
