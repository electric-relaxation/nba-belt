import { getBeltData } from "../../src/lib/data";

type PagesFunction<EnvBindings = Record<string, unknown>> = (context: {
  request: Request;
  env: EnvBindings;
}) => Promise<Response> | Response;

const getDefaultSeasonStartYear = (now: Date): number => {
  const month = now.getUTCMonth();
  const year = now.getUTCFullYear();
  return month >= 9 ? year : year - 1;
};

export const onRequestGet: PagesFunction = async (context) => {
  const { request } = context;
  const now = new Date();
  const url = new URL(request.url);
  const seasonParam = url.searchParams.get("season");
  const seasonStartYear = seasonParam
    ? Number.parseInt(seasonParam, 10)
    : getDefaultSeasonStartYear(now);

  if (!Number.isFinite(seasonStartYear)) {
    return new Response(JSON.stringify({ error: "Invalid season parameter." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const data = await getBeltData({
      seasonStartYear,
      nowUtcIso: now.toISOString(),
    });

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=0, must-revalidate",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load belt data.";
    return new Response(JSON.stringify({ error: message }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
};
