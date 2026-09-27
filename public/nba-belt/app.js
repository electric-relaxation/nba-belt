// NBA Championship Belt page. Plain JavaScript, no build step.
// Data comes from the Worker's API; the record format is SeasonRecord in src/types.ts.

const BASE = '/nba-belt';
const POLL_MS = 60_000;

const els = {
  main: document.getElementById('main'),
  holder: document.getElementById('holder'),
  next: document.getElementById('next'),
  history: document.getElementById('history'),
  season: document.getElementById('season'),
  theme: document.getElementById('theme'),
  updated: document.getElementById('updated'),
};

const state = {
  teams: {},
  /** Latest /api/current response: { seasons, record } for the season the site is following. */
  current: null,
  /** Season records by start year. */
  records: new Map(),
  /** The season on screen. */
  season: null,
};

// ----- Data -----

async function getJSON(path) {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

async function loadCurrent() {
  state.current = await getJSON('/api/current');
  state.records.set(state.current.record.season, state.current.record);
}

async function loadSeason(season) {
  if (!state.records.has(season)) state.records.set(season, await getJSON(`/api/season/${season}`));
  return state.records.get(season);
}

// ----- Formatting (always in the visitor's timezone and locale) -----

const dateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
const fullFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

const escapes = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (value) => String(value).replace(/[&<>"']/g, (c) => escapes[c]);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const formatDate = (iso) => dateFormat.format(new Date(iso));

/** "Today · 7:30 PM PDT", "Tomorrow · …" or "Fri, Oct 24 · …". */
function formatWhen(iso) {
  const date = new Date(iso);
  const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((midnight(date) - midnight(new Date())) / 86_400_000);
  const day = days === 0 || days === 1 ? relative.format(days, 'day') : dayFormat.format(date);
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} · ${timeFormat.format(date)}`;
}

function timeAgo(iso) {
  const seconds = (Date.parse(iso) - Date.now()) / 1000;
  if (seconds > -45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes > -60) return relative.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (hours > -24) return relative.format(hours, 'hour');
  return relative.format(Math.round(hours / 24), 'day');
}

// ----- Theme -----

const darkQuery = matchMedia('(prefers-color-scheme: dark)');
const systemTheme = () => (darkQuery.matches ? 'dark' : 'light');
const theme = () => document.documentElement.dataset.theme ?? systemTheme();

function setTheme(next) {
  // Choosing the system's own theme means "follow the system" again.
  const root = document.documentElement;
  if (next === systemTheme()) delete root.dataset.theme;
  else root.dataset.theme = next;
  try {
    if (root.dataset.theme) localStorage.setItem('theme', next);
    else localStorage.removeItem('theme');
  } catch {
    // Storage can be unavailable (private browsing); the choice just won't persist.
  }
  render();
}

const SUN_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

// ----- Teams -----

function logo(code, px, className, loading = 'lazy') {
  const dir = theme() === 'dark' ? `${px}-dark` : `${px}`;
  return `<img class="${className}" src="${BASE}/logos/${dir}/${esc(code)}.png" alt="" width="40" height="40" loading="${loading}" decoding="async">`;
}

function name(code) {
  const team = state.teams[code] ?? { name: code, shortName: code };
  return `<span class="name"><span class="full">${esc(team.name)}</span><span class="short">${esc(team.shortName)}</span></span>`;
}

/** A team mention: always logo + name. */
function team(code, { inline = false, after = '' } = {}) {
  return `<span class="team${inline ? ' inline' : ''}">${logo(code, 96, 'logo')}${name(code)}${after}</span>`;
}

const belt = (label) =>
  `<svg class="belt" viewBox="0 0 26 13" role="img" aria-label="${label}"><title>${label}</title><rect x="0.5" y="3.5" width="25" height="6" rx="2" fill="#6b4f12"/><ellipse cx="13" cy="6.5" rx="6.5" ry="6" fill="#f0c24b" stroke="#6b4f12"/><ellipse cx="13" cy="6.5" rx="3" ry="2.6" fill="#cf9a26"/></svg>`;

/** The team color that stands out best against the card background. */
function teamColor(code) {
  const team = state.teams[code];
  if (!team) return '';
  const luminance = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const background = theme() === 'dark' ? luminance('#17181b') : 1;
  const contrast = (hex) => {
    const [hi, lo] = [luminance(hex), background].sort((a, b) => b - a);
    return (hi + 0.05) / (lo + 0.05);
  };
  if (contrast(team.color) >= 2) return team.color;
  return contrast(team.altColor) > contrast(team.color) ? team.altColor : team.color;
}

// ----- Rendering -----

function render() {
  const dark = theme() === 'dark';
  els.theme.innerHTML = dark ? SUN_ICON : MOON_ICON;
  els.theme.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');

  const record = state.records.get(state.season);
  if (!state.current || !record) return;
  renderSeasonPicker();
  renderHolder(record);
  renderNext(record);
  renderHistory(record);
  renderUpdated();
  els.main.setAttribute('aria-busy', 'false');
}

function renderSeasonPicker() {
  const { seasons } = state.current;
  if (els.season.options.length !== seasons.length) {
    els.season.innerHTML = seasons.map((s) => `<option value="${s}">${s}</option>`).join('');
  }
  els.season.value = String(state.season);
  els.season.disabled = false;
}

function renderHolder(record) {
  const final = record.status === 'final';
  const color = teamColor(record.holder);
  if (color) els.holder.style.setProperty('--team', color);
  const last = record.transfers.at(-1);
  const how = last
    ? `Won it from ${team(last.from, { inline: true })} on ${esc(formatDate(last.date))}`
    : `Defending champions · ${final ? 'held it all season' : 'holding it since opening night'}`;
  const defenses = record.defenses
    ? `<p class="holder-meta">${plural(record.defenses, 'successful defense')}</p>`
    : '';
  els.holder.innerHTML = `
    <p class="label">${final ? `Final belt holder · ${record.season} season` : 'Current belt holder'}</p>
    <div class="holder-body">
      ${logo(record.holder, 256, 'logo-xl', 'eager')}
      <div>
        <h2 class="holder-name">${esc(state.teams[record.holder]?.name ?? record.holder)}</h2>
        <p class="holder-meta">${how}</p>
        ${defenses}
      </div>
    </div>`;
}

function renderNext(record) {
  if (record.status === 'final') {
    const holders = new Set([record.startingHolder, ...record.transfers.map((t) => t.to)]);
    els.next.innerHTML = `
      <p class="label">Season complete</p>
      <p class="summary">The belt changed hands <strong>${plural(record.transfers.length, 'time')}</strong>
        and <strong>${holders.size} teams</strong> held it. The regular season is over, so the result is final.</p>`;
    return;
  }
  const game = record.nextGame;
  if (!game) {
    els.next.innerHTML = `<p class="label">Next game</p><p class="summary">No belt games are scheduled right now.</p>`;
    return;
  }
  const live = game.live;
  const side = (code, score, at) => `
    <div class="row">
      <span class="team"><span class="at">${at ? '@' : ''}</span>${logo(code, 96, 'logo', 'eager')}${name(code)}${
        code === record.holder ? belt('Belt holder') : ''
      }</span>
      ${live ? `<span class="score">${score}</span>` : ''}
    </div>`;
  els.next.innerHTML = `
    <p class="label${live ? ' live' : ''}">${
      live ? `<span class="live-dot"></span>Live<span class="detail">· ${esc(live.detail)}</span>` : 'Next game'
    }</p>
    <div class="rows">
      ${side(game.away, live?.awayScore, false)}
      ${side(game.home, live?.homeScore, true)}
    </div>
    ${live ? '' : `<p class="when">${esc(formatWhen(game.date))}</p>`}`;
}

function renderHistory(record) {
  const changes = record.transfers
    .slice()
    .reverse()
    .map((t) => {
      const [winner, loser] = t.home.team === t.to ? [t.home, t.away] : [t.away, t.home];
      return `
        <li class="change">
          <time datetime="${esc(t.date)}">${esc(formatDate(t.date))}</time>
          <div class="rows">
            <div class="row winner">${team(winner.team, { after: belt('Took the belt') })}<span class="score">${winner.score}</span></div>
            <div class="row loser">${team(loser.team)}<span class="score">${loser.score}</span></div>
          </div>
        </li>`;
    });
  const opener = record.startedAt
    ? `<li class="change season-start">
        <time datetime="${esc(record.startedAt)}">${esc(formatDate(record.startedAt))}</time>
        <p>Season opened with ${team(record.startingHolder, { inline: true })}, the defending champions, holding the belt.</p>
      </li>`
    : '';
  els.history.innerHTML = `
    <div class="history-head">
      <h2 class="label">Belt changes</h2>
      <span class="count">${record.transfers.length}</span>
    </div>
    <ol class="changes">${changes.join('')}${opener}</ol>`;
}

function renderUpdated() {
  if (!state.current) return;
  const { updatedAt } = state.current.record;
  els.updated.textContent = `Updated ${timeAgo(updatedAt)}`;
  els.updated.title = fullFormat.format(new Date(updatedAt));
}

function renderError() {
  els.main.setAttribute('aria-busy', 'false');
  els.main.innerHTML = `
    <section class="card">
      <p class="label">Something went wrong</p>
      <p class="error">Couldn't load the belt right now. Trying again shortly…</p>
    </section>`;
}

// ----- Behavior -----

async function start() {
  try {
    const [teams] = await Promise.all([getJSON('/teams.json'), loadCurrent()]);
    state.teams = teams;
    const wanted = Number(new URLSearchParams(location.search).get('season'));
    state.season = state.current.seasons.includes(wanted) ? wanted : state.current.record.season;
    await loadSeason(state.season);
  } catch (err) {
    console.error(err);
    renderError();
    setTimeout(() => location.reload(), 30_000);
    return;
  }
  render();
  schedulePoll();
  prefetchSeasons();
}

/** Loads the other seasons in the background so switching is instant. */
function prefetchSeasons() {
  const whenIdle = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 1500));
  whenIdle(async () => {
    for (const season of state.current.seasons) {
      try {
        await loadSeason(season);
      } catch {
        return; // try again when the visitor picks it
      }
    }
  });
}

let pollTimer;
function schedulePoll() {
  clearTimeout(pollTimer);
  if (!document.hidden) pollTimer = setTimeout(refresh, POLL_MS);
}

async function refresh() {
  try {
    await loadCurrent();
    render();
  } catch (err) {
    console.warn('Refresh failed; will retry', err);
  }
  schedulePoll();
}

els.season.addEventListener('change', async () => {
  const previous = state.season;
  const season = Number(els.season.value);
  state.season = season;
  if (!state.records.has(season)) {
    els.main.setAttribute('aria-busy', 'true');
    try {
      await loadSeason(season);
    } catch (err) {
      console.error(err);
      state.season = previous;
    }
  }
  const followed = state.current.record.season;
  history.replaceState(null, '', state.season === followed ? location.pathname : `?season=${state.season}`);
  render();
});

els.theme.addEventListener('click', () => setTheme(theme() === 'dark' ? 'light' : 'dark'));
darkQuery.addEventListener('change', render);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearTimeout(pollTimer);
  else if (state.current) refresh();
});
setInterval(renderUpdated, 15_000);

render();
start();
