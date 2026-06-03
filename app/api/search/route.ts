import { NextRequest, NextResponse } from "next/server";

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

// Public SearXNG instances — free, no API key, JSON output
const SEARXNG_INSTANCES = [
  "https://searx.be",
  "https://search.bus-hit.me",
  "https://searx.tuxcloud.net",
  "https://search.sapti.me",
];

/**
 * Web search proxy via SearXNG public instances.
 * GET /api/search?q=keyword
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q || q.trim().length === 0) {
    return NextResponse.json(
      { error: true, message: "Missing query parameter 'q'" },
      { status: 400 },
    );
  }

  for (const instance of SEARXNG_INSTANCES) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const searchUrl = `${instance}/search?q=${encodeURIComponent(
        q,
      )}&format=json&language=zh-CN&categories=general`;
      const resp = await fetch(searchUrl, {
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (compatible; RemoteAI/1.0)",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!resp.ok) continue;

      const json: any = await resp.json();
      const results: SearchResult[] =
        json.results?.slice(0, 5).map((r: any) => ({
          title: r.title || "No title",
          url: r.url || "",
          snippet: (r.content || r.snippet || "").replace(/<[^>]*>/g, ""),
        })) ?? [];

      if (results.length > 0) {
        return NextResponse.json({ results, query: q });
      }
    } catch {
      // timeout or network error → try next instance
    }
  }

  return NextResponse.json(
    { error: true, message: "All search instances unavailable" },
    { status: 502 },
  );
}

export const runtime = "nodejs";
