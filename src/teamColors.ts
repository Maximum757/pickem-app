/**
 * Team colors — single source of truth.
 * Ported directly from the approved chat mockups. Used by PicksScreen,
 * CommissionerDashboard's game list, and WeeklySummary so a team never
 * renders differently in two places.
 */

export interface TeamColor {
  bg: string;
  fg: string;
}

// Full display names for the 32 NFL team abbreviations — Week 0's college
// slate already stores full names directly as the team value, so those
// need no lookup; this covers the real-season games, which only ever
// store the short code.
export const TEAM_FULL_NAMES: Record<string, string> = {
  ARI: "Arizona Cardinals",
  ATL: "Atlanta Falcons",
  BAL: "Baltimore Ravens",
  BUF: "Buffalo Bills",
  CAR: "Carolina Panthers",
  CHI: "Chicago Bears",
  CIN: "Cincinnati Bengals",
  CLE: "Cleveland Browns",
  DAL: "Dallas Cowboys",
  DEN: "Denver Broncos",
  DET: "Detroit Lions",
  GB: "Green Bay Packers",
  HOU: "Houston Texans",
  IND: "Indianapolis Colts",
  JAX: "Jacksonville Jaguars",
  KC: "Kansas City Chiefs",
  LV: "Las Vegas Raiders",
  LAC: "Los Angeles Chargers",
  LAR: "Los Angeles Rams",
  MIA: "Miami Dolphins",
  MIN: "Minnesota Vikings",
  NE: "New England Patriots",
  NO: "New Orleans Saints",
  NYG: "New York Giants",
  NYJ: "New York Jets",
  PHI: "Philadelphia Eagles",
  PIT: "Pittsburgh Steelers",
  SF: "San Francisco 49ers",
  SEA: "Seattle Seahawks",
  TB: "Tampa Bay Buccaneers",
  TEN: "Tennessee Titans",
  WAS: "Washington Commanders",
};

// Given a team value from a game doc (either an abbreviation for real
// games, or an already-full college name for Week 0), returns what to
// actually display — full name either way.
export function getTeamDisplayName(team: string): string {
  return TEAM_FULL_NAMES[team] || team;
}

export const TEAM_COLORS: Record<string, TeamColor> = {
  ARI: { bg: "#97233F", fg: "#FFFFFF" },
  ATL: { bg: "#A71930", fg: "#000000" },
  BAL: { bg: "#241773", fg: "#9E7C0C" },
  BUF: { bg: "#00338D", fg: "#C60C30" },
  CAR: { bg: "#0085CA", fg: "#101820" },
  CHI: { bg: "#0B162A", fg: "#C83803" },
  CIN: { bg: "#FB4F14", fg: "#000000" },
  CLE: { bg: "#311D00", fg: "#FF3C00" },
  DAL: { bg: "#041E42", fg: "#FFFFFF" },
  DEN: { bg: "#FB4F14", fg: "#002244" },
  DET: { bg: "#0076B6", fg: "#B0B7BC" },
  GB: { bg: "#203731", fg: "#FFB612" },
  HOU: { bg: "#03202F", fg: "#A71930" },
  IND: { bg: "#002C5F", fg: "#A2AAAD" },
  JAX: { bg: "#006778", fg: "#9F792C" },
  KC: { bg: "#E31837", fg: "#FFB81C" },
  LV: { bg: "#000000", fg: "#A5ACAF" },
  LAC: { bg: "#0080C6", fg: "#FFC20E" },
  LAR: { bg: "#003594", fg: "#FFA300" },
  MIA: { bg: "#008E97", fg: "#FC4C02" },
  MIN: { bg: "#4F2683", fg: "#FFC62F" },
  NE: { bg: "#002244", fg: "#C60C30" },
  NO: { bg: "#D3BC8D", fg: "#101820" },
  NYG: { bg: "#0B2265", fg: "#A71930" },
  NYJ: { bg: "#125740", fg: "#FFFFFF" },
  PHI: { bg: "#004C54", fg: "#A5ACAF" },
  PIT: { bg: "#FFB612", fg: "#101820" },
  SF: { bg: "#AA0000", fg: "#B3995D" },
  SEA: { bg: "#69BE28", fg: "#002244" },
  TB: { bg: "#FF7900", fg: "#D50A0A" },
  TEN: { bg: "#0C2340", fg: "#8A8D8F" },
  WAS: { bg: "#5A1414", fg: "#FFB612" },
};

