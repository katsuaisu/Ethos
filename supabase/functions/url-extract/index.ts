import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function extractStructuredContent(html: string) {
  // Remove scripts, styles, nav, footer, aside, ads
  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<aside[\s\S]*?<\/aside>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "");

  // Extract headings
  const headings: { level: number; text: string }[] = [];
  const headingRegex = /<h([1-6])[^>]*>([\s\S]*?)<\/h[1-6]>/gi;
  let match;
  while ((match = headingRegex.exec(cleaned)) !== null) {
    const text = match[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (text.length > 0) {
      headings.push({ level: parseInt(match[1]), text });
    }
  }

  // Extract paragraphs
  const paragraphs: string[] = [];
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  while ((match = pRegex.exec(cleaned)) !== null) {
    const text = match[1].replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
    if (text.length > 20) paragraphs.push(text);
  }

  // Extract lists
  const lists: string[][] = [];
  const ulRegex = /<[ou]l[^>]*>([\s\S]*?)<\/[ou]l>/gi;
  while ((match = ulRegex.exec(cleaned)) !== null) {
    const items: string[] = [];
    const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let liMatch;
    while ((liMatch = liRegex.exec(match[1])) !== null) {
      const text = liMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (text.length > 2) items.push(text);
    }
    if (items.length > 0) lists.push(items);
  }

  // Build sections from headings + following content
  const sections: { heading: string; content: string }[] = [];
  const allText = cleaned
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ").trim();

  if (headings.length > 0) {
    // Build sections around headings
    for (let i = 0; i < headings.length; i++) {
      const heading = headings[i].text;
      const startIdx = allText.indexOf(heading);
      const nextHeading = headings[i + 1]?.text;
      const endIdx = nextHeading ? allText.indexOf(nextHeading, startIdx + heading.length) : undefined;
      const sectionText = allText.slice(startIdx + heading.length, endIdx).trim();
      if (sectionText.length > 10) {
        sections.push({ heading, content: sectionText.slice(0, 2000) });
      }
    }
  }

  // Build flat content as well
  const flatContent = allText.slice(0, 10000);

  // Extract key concepts (sentences with important-sounding patterns)
  const sentences = flatContent.split(/[.!?]+/).filter(s => s.trim().length > 30);
  const keyConcepts = sentences
    .filter(s => /\b(important|key|critical|essential|significant|main|primary|fundamental|core|crucial)\b/i.test(s))
    .slice(0, 10)
    .map(s => s.trim());

  return {
    headings,
    paragraphs: paragraphs.slice(0, 30),
    lists: lists.slice(0, 10),
    sections: sections.slice(0, 20),
    keyConcepts,
    fullText: flatContent,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { url } = await req.json();
    if (!url) throw new Error("URL is required");

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; EthosBot/1.0; +https://ethosdev.lovable.app)",
        "Accept": "text/html,application/xhtml+xml,text/plain,application/json",
      },
      redirect: "follow",
    });

    if (!response.ok) throw new Error(`Unable to retrieve page content. Please check the link. (Status: ${response.status})`);

    const contentType = response.headers.get("content-type") || "";
    const rawText = await response.text();

    // If JSON, return it structured
    if (contentType.includes("application/json")) {
      try {
        const jsonData = JSON.parse(rawText);
        return new Response(JSON.stringify({
          title: url,
          description: "JSON data",
          content: JSON.stringify(jsonData, null, 2).slice(0, 10000),
          structured: { headings: [], paragraphs: [], lists: [], sections: [{ heading: "JSON Data", content: JSON.stringify(jsonData, null, 2).slice(0, 5000) }], keyConcepts: [], fullText: JSON.stringify(jsonData, null, 2).slice(0, 10000) },
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch {}
    }

    // Extract title
    const titleMatch = rawText.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].replace(/\s+/g, " ").trim() : url;

    // Extract meta description
    const descMatch = rawText.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
    const description = descMatch ? descMatch[1].trim() : "";

    // Extract OG image
    const ogMatch = rawText.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
    const ogImage = ogMatch ? ogMatch[1] : "";

    // Get structured content
    const structured = extractStructuredContent(rawText);

    // Build flat content for backward compat
    const flatContent = structured.fullText.slice(0, 8000);

    return new Response(JSON.stringify({
      title,
      description,
      ogImage,
      content: flatContent,
      structured,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("url-extract error:", e);
    const msg = e instanceof Error ? e.message : "Unable to retrieve page content. Please check the link.";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
