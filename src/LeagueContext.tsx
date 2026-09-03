/**
 * React Context and Hooks for league state
 */

import React, { createContext, useContext, useState, useEffect } from "react";
import * as firebaseUtils from "./firebase-utils";
import * as schema from "./firestore-schema";

interface LeagueContextType {
  leagueId: string | null;
  playerId: string | null;
  isCommissioner: boolean;
  league: schema.UILeague | null;
  players: schema.PlayerDoc[];
  games: schema.UIGame[];
  standings: schema.UIStanding[];
  currentWeek: number;
  userPicks: { [gameId: string]: string };
  userPickResults: { [gameId: string]: { isCorrect?: boolean; pointsAwarded?: number } };
  tiebreakerQuestion: string | null;
  myTiebreakerGuess: number | null;
  loading: boolean;
  error: string | null;

  // Actions
  setLeagueId: (id: string) => void;
  setPlayerId: (id: string) => void;
  setCurrentWeek: (week: number) => void;
  advanceToWeek: (week: number) => Promise<void>;
  submitPicks: (picks: Array<{ gameId: string; pickedTeam: string }>) => Promise<void>;
  submitSinglePick: (gameId: string, pickedTeam: string) => Promise<void>;
  submitMyTiebreakerGuess: (guess: number) => Promise<void>;
  enterGameResult: (gameId: string, winner: string, loser: string, winnerScore: number, loserScore: number) => Promise<void>;
  scoreWeek: (week: number) => Promise<void>;
  setTiebreaker: (week: number, question: string, answer: number, rule: "closest" | "closest_without_going_over") => Promise<void>;
  reorderGames: (orderedGameIds: string[]) => Promise<void>;
  updateGameSchedule: (gameId: string, gameTime: Date | null, timeTBD: boolean) => Promise<void>;
  setManualLock: (gameId: string, locked: boolean) => Promise<void>;
}

const LeagueContext = createContext<LeagueContextType | undefined>(undefined);

// Shared GameDoc -> UIGame mapper, used everywhere games are (re)loaded so the
// order/timeTBD/isManuallyLocked fields stay consistent in one place.
function mapGameDocToUIGame(
  g: schema.GameDoc,
  pickCounts?: { [team: string]: number }
): schema.UIGame {
  return {
    id: g.id,
    week: g.week,
    order: g.order,
    homeTeam: g.homeTeam,
    awayTeam: g.awayTeam,
    gameTime: g.gameTime ? g.gameTime.toDate() : null,
    timeTBD: g.timeTBD,
    isLocked: g.isLocked,
    isManuallyLocked: g.isManuallyLocked,
    playoffMultiplier: g.playoffMultiplier,
    awaySpread: g.awaySpread,
    homeSpread: g.homeSpread,
    pickCounts,
    result: g.result
      ? {
          winner: g.result.winner,
          loser: g.result.loser,
          winnerScore: g.result.winnerScore,
          loserScore: g.result.loserScore,
        }
      : undefined,
  };
}

// Fetches a week's games AND their public pick-count splits in one call, so
// every place that loads games (initial load, after reorder, after a result
// is entered, after scoring) shows counts consistently instead of five
// slightly different fetch patterns.
async function loadGamesWithCounts(leagueId: string, week: number): Promise<schema.UIGame[]> {
  const gamesData = await firebaseUtils.getGamesForWeek(leagueId, week);
  const counts = await firebaseUtils.getGamePickCountsForWeek(
    leagueId,
    gamesData.map((g) => g.id)
  );
  return gamesData.map((g) => mapGameDocToUIGame(g, counts[g.id]));
}

function buildPicksMap(picksData: schema.PickDoc[]): { [gameId: string]: string } {
  const map: { [gameId: string]: string } = {};
  picksData.forEach((p) => {
    map[p.gameId] = p.pickedTeam;
  });
  return map;
}

function buildPickResultsMap(
  picksData: schema.PickDoc[]
): { [gameId: string]: { isCorrect?: boolean; pointsAwarded?: number } } {
  const map: { [gameId: string]: { isCorrect?: boolean; pointsAwarded?: number } } = {};
  picksData.forEach((p) => {
    map[p.gameId] = { isCorrect: p.isCorrect, pointsAwarded: p.pointsAwarded };
  });
  return map;
}

