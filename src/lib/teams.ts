export type TeamDisplay = {
  abbr: string;
  name: string;
  logoUrl: string;
};

const TEAM_NAMES: Record<string, string> = {
  ATL: "Atlanta Hawks",
  BOS: "Boston Celtics",
  BKN: "Brooklyn Nets",
  CHA: "Charlotte Hornets",
  CHI: "Chicago Bulls",
  CLE: "Cleveland Cavaliers",
  DAL: "Dallas Mavericks",
  DEN: "Denver Nuggets",
  DET: "Detroit Pistons",
  GSW: "Golden State Warriors",
  HOU: "Houston Rockets",
  IND: "Indiana Pacers",
  LAC: "LA Clippers",
  LAL: "Los Angeles Lakers",
  MEM: "Memphis Grizzlies",
  MIA: "Miami Heat",
  MIL: "Milwaukee Bucks",
  MIN: "Minnesota Timberwolves",
  NOP: "New Orleans Pelicans",
  NYK: "New York Knicks",
  OKC: "Oklahoma City Thunder",
  ORL: "Orlando Magic",
  PHI: "Philadelphia 76ers",
  PHX: "Phoenix Suns",
  POR: "Portland Trail Blazers",
  SAC: "Sacramento Kings",
  SAS: "San Antonio Spurs",
  TOR: "Toronto Raptors",
  UTA: "Utah Jazz",
  WAS: "Washington Wizards",
};

const normalizeAbbr = (abbr: string): string => abbr.trim().toUpperCase();

const LOGO_VARIANTS: Record<string, string> = {
  UTA: "D",
};

export const logoUrlFromAbbr = (abbr: string): string => {
  const normalized = normalizeAbbr(abbr);
  const variant = LOGO_VARIANTS[normalized] ?? "L";
  return `https://cdn.nba.com/logos/nba/${normalized}/global/${variant}/logo.svg`;
};

export const getTeamDisplay = (abbr: string): TeamDisplay => {
  const normalized = normalizeAbbr(abbr);
  return {
    abbr: normalized,
    name: TEAM_NAMES[normalized] ?? normalized,
    logoUrl: logoUrlFromAbbr(normalized),
  };
};
