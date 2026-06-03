import { NextRequest, NextResponse } from "next/server";

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

// ========== Source 1: SearXNG public instances (free, aggregator) ==========
const SEARXNG_INSTANCES = [
  "https://searx.be",
  "https://search.bus-hit.me",
  "https://searx.tuxcloud.net",
];

async function searchSearXNG(instance: string, q: string): Promise<SearchResult[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const resp = await fetch(
      `${instance}/search?q=${encodeURIComponent(q)}&format=json&categories=general`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (compatible; RemoteAI/1.0)",
        },
        signal: controller.signal,
      },
    );

    clearTimeout(timeoutId);
    if (!resp.ok) return [];

    const json: any = await resp.json();
    return (json.results ?? []).slice(0, 5).map((r: any) => ({
      title: (r.title || "").replace(/<[^>]*>/g, "").trim() || "No title",
      url: r.url || "",
      snippet: (r.content || r.snippet || "").replace(/<[^>]*>/g, "").trim(),
    }));
  } catch {
    clearTimeout(timeoutId);
    return [];
  }
}

// ========== Source 2: Tavily (if API key set) ==========
async function searchTavily(q: string): Promise<SearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const resp = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey, query: q, search_depth: "basic", max_results: 5 }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    if (!resp.ok) return [];

    const json: any = await resp.json();
    return (json.results ?? []).map((r: any) => ({
      title: r.title || "No title",
      url: r.url || "",
      snippet: r.content || "",
    }));
  } catch {
    clearTimeout(timeoutId);
    return [];
  }
}

// ========== Merge & dedup ==========
function mergeResults(sources: SearchResult[][]): SearchResult[] {
  const seen = new Set<string>();
  const merged: SearchResult[] = [];

  for (const batch of sources) {
    for (const r of batch) {
      if (!r.url) continue;
      // Normalize URL for dedup
      const key = r.url.replace(/^https?:\/\//, "").replace(/\/$/, "").toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(r);
      }
    }
  }

  return merged.slice(0, 8);
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q || q.trim().length === 0) {
    return NextResponse.json({ error: true, message: "Missing query 'q'" }, { status: 400 });
  }

  // Run all sources concurrently
  const [tavilyResults, ...searxngBatches] = await Promise.all([
    searchTavily(q),
    ...SEARXNG_INSTANCES.map((inst) => searchSearXNG(inst, q)),
  ]);

  const results = mergeResults([tavilyResults, ...searxngBatches]);

  if (results.length === 0) {
    return NextResponse.json({ error: true, message: "No results" }, { status: 502 });
  }

  return NextResponse.json({ results, query: q });
}

export const runtime = "nodejs";