// Week 0's test slate stores full college team NAMES as the team value
// (not NFL abbreviations), so getTeamColor() needs entries keyed that way
// too — these were computed once already, in seed-week0.ts's TEST_COLORS,
// but never actually wired into the app's real color lookup, so every
// Week 0 tile rendered as flat gray until now. Same NFL-borrowed palette,
// just merged into the one lookup every screen actually uses.
export const COLLEGE_TEAM_COLORS: Record<string, TeamColor> = {
  "North Texas": { bg: "#97233F", fg: "#FFFFFF" },
  Indiana: { bg: "#A71930", fg: "#000000" },
  "East Carolina": { bg: "#241773", fg: "#9E7C0C" },
  Alabama: { bg: "#00338D", fg: "#C60C30" },
  "Ball State": { bg: "#0085CA", fg: "#101820" },
  "Ohio State": { bg: "#0B162A", fg: "#C83803" },
  "Tennessee State": { bg: "#FB4F14", fg: "#000000" },
  Georgia: { bg: "#311D00", fg: "#FF3C00" },
  Baylor: { bg: "#041E42", fg: "#FFFFFF" },
  Auburn: { bg: "#FB4F14", fg: "#002244" },
  "Boise State": { bg: "#0076B6", fg: "#B0B7BC" },
  Oregon: { bg: "#203731", fg: "#FFB612" },
  "Texas State": { bg: "#03202F", fg: "#A71930" },
  Texas: { bg: "#002C5F", fg: "#A2AAAD" },
  Tulane: { bg: "#006778", fg: "#9F792C" },
  Duke: { bg: "#E31837", fg: "#FFB81C" },
  Clemson: { bg: "#000000", fg: "#A5ACAF" },
  LSU: { bg: "#0080C6", fg: "#FFC20E" },
  "Western Michigan": { bg: "#003594", fg: "#FFA300" },
  Michigan: { bg: "#008E97", fg: "#FC4C02" },
  "Florida Atlantic": { bg: "#4F2683", fg: "#FFC62F" },
  Florida: { bg: "#002244", fg: "#C60C30" },
  UCLA: { bg: "#D3BC8D", fg: "#101820" },
  California: { bg: "#0B2265", fg: "#A71930" },
  "Washington State": { bg: "#125740", fg: "#FFFFFF" },
  Washington: { bg: "#004C54", fg: "#A5ACAF" },
  Louisville: { bg: "#FFB612", fg: "#101820" },
  "Ole Miss": { bg: "#AA0000", fg: "#B3995D" },
  Wisconsin: { bg: "#69BE28", fg: "#002244" },
  "Notre Dame": { bg: "#FF7900", fg: "#D50A0A" },
  SMU: { bg: "#0C2340", fg: "#8A8D8F" },
  "Florida State": { bg: "#5A1414", fg: "#FFB612" },
};

// Fallback for any team not in either map — neutral gray rather than a
// crash or an undefined-color render.
export const FALLBACK_COLOR: TeamColor = { bg: "#6b7280", fg: "#FFFFFF" };

export function getTeamColor(abbr: string): TeamColor {
  return TEAM_COLORS[abbr] || COLLEGE_TEAM_COLORS[abbr] || FALLBACK_COLOR;
}

// ESPN's public logo CDN — a well-documented, commonly-referenced pattern
// (https://a.espncdn.com/i/teamlogos/nfl/500/{code}.png). Only covers real
// NFL teams (TEAM_FULL_NAMES keys) — Week 0's college test slate has no
// logo source, so getTeamLogoUrl returns null for anything not a known NFL
// code and callers should fall back to text in that case.
//
// ESPN's own codes mostly match this app's, with one confirmed exception:
// Washington is "wsh" on ESPN, not "was". Only override what's actually
// been checked, rather than guess at the rest.
const ESPN_LOGO_CODE_OVERRIDES: Record<string, string> = {
  WAS: "wsh",
};

// Teams reported as not loading via the plain .../500/{code}.png path —
// multiple real ESPN pages consistently reference these three specifically
// through the "/scoreboard/" variant instead. Scoped narrowly to what was
// actually confirmed broken rather than applied to every team, since the
// base path is independently verified working for others (e.g. "dal").
const ESPN_LOGO_SCOREBOARD_PATH_TEAMS = new Set(["NYG", "NYJ", "LAR"]);

export function getTeamLogoUrl(abbr: string): string | null {
  if (!TEAM_FULL_NAMES[abbr]) return null; // not a known NFL code — e.g. a Week 0 college team
  const code = ESPN_LOGO_CODE_OVERRIDES[abbr] || abbr.toLowerCase();
  const pathSegment = ESPN_LOGO_SCOREBOARD_PATH_TEAMS.has(abbr) ? "scoreboard/" : "";
  return `https://a.espncdn.com/i/teamlogos/nfl/500/${pathSegment}${code}.png`;
}

