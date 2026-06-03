import { NextRequest, NextResponse } from "next/server";

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

/**
 * Web search proxy via DuckDuckGo HTML.
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

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    // DuckDuckGo HTML search – lightweight, no API key needed
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(
      q,
    )}`;
    const resp = await fetch(ddgUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!resp.ok) {
      return NextResponse.json(
        { error: true, message: `Search failed with status ${resp.status}` },
        { status: resp.status },
      );
    }

    const html = await resp.text();
    const results = parseDuckDuckGoHtml(html);

    return NextResponse.json({ results, query: q });
  } catch (err: any) {
    if (err.name === "AbortError") {
      return NextResponse.json(
        { error: true, message: "Search timed out" },
        { status: 504 },
      );
    }
    return NextResponse.json(
      { error: true, message: err.message || "Search failed" },
      { status: 500 },
    );
  }
}

/**
 * Parse DuckDuckGo HTML search results.
 * Extracts title, url, and snippet from each result block.
 */
function parseDuckDuckGoHtml(html: string): SearchResult[] {
  const results: SearchResult[] = [];

  // Each result block: <div class="result"> ... </div>
  // Title: <a class="result__a" href="...">title</a>
  // Snippet: <a class="result__snippet">snippet</a>
  // URL shown: <span class="link-text">url</span>

  const resultBlocks = html.split('class="result__body"');
  // Skip the first split (everything before first result)
  for (let i = 1; i < resultBlocks.length; i++) {
    const block = resultBlocks[i];

    // Extract URL from <a class="result__a" href="...">
    const urlMatch = block.match(
      /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>/i,
    );
    if (!urlMatch) continue;

    let url = urlMatch[1];
    // Clean DuckDuckGo redirect wrapper
    url = decodeURIComponent(
      url.replace(/^\/\/duckduckgo\.com\/l\/\?uddg=/, "").split("&rut=")[0],
    );
    if (!url.startsWith("http")) url = "https:" + url;

    // Extract title text
    const titleMatch = block.match(
      /<a[^>]*class="result__a"[^>]*>([\s\S]*?)<\/a>/i,
    );
    const title = titleMatch ? stripHtml(titleMatch[1]).trim() : "No title";

    // Extract snippet
    const snippetMatch = block.match(
      /<[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/[^>]*>/i,
    );
    const snippet = snippetMatch ? stripHtml(snippetMatch[1]).trim() : "";

    if (title || snippet) {
      results.push({ title, url, snippet });
    }

    if (results.length >= 8) break; // limit to 8 results
  }

  // Fallback: try simpler regex approach
  if (results.length === 0) {
    const linkRegex =
      /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = linkRegex.exec(html)) !== null) {
      let url = m[1];
      url = decodeURIComponent(
        url.replace(/^\/\/duckduckgo\.com\/l\/\?uddg=/, "").split("&rut=")[0],
      );
      if (!url.startsWith("http")) url = "https:" + url;
      const title = stripHtml(m[2]).trim();
      if (title) {
        results.push({ title, url, snippet: "" });
      }
      if (results.length >= 8) break;
    }
  }

  return results;
}

function stripHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const runtime = "nodejs";
