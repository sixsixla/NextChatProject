import { NextRequest, NextResponse } from "next/server";

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

// Tavily Search API — specialized AI search, requires API key
async function searchTavily(q: string): Promise<SearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const resp = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query: q,
        search_depth: "basic",
        include_answer: false,
        max_results: 5,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!resp.ok) return [];

    const json: any = await resp.json();
    return (
      json.results?.map((r: any) => ({
        title: r.title || "No title",
        url: r.url || "",
        snippet: r.content || "",
      })) ?? []
    );
  } catch {
    clearTimeout(timeoutId);
    return [];
  }
}

// Public SearXNG instances — free fallback
const SEARXNG_INSTANCES = ["https://searx.be", "https://search.bus-hit.me"];

async function searchSearXNG(q: string): Promise<SearchResult[]> {
  for (const instance of SEARXNG_INSTANCES) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const resp = await fetch(
        `${instance}/search?q=${encodeURIComponent(
          q,
        )}&format=json&language=zh-CN&categories=general`,
        {
          headers: {
            Accept: "application/json",
            "User-Agent": "Mozilla/5.0 (compatible; RemoteAI/1.0)",
          },
          signal: controller.signal,
        },
      );

      clearTimeout(timeoutId);

      if (!resp.ok) continue;

      const json: any = await resp.json();
      const results: SearchResult[] =
        json.results?.slice(0, 5).map((r: any) => ({
          title: r.title || "No title",
          url: r.url || "",
          snippet: (r.content || r.snippet || "").replace(/<[^>]*>/g, ""),
        })) ?? [];

      if (results.length > 0) return results;
    } catch {
      // try next instance
    }
  }
  return [];
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q || q.trim().length === 0) {
    return NextResponse.json(
      { error: true, message: "Missing query parameter 'q'" },
      { status: 400 },
    );
  }

  // 1. Try Tavily first (if API key configured)
  let results = await searchTavily(q);
  if (results.length > 0) {
    return NextResponse.json({ results, query: q, source: "tavily" });
  }

  // 2. Fall back to SearXNG
  results = await searchSearXNG(q);
  if (results.length > 0) {
    return NextResponse.json({ results, query: q, source: "searxng" });
  }

  return NextResponse.json(
    { error: true, message: "All search sources unavailable" },
    { status: 502 },
  );
}

export const runtime = "nodejs";
