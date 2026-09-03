/**
 * React Components for Pick 'Em App
 */

import React, { useState } from "react";
import { useLeague } from "./LeagueContext";
import { useAuth } from "./AuthContext";
import { getTeamColor } from "./teamColors";
import * as firebaseUtils from "./firebase-utils";
import * as schema from "./firestore-schema";

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
  onClick,
}: {
  abbr: string;
  isPicked: boolean;
  showColor: boolean;
  isClickable: boolean;
  borderClass: string;
  subtext: string;
  onClick: () => void;
}) {
  const colors = getTeamColor(abbr);
  // Only the team you actually picked shows its real color+border. The one
  // you didn't pick greys out — same plain look every tile had before
  // colors existed, so the picked one stays the only thing drawing the eye.
  const bg = showColor ? colors.bg : "#e5e7eb";
  const fg = showColor ? colors.fg : "#6b7280";
  return (
    <div
      onClick={isClickable ? onClick : undefined}
      className={`flex-1 rounded-md px-2 py-2.5 text-center font-bold select-none ${borderClass} ${
        isClickable ? "cursor-pointer" : "cursor-not-allowed"
      }`}
      style={{ background: bg, color: fg, border: "5px solid transparent" }}
    >
      <div className="font-bold">{abbr}</div>
      <div className="text-xs font-medium opacity-90 mt-0.5">{subtext}</div>
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
  const isFinal = !!game.result;
  const isLocked = game.isLocked && !isFinal;

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
        <option value={0}>Week 0 (test)</option>
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
    tiebreakerLocked,
    myTiebreakerGuess,
    submitMyTiebreakerGuess,
    weeklyLeader,
    leagueMaxWeeklyPoints,
    playerId,
  } = useLeague();
  const [tbDraft, setTbDraft] = useState<string>(myTiebreakerGuess?.toString() ?? "");
  const [tbSaved, setTbSaved] = useState(false);

  const handlePick = (gameId: string, team: string) => {
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
          <div className="text-xs text-gray-500 mb-3">
            {tiebreakerRule === "closest_without_going_over"
              ? "Price Is Right rules: closest without going over wins"
              : "Closest guess wins (going over is fine)"}
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
          const isPastKickoff = !game.timeTBD && !!game.gameTime && new Date(game.gameTime) <= new Date();
          const isLocked = (game.isLocked || isPastKickoff) && !isFinal;
          const isClickable = !isLocked && !isFinal;

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
            if (game.isLocked && game.pickCounts) {
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
                    : new Date(game.gameTime).toLocaleString()}
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
  const { games, userPicks, userPickResults, currentWeek, setCurrentWeek, league, loading } = useLeague();

  if (loading) return <div className="p-4">Loading...</div>;

  const pickedGames = games.filter((g) => !!userPicks[g.id]);

  return (
    <div className="p-4 max-w-2xl">
      <WeekSelector currentWeek={currentWeek} officialWeek={league?.currentWeek} onChange={setCurrentWeek} />
      <h2 className="text-2xl font-bold mb-1">My Summary — Week {currentWeek}</h2>
      <p className="text-sm text-gray-600 mb-4">
        Your picks this week. Winning picks show your points; losing picks grey out.
      </p>

      <div className="space-y-2">
        {pickedGames.map((g) => {
          const pick = userPicks[g.id];
          const result = userPickResults[g.id];
          const isFinal = !!g.result;
          const isCorrect = result?.isCorrect === true;
          const colors = getTeamColor(pick);
          // Pending (not yet final): show the pick in its real color, no
          // points yet, since we don't know the outcome. Final + correct:
          // real color + points earned. Final + incorrect: greyed out,
          // nothing shown — matches the plain look every tile had pre-color.
          const showColor = !isFinal || isCorrect;
          return (
            <div
              key={g.id}
              className="flex items-center justify-between border rounded px-3 py-2"
              style={{
                background: showColor ? colors.bg : "#e5e7eb",
                color: showColor ? colors.fg : "#6b7280",
              }}
            >
              <span className="text-sm font-bold">
                {g.awayTeam} @ {g.homeTeam}
              </span>
              <span className="text-sm font-bold">
                {pick}
                {isFinal && isCorrect && result?.pointsAwarded !== undefined && (
                  <span> ({result.pointsAwarded})</span>
                )}
              </span>
            </div>
          );
        })}
        {pickedGames.length === 0 && (
          <p className="text-sm text-gray-500">No picks made yet for Week {currentWeek}.</p>
        )}
      </div>
    </div>
  );
}

export function StandingsScreen() {
  const { standings, loading } = useLeague();

  if (loading) return <div className="p-4">Loading...</div>;

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Standings</h2>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 border-b">
            <tr>
              <th className="text-left py-2 px-2">Rank</th>
              <th className="text-left py-2 px-2">Player</th>
              <th className="text-right py-2 px-2">Points</th>
              <th className="text-right py-2 px-2">Correct</th>
              <th className="text-right py-2 px-2">High</th>
              <th className="text-right py-2 px-2">2nd High</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s) => (
              <tr key={s.playerId} className="border-b hover:bg-gray-50">
                <td className="py-2 px-2 font-bold">{s.rank}</td>
                <td className="py-2 px-2">{s.playerName}</td>
                <td className="py-2 px-2 text-right font-semibold">{s.totalPoints}</td>
                <td className="py-2 px-2 text-right">{s.totalCorrect}</td>
                <td className="py-2 px-2 text-right">{s.highestWeek || "—"}</td>
                <td className="py-2 px-2 text-right">{s.secondHighestWeek || "—"}</td>
              </tr>
            ))}
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
                      ? new Date(game.gameTime).toLocaleString()
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
  } = useLeague();
  const [tiebreakerQ, setTiebreakerQ] = useState("");
  const [tiebreakerAnswerDraft, setTiebreakerAnswerDraft] = useState("");
  const [tiebreakerRule, setTiebreakerRule] = useState<"closest" | "closest_without_going_over">(
    "closest"
  );

  // Who has/hasn't picked each game, and who has/hasn't entered the
  // tiebreaker — commissioner-only data (players list has emails for the
  // per-game "copy contacts" reminder action).
  const [pickedByGame, setPickedByGame] = useState<{ [gameId: string]: Set<string> }>({});
  const [tiebreakerEnteredBy, setTiebreakerEnteredBy] = useState<Set<string>>(new Set());
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [fillingGameId, setFillingGameId] = useState<string | null>(null);

  React.useEffect(() => {
    if (!leagueId) return;
    (async () => {
      const [allPicks, allGuesses] = await Promise.all([
        firebaseUtils.getAllPicksForWeek(leagueId, currentWeek),
        firebaseUtils.getAllTiebreakerGuessesForWeek(leagueId, currentWeek),
      ]);
      const byGame: { [gameId: string]: Set<string> } = {};
      allPicks.forEach((p) => {
        if (!byGame[p.gameId]) byGame[p.gameId] = new Set();
        byGame[p.gameId].add(p.playerId);
      });
      setPickedByGame(byGame);
      setTiebreakerEnteredBy(new Set(allGuesses.map((g) => g.playerId)));
    })();
  }, [leagueId, currentWeek]);

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

  const allPlayerIds = players.map((p) => p.id);
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

      <ScheduleManager />

      {/* Enter Results Section */}
      <div className="mb-8 border p-4 rounded bg-blue-50">
        <h3 className="text-lg font-bold mb-1">Enter Game Results</h3>
        <p className="text-sm text-gray-600 mb-4">
          Tap the winning team — that's it, saves and scores immediately. Games
          you can't click yet are still open for picks; they unlock here the
          moment kickoff passes.
        </p>

        <div className="space-y-3">
          {games
            .filter((g) => !g.result)
            .map((g) => {
              const canDeclare = g.isLocked;
              return (
                <div key={g.id} className="border rounded bg-white p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-500">
                      {g.timeTBD || !g.gameTime
                        ? "Time TBD"
                        : new Date(g.gameTime).toLocaleString()}
                    </span>
                    {!canDeclare && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">
                        Still open — locks at kickoff
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => canDeclare && handleDeclareWinner(g.id, g.awayTeam, g.homeTeam)}
                      disabled={!canDeclare}
                      className={`flex-1 py-2 px-3 rounded text-sm font-semibold ${
                        canDeclare
                          ? "bg-gray-100 hover:bg-green-100 hover:border-green-600 border-2 border-transparent cursor-pointer"
                          : "bg-gray-50 text-gray-400 cursor-not-allowed"
                      }`}
                    >
                      {g.awayTeam}
                    </button>
                    <button
                      onClick={() => canDeclare && handleDeclareWinner(g.id, g.homeTeam, g.awayTeam)}
                      disabled={!canDeclare}
                      className={`flex-1 py-2 px-3 rounded text-sm font-semibold ${
                        canDeclare
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
          {games.filter((g) => !g.result).length === 0 && (
            <p className="text-sm text-gray-500">All games this week have results entered.</p>
          )}
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
            // it themselves.
            const canFillIn = game.isLocked && missing.length > 0;
            return (
              <div key={game.id} className="border rounded bg-white px-3 py-2 mb-1">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-gray-500">
                      {game.timeTBD || !game.gameTime
                        ? "Time TBD"
                        : new Date(game.gameTime).toLocaleString()}
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
                      Assign a pick on their behalf — marked as a wildcard/assigned pick.
                    </p>
                    {missing.map((mPlayerId) => {
                      const player = players.find((p) => p.id === mPlayerId);
                      const awayColors = getTeamColor(game.awayTeam);
                      const homeColors = getTeamColor(game.homeTeam);
                      return (
                        <div key={mPlayerId} className="flex items-center gap-2">
                          <span className="text-xs flex-1 truncate">{player?.name || mPlayerId}</span>
                          <button
                            onClick={() => assignMissedPick(game.id, mPlayerId, game.awayTeam)}
                            style={{ background: awayColors.bg, color: awayColors.fg }}
                            className="text-xs font-bold px-2 py-1 rounded"
                          >
                            {game.awayTeam}
                          </button>
                          <button
                            onClick={() => assignMissedPick(game.id, mPlayerId, game.homeTeam)}
                            style={{ background: homeColors.bg, color: homeColors.fg }}
                            className="text-xs font-bold px-2 py-1 rounded"
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
      <h2 className="text-2xl font-bold mb-1">Weekly Summary</h2>
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

type ViewType = "picks" | "mysummary" | "standings" | "commissioner" | "summary" | "members";

// ============================================================================
// MEMBERS SCREEN - Roster with contact info and dues tracking (commissioner only)
// ============================================================================

export function MembersScreen() {
  const { players, setPlayerPaid } = useLeague();

  const paidCount = players.filter((p) => p.hasPaid).length;

  return (
    <div className="p-4 max-w-2xl">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-2xl font-bold">Members</h2>
        <span className="text-xs font-bold px-2 py-1 rounded-full bg-gray-100 text-gray-700">
          {paidCount} / {players.length} paid
        </span>
      </div>
      <p className="text-sm text-gray-600 mb-4">
        Names and emails for everyone in the league, and who's paid their dues.
      </p>

      <div className="space-y-2">
        {players.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between border rounded bg-white px-3 py-2"
          >
            <div>
              <div className="text-sm font-semibold">{p.name}</div>
              <div className="text-xs text-gray-500">{p.email}</div>
            </div>
            <button
              onClick={() => setPlayerPaid(p.id, !p.hasPaid)}
              className={`text-xs font-bold px-3 py-1.5 rounded-full ${
                p.hasPaid
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {p.hasPaid ? "✓ Paid" : "Not paid"}
            </button>
          </div>
        ))}
        {players.length === 0 && (
          <p className="text-sm text-gray-500">No members yet.</p>
        )}
      </div>
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
              onClick={() => setView("standings")}
              className={`py-2 px-4 rounded font-medium transition ${
                view === "standings"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-200 hover:bg-gray-300"
              }`}
            >
              Standings
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
            <button
              onClick={() => setView("summary")}
              className={`py-2 px-4 rounded font-medium transition ${
                view === "summary"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-200 hover:bg-gray-300"
              }`}
            >
              Weekly Summary
            </button>
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
        {!loading && view === "standings" && <StandingsScreen />}
        {!loading && view === "commissioner" && isCommissioner && <CommissionerDashboard />}
        {!loading && view === "summary" && <WeeklySummary />}
        {!loading && view === "members" && isCommissioner && <MembersScreen />}
      </div>
    </div>
  );
}
