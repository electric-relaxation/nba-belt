// One-off setup: writes public/nba-belt/teams.json and downloads every team's logo
// (light and dark-background variants, two sizes) from ESPN's image CDN.
//
//   npm run fetch-teams
//
// Re-run only if a team rebrands; the output is committed to the repo.

import { mkdir, writeFile } from 'node:fs/promises';

const TEAMS_URL = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams';
const OUT_DIR = new URL('../public/nba-belt/', import.meta.url);

// ESPN uses a few non-standard abbreviations; the site uses the NBA's own codes.
const NBA_CODE: Record<string, string> = { GS: 'GSW', NO: 'NOP', NY: 'NYK', SA: 'SAS', UTAH: 'UTA', WSH: 'WAS' };

// 96px covers logos shown up to 48px on high-density screens; 256px is for the big holder logo.
const SIZES = [96, 256];

interface EspnLogo { href: string; rel: string[] }
interface EspnTeam {
  id: string;
  abbreviation: string;
  displayName: string;
  shortDisplayName: string;
  color?: string;
  alternateColor?: string;
  logos: EspnLogo[];
}

async function download(url: string, file: URL): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
}

function logoPath(team: EspnTeam, variant: 'default' | 'dark'): string {
  const logo = team.logos.find((l) => l.rel.includes(variant) && !l.rel.includes('scoreboard'));
  if (!logo) throw new Error(`No ${variant} logo for ${team.abbreviation}`);
  return new URL(logo.href).pathname; // e.g. /i/teamlogos/nba/500/bkn.png
}

const res = await fetch(TEAMS_URL);
if (!res.ok) throw new Error(`Teams: HTTP ${res.status}`);
const json = (await res.json()) as { sports: { leagues: { teams: { team: EspnTeam }[] }[] }[] };
const espnTeams = json.sports[0].leagues[0].teams.map((t) => t.team);
if (espnTeams.length !== 30) throw new Error(`Expected 30 teams, got ${espnTeams.length}`);

for (const size of SIZES) {
  await mkdir(new URL(`logos/${size}/`, OUT_DIR), { recursive: true });
  await mkdir(new URL(`logos/${size}-dark/`, OUT_DIR), { recursive: true });
}

const teams: Record<string, object> = {};
for (const t of espnTeams.sort((a, b) => a.abbreviation.localeCompare(b.abbreviation))) {
  const code = NBA_CODE[t.abbreviation] ?? t.abbreviation;
  teams[code] = {
    espnId: t.id,
    name: t.displayName,
    shortName: t.shortDisplayName,
    color: `#${t.color ?? '777777'}`,
    altColor: `#${t.alternateColor ?? 'cccccc'}`,
  };
  for (const size of SIZES) {
    for (const variant of ['default', 'dark'] as const) {
      const src = `https://a.espncdn.com/combiner/i?img=${logoPath(t, variant)}&w=${size}&h=${size}`;
      const dir = variant === 'dark' ? `${size}-dark` : `${size}`;
      await download(src, new URL(`logos/${dir}/${code}.png`, OUT_DIR));
    }
  }
  console.log(`${code.padEnd(4)} ${t.displayName}`);
}

const sorted = Object.fromEntries(Object.entries(teams).sort(([a], [b]) => a.localeCompare(b)));
await writeFile(new URL('teams.json', OUT_DIR), JSON.stringify(sorted, null, 2) + '\n');
console.log(`Wrote teams.json and ${Object.keys(sorted).length * SIZES.length * 2} logos.`);