export function LeagueProvider({ children }: { children: React.ReactNode }) {
  const [leagueId, setLeagueId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [league, setLeague] = useState<schema.UILeague | null>(null);
  const [players, setPlayers] = useState<schema.PlayerDoc[]>([]);
  const [games, setGames] = useState<schema.UIGame[]>([]);
  const [standings, setStandings] = useState<schema.UIStanding[]>([]);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [userPicks, setUserPicks] = useState<{ [gameId: string]: string }>({});
  const [userPickResults, setUserPickResults] = useState<{
    [gameId: string]: { isCorrect?: boolean; pointsAwarded?: number };
  }>({});
  const [tiebreakerQuestion, setTiebreakerQuestion] = useState<string | null>(null);
  const [myTiebreakerGuess, setMyTiebreakerGuess] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load league and players
  useEffect(() => {
    if (!leagueId) return;

    (async () => {
      setLoading(true);
      try {
        const leagueData = await firebaseUtils.getLeague(leagueId);
        if (leagueData) {
          setLeague({
            id: leagueData.id,
            name: leagueData.name,
            season: leagueData.season,
            playerCount: leagueData.playerCount,
            commissionerId: leagueData.commissionerId,
            currentWeek: leagueData.currentWeek,
          });
          // Default every page open to the league's current week — not a
          // hardcoded Week 1. Only runs once on league load, so it never
          // fights with someone manually browsing to a different week.
          setCurrentWeek(leagueData.currentWeek ?? 0);
        }

        const playersData = await firebaseUtils.getPlayers(leagueId);
        setPlayers(playersData);

        const standingsData = await firebaseUtils.getStandings(leagueId, leagueData?.season || new Date().getFullYear());
        setStandings(standingsData);
      } catch (err) {
        setError(`Failed to load league: ${err}`);
      } finally {
        setLoading(false);
      }
    })();
  }, [leagueId]);

  // Load games for current week
  useEffect(() => {
    if (!leagueId || currentWeek == null) return;

    (async () => {
      setLoading(true);
      try {
        setGames(await loadGamesWithCounts(leagueId, currentWeek));
      } catch (err) {
        setError(`Failed to load games: ${err}`);
      } finally {
        setLoading(false);
      }
    })();
  }, [leagueId, currentWeek]);

  // Load user picks for current week
  useEffect(() => {
    if (!leagueId || !playerId || currentWeek == null) return;

    (async () => {
      try {
        const picksData = await firebaseUtils.getPlayerWeeklyPicks(leagueId, playerId, currentWeek);
        setUserPicks(buildPicksMap(picksData));
        setUserPickResults(buildPickResultsMap(picksData));
      } catch (err) {
        setError(`Failed to load picks: ${err}`);
      }
    })();
  }, [leagueId, playerId, currentWeek]);

  // Load this week's tiebreaker question (never the answer — players should
  // never see what they're being scored against) and the player's own guess.
  useEffect(() => {
    if (!leagueId || !playerId || currentWeek == null) return;

    (async () => {
      try {
        const tb = await firebaseUtils.getWeeklyTiebreaker(leagueId, currentWeek);
        setTiebreakerQuestion(tb?.question ?? null);

        const myGuess = await firebaseUtils.getPlayerTiebreakerGuess(leagueId, playerId, currentWeek);
        setMyTiebreakerGuess(myGuess?.guess ?? null);
      } catch (err) {
        setError(`Failed to load tiebreaker: ${err}`);
      }
    })();
  }, [leagueId, playerId, currentWeek]);

  // Actions
  const handleSubmitPicks = async (picks: Array<{ gameId: string; pickedTeam: string }>) => {
    if (!leagueId || !playerId) return;
    try {
      setLoading(true);
      await firebaseUtils.submitPicks(leagueId, playerId, currentWeek, picks);
      // Reload picks
      const picksData = await firebaseUtils.getPlayerWeeklyPicks(leagueId, playerId, currentWeek);
      setUserPicks(buildPicksMap(picksData));
      setUserPickResults(buildPickResultsMap(picksData));
    } catch (err) {
      setError(`Failed to submit picks: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  // Autosave a single pick — this is what the picks screen actually calls on
  // every tap now; there's no batch submit button anymore. Optimistic update
  // so the border color change is instant, with a rollback fetch if the write
  // fails (e.g. the game locked between render and tap).
  const handleSubmitSinglePick = async (gameId: string, pickedTeam: string) => {
    if (!leagueId || !playerId) return;
    const previous = userPicks[gameId];
    setUserPicks((prev) => ({ ...prev, [gameId]: pickedTeam }));
    try {
      await firebaseUtils.submitPicks(leagueId, playerId, currentWeek, [{ gameId, pickedTeam }]);
    } catch (err) {
      setError(`Failed to save pick: ${err}`);
      setUserPicks((prev) => ({ ...prev, [gameId]: previous }));
    }
  };

  const handleSubmitMyTiebreakerGuess = async (guess: number) => {
    if (!leagueId || !playerId) return;
    try {
      await firebaseUtils.submitTiebreakerGuess(leagueId, playerId, currentWeek, guess);
      setMyTiebreakerGuess(guess);
    } catch (err) {
      setError(`Failed to save tiebreaker guess: ${err}`);
    }
  };

  const handleEnterGameResult = async (
    gameId: string,
    winner: string,
    loser: string,
    winnerScore: number,
    loserScore: number
  ) => {
    if (!leagueId) return;
    try {
      setLoading(true);
      const gameDoc = games.find((g) => g.id === gameId);
      // Multiplier lives on the game itself (1x regular season, up to 2x
      // playoffs) — pulled from already-loaded state rather than a refetch.
      const playoffMultiplier = gameDoc?.playoffMultiplier ?? 1;
      await firebaseUtils.enterGameResult(
        leagueId,
        gameId,
        winner,
        loser,
        winnerScore,
        loserScore,
        playerId || "",
        playoffMultiplier
      );
      // Reload games AND standings — scoring now happens immediately as
      // part of entering the result (see scoreGameImmediately in
      // firebase-utils.ts), not via a separate manual step.
      setGames(await loadGamesWithCounts(leagueId, currentWeek));
      const leagueData = await firebaseUtils.getLeague(leagueId);
      const standingsData = await firebaseUtils.getStandings(
        leagueId,
        leagueData?.season || new Date().getFullYear()
      );
      setStandings(standingsData);
    } catch (err) {
      setError(`Failed to enter result: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleScoreWeek = async (week: number) => {
    if (!leagueId) return;
    try {
      setLoading(true);
      await firebaseUtils.scoreWeek(leagueId, week, playerId || "");
      // Reload standings
      const leagueData = await firebaseUtils.getLeague(leagueId);
      const standingsData = await firebaseUtils.getStandings(leagueId, leagueData?.season || new Date().getFullYear());
      setStandings(standingsData);
    } catch (err) {
      setError(`Failed to score week: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSetTiebreaker = async (
    week: number,
    question: string,
    answer: number,
    rule: "closest" | "closest_without_going_over"
  ) => {
    if (!leagueId) return;
    try {
      setLoading(true);
      await firebaseUtils.setWeeklyTiebreaker(leagueId, week, question, answer, rule, playerId || "");
    } catch (err) {
      setError(`Failed to set tiebreaker: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  // Reorder this week's games (drag/up-down in the commissioner schedule manager).
  // Optimistic: updates local state immediately so the reorder feels instant,
  // then persists — matching the autosave pattern used everywhere else in this app.
  const handleAdvanceToWeek = async (week: number) => {
    if (!leagueId) return;
    try {
      await firebaseUtils.setLeagueCurrentWeek(leagueId, week);
      setLeague((prev) => (prev ? { ...prev, currentWeek: week } : prev));
      setCurrentWeek(week);
    } catch (err) {
      setError(`Failed to advance week: ${err}`);
    }
  };

  const handleReorderGames = async (orderedGameIds: string[]) => {
    if (!leagueId) return;
    const reordered = orderedGameIds
      .map((id) => games.find((g) => g.id === id))
      .filter((g): g is schema.UIGame => !!g);
    setGames(reordered);
    try {
      await firebaseUtils.reorderWeekGames(leagueId, orderedGameIds);
    } catch (err) {
      setError(`Failed to save new game order: ${err}`);
      // Reload from source of truth since the optimistic update may now be wrong
      setGames(await loadGamesWithCounts(leagueId, currentWeek));
    }
  };

  const handleUpdateGameSchedule = async (gameId: string, gameTime: Date | null, timeTBD: boolean) => {
    if (!leagueId) return;
    try {
      await firebaseUtils.updateGameSchedule(leagueId, gameId, { gameTime, timeTBD });
      setGames(await loadGamesWithCounts(leagueId, currentWeek));
    } catch (err) {
      setError(`Failed to update game time: ${err}`);
    }
  };

  const handleSetManualLock = async (gameId: string, locked: boolean) => {
    if (!leagueId) return;
    try {
      await firebaseUtils.setManualLock(leagueId, gameId, locked);
      setGames(await loadGamesWithCounts(leagueId, currentWeek));
    } catch (err) {
      setError(`Failed to update lock: ${err}`);
    }
  };

  return (
    <LeagueContext.Provider
      value={{
        leagueId,
        playerId,
        // Derived, not stored — always in sync with league/playerId rather
        // than a separate piece of state that could drift out of sync with them.
        isCommissioner: !!league && !!playerId && league.commissionerId === playerId,
        league,
        players,
        games,
        standings,
        currentWeek,
        userPicks,
        userPickResults,
        tiebreakerQuestion,
        myTiebreakerGuess,
        loading,
        error,
        setLeagueId,
        setPlayerId,
        setCurrentWeek,
        advanceToWeek: handleAdvanceToWeek,
        submitPicks: handleSubmitPicks,
        submitSinglePick: handleSubmitSinglePick,
        submitMyTiebreakerGuess: handleSubmitMyTiebreakerGuess,
        enterGameResult: handleEnterGameResult,
        scoreWeek: handleScoreWeek,
        setTiebreaker: handleSetTiebreaker,
        reorderGames: handleReorderGames,
        updateGameSchedule: handleUpdateGameSchedule,
        setManualLock: handleSetManualLock,
      }}
    >
      {children}
    </LeagueContext.Provider>
  );
}

export function useLeague() {
  const context = useContext(LeagueContext);
  if (!context) {
    throw new Error("useLeague must be used within LeagueProvider");
  }
  return context;
}
