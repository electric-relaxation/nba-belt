// The Cloudflare Worker: a small JSON API over the season records, and the cron job that keeps
// the current season up to date. Static files (the page, logos, data/) are served by Cloudflare
// directly and never reach this code.

import { FIRST_SEASON } from './config.ts';
import { fetchDay } from './espn.ts';
import type { SeasonRecord } from './types.ts';
import { runUpdate, type Store } from './update.ts';

interface Env {
  /** season:{year} → SeasonRecord; meta → { season } (the season the site is following). */
  BELT: KVNamespace;
  ASSETS: Fetcher;
}

export default {
  async fetch(request, env) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 });
    }
    const store = kvStore(env);
    const { pathname } = new URL(request.url);

    if (pathname === '/nba-belt/api/current') {
      const season = await store.trackedSeason();
      const record = await store.getRecord(season);
      if (!record) return notFound();
      const seasons = Array.from({ length: season - FIRST_SEASON + 1 }, (_, i) => season - i);
      return json({ seasons, record }, 30);
    }

    const match = /^\/nba-belt\/api\/season\/(\d{4})$/.exec(pathname);
    if (match) {
      const season = Number(match[1]);
      const record = season >= FIRST_SEASON ? await store.getRecord(season) : null;
      if (!record) return notFound();
      return json(record, record.status === 'final' ? 3600 : 30);
    }

    return notFound();
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runUpdate(kvStore(env), fetchDay, new Date(controller.scheduledTime)));
  },
} satisfies ExportedHandler<Env>;

/** Season records live in KV. Seasons finished before the first deploy fall back to public/nba-belt/data/. */
function kvStore(env: Env): Store {
  const staticJson = async <T>(file: string): Promise<T | null> => {
    const res = await env.ASSETS.fetch(`https://assets.local/nba-belt/data/${file}`);
    return res.ok ? ((await res.json()) as T) : null;
  };
  return {
    async trackedSeason() {
      const meta = await env.BELT.get<{ season: number }>('meta', 'json');
      if (meta) return meta.season;
      // First run after deploy: follow the newest season in the repo.
      const index = await staticJson<{ seasons: number[] }>('index.json');
      if (!index?.seasons.length) throw new Error('No seasons in data/index.json');
      await this.setTrackedSeason(index.seasons[0]);
      return index.seasons[0];
    },
    async setTrackedSeason(season) {
      await env.BELT.put('meta', JSON.stringify({ season }));
    },
    async getRecord(season) {
      return (
        (await env.BELT.get<SeasonRecord>(`season:${season}`, 'json')) ??
        (await staticJson<SeasonRecord>(`${season}.json`))
      );
    },
    async putRecord(record) {
      await env.BELT.put(`season:${record.season}`, JSON.stringify(record));
    },
  };
}

function json(body: unknown, maxAge: number): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, max-age=${maxAge}`,
    },
  });
}

function notFound(): Response {
  return new Response('Not found', { status: 404 });
}
