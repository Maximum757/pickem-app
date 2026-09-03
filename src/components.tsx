/**
 * React Components for Pick 'Em App
 */

import React, { useState } from "react";
import { useLeague } from "./LeagueContext";
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
  isClickable,
  borderClass,
  subtext,
  onClick,
}: {
  abbr: string;
  isPicked: boolean;
  isClickable: boolean;
  borderClass: string;
  subtext: string;
  onClick: () => void;
}) {
  const colors = getTeamColor(abbr);
  return (
    <div
      onClick={isClickable ? onClick : undefined}
      className={`flex-1 rounded-md px-2 py-2.5 text-center font-bold select-none ${borderClass} ${
        isClickable ? "cursor-pointer" : "cursor-not-allowed"
      }`}
      style={{ background: colors.bg, color: colors.fg, border: "5px solid transparent" }}
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

export function PicksScreen() {
  const {
    games,
    userPicks,
    currentWeek,
    loading,
    submitSinglePick,
    tiebreakerQuestion,
    myTiebreakerGuess,
    submitMyTiebreakerGuess,
  } = useLeague();
  const [tbDraft, setTbDraft] = useState<string>(myTiebreakerGuess?.toString() ?? "");
  const [tbSaved, setTbSaved] = useState(false);

  const handlePick = (gameId: string, team: string) => {
    submitSinglePick(gameId, team);
  };

  const handleTiebreakerBlur = () => {
    const val = parseFloat(tbDraft);
    if (!isNaN(val) && val !== myTiebreakerGuess) {
      submitMyTiebreakerGuess(val);
      setTbSaved(true);
      setTimeout(() => setTbSaved(false), 1500);
    }
  };

  if (loading) return <div className="p-4">Loading...</div>;

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-1">Week {currentWeek} Picks</h2>
      <p className="text-sm text-gray-600 mb-4">Tap a team to pick — it saves instantly</p>

      {/* Always shown — a player wanting to get their picks in early shouldn't
          be blocked just because the commissioner hasn't decided on this
          week's tiebreaker question yet. The guess itself doesn't depend on
          the question existing; only the display text does. */}
      <div className="border rounded-lg p-4 mb-4 bg-gray-50">
        <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-1">
          This week's tiebreaker
        </div>
        <div className="text-sm font-semibold mb-3">
          {tiebreakerQuestion || (
            <span className="text-gray-500 font-normal italic">
              Not set yet — you can still enter your guess now
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Enter Tiebreaker ➞➞</span>
          <input
            type="number"
            value={tbDraft}
            onChange={(e) => setTbDraft(e.target.value)}
            onBlur={handleTiebreakerBlur}
            className="w-24 border rounded px-2 py-1"
          />
          {tbSaved && <span className="text-xs text-green-600">✓ Saved</span>}
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
                  isClickable={isClickable}
                  borderClass={borderClassFor(game.awayTeam)}
                  subtext={subtextFor(game.awayTeam)}
                  onClick={() => handlePick(game.id, game.awayTeam)}
                />
                <StatusCircle game={game} picked={picked} />
                <PickTile
                  abbr={game.homeTeam}
                  isPicked={picked === game.homeTeam}
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
    setTiebreaker,
  } = useLeague();
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [result, setResult] = useState<{
    winner: string;
    loser: string;
    winnerScore: number;
    loserScore: number;
  } | null>(null);
  const [tiebreakerQ, setTiebreakerQ] = useState("");
  const [tiebreakerA, setTiebreakerA] = useState("");
  const [tiebreakerRule, setTiebreakerRule] = useState<"closest" | "closest_without_going_over">(
    "closest"
  );

  // Who has/hasn't picked each game, and who has/hasn't entered the
  // tiebreaker — commissioner-only data (players list has emails for the
  // per-game "copy contacts" reminder action).
  const [pickedByGame, setPickedByGame] = useState<{ [gameId: string]: Set<string> }>({});
  const [tiebreakerEnteredBy, setTiebreakerEnteredBy] = useState<Set<string>>(new Set());
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

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

  const handleEnterResult = async () => {
    if (!selectedGame || !result) return;
    await enterGameResult(
      selectedGame,
      result.winner,
      result.loser,
      result.winnerScore,
      result.loserScore
    );
    setSelectedGame(null);
    setResult(null);
  };

  const handleSetTiebreaker = async () => {
    if (!tiebreakerQ || !tiebreakerA) return;
    await setTiebreaker(currentWeek, tiebreakerQ, parseInt(tiebreakerA), tiebreakerRule);
    setTiebreakerQ("");
    setTiebreakerA("");
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
          Tap the winning team, enter the score, and save — one card per game, no
          dropdown. Scoring updates standings immediately once saved.
        </p>

        <div className="space-y-3">
          {games
            .filter((g) => !g.result)
            .map((g) => {
              const isSelected = selectedGame === g.id;
              return (
                <div key={g.id} className="border rounded bg-white p-3">
                  <div className="text-xs text-gray-500 mb-2">
                    {g.timeTBD || !g.gameTime
                      ? "Time TBD"
                      : new Date(g.gameTime).toLocaleString()}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setSelectedGame(g.id);
                        setResult({ winner: g.awayTeam, loser: g.homeTeam, winnerScore: 0, loserScore: 0 });
                      }}
                      className={`flex-1 py-2 px-3 rounded text-sm font-semibold border-2 ${
                        isSelected && result?.winner === g.awayTeam
                          ? "border-green-600 bg-green-50"
                          : "border-transparent bg-gray-100 hover:bg-gray-200"
                      }`}
                    >
                      {g.awayTeam}
                    </button>
                    <button
                      onClick={() => {
                        setSelectedGame(g.id);
                        setResult({ winner: g.homeTeam, loser: g.awayTeam, winnerScore: 0, loserScore: 0 });
                      }}
                      className={`flex-1 py-2 px-3 rounded text-sm font-semibold border-2 ${
                        isSelected && result?.winner === g.homeTeam
                          ? "border-green-600 bg-green-50"
                          : "border-transparent bg-gray-100 hover:bg-gray-200"
                      }`}
                    >
                      {g.homeTeam}
                    </button>
                  </div>

                  {isSelected && result && (
                    <div className="mt-3 pt-3 border-t space-y-2">
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <label className="text-xs text-gray-600">{result.winner} score</label>
                          <input
                            type="number"
                            value={result.winnerScore}
                            onChange={(e) => setResult({ ...result, winnerScore: parseInt(e.target.value) || 0 })}
                            className="w-full border p-2 rounded text-sm"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="text-xs text-gray-600">{result.loser} score</label>
                          <input
                            type="number"
                            value={result.loserScore}
                            onChange={(e) => setResult({ ...result, loserScore: parseInt(e.target.value) || 0 })}
                            className="w-full border p-2 rounded text-sm"
                          />
                        </div>
                      </div>
                      <button
                        onClick={handleEnterResult}
                        className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded text-sm"
                      >
                        Save Result
                      </button>
                    </div>
                  )}
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
        <h3 className="text-lg font-bold mb-4">Set Weekly Tiebreaker</h3>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-2">Tiebreaker Question</label>
            <input
              type="text"
              placeholder="e.g., Mahomes passing yards"
              value={tiebreakerQ}
              onChange={(e) => setTiebreakerQ(e.target.value)}
              className="w-full border p-2 rounded"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Correct Answer</label>
            <input
              type="number"
              value={tiebreakerA}
              onChange={(e) => setTiebreakerA(e.target.value)}
              className="w-full border p-2 rounded"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Rule</label>
            <select
              value={tiebreakerRule}
              onChange={(e) =>
                setTiebreakerRule(e.target.value as "closest" | "closest_without_going_over")
              }
              className="w-full border p-2 rounded"
            >
              <option value="closest">Closest</option>
              <option value="closest_without_going_over">Closest Without Going Over</option>
            </select>
          </div>

          <button
            onClick={handleSetTiebreaker}
            className="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded"
          >
            Set Tiebreaker
          </button>
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
            return (
              <div
                key={game.id}
                className="flex items-center justify-between border rounded bg-white px-3 py-2"
              >
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
                </div>
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
  const [summaryWeek, setSummaryWeek] = useState(Math.max(currentWeek - 1, 0));
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

      <div className="mb-4">
        <label className="block text-xs font-medium text-gray-600 mb-1">Week to recap</label>
        <select
          value={summaryWeek}
          onChange={(e) => setSummaryWeek(parseInt(e.target.value))}
          className="border p-2 rounded text-sm"
        >
          {Array.from({ length: currentWeek }, (_, i) => i).map((w) => (
            <option key={w} value={w}>
              Week {w}
            </option>
          ))}
        </select>
      </div>

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

type ViewType = "picks" | "standings" | "commissioner" | "summary";

export function App() {
  const { leagueId, playerId, league, loading, error, isCommissioner } = useLeague();
  const [view, setView] = useState<ViewType>("picks");

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
          <h1 className="text-3xl font-bold mb-2">
            {league?.name || "Pick 'Em"} ({league?.season})
          </h1>
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
            {isCommissioner && (
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
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto">
        {loading && <div className="p-4 text-gray-600">Loading...</div>}
        {!loading && view === "picks" && <PicksScreen />}
        {!loading && view === "standings" && <StandingsScreen />}
        {!loading && view === "commissioner" && isCommissioner && <CommissionerDashboard />}
        {!loading && view === "summary" && isCommissioner && <WeeklySummary />}
      </div>
    </div>
  );
}
