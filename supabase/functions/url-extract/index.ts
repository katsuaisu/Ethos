import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// URL type detection
type UrlType = "youtube" | "webpage" | "pdf" | "unknown";

function detectUrlType(url: string): UrlType {
  const lower = url.toLowerCase();
  if (/youtube\.com\/watch|youtu\.be\/|youtube\.com\/embed|youtube\.com\/shorts/i.test(lower)) return "youtube";
  if (/\.pdf(\?|$)/i.test(lower)) return "pdf";
  if (/^https?:\/\//i.test(lower)) return "webpage";
  return "unknown";
}

function extractYoutubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

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
    if (text.length > 0) headings.push({ level: parseInt(match[1]), text });
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

  // Build sections from headings
  const allText = cleaned
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ").trim();

  const sections: { heading: string; content: string }[] = [];
  if (headings.length > 0) {
    for (let i = 0; i < headings.length; i++) {
      const heading = headings[i].text;
      const startIdx = allText.indexOf(heading);
      const nextHeading = headings[i + 1]?.text;
      const endIdx = nextHeading ? allText.indexOf(nextHeading, startIdx + heading.length) : undefined;
      const sectionText = allText.slice(startIdx + heading.length, endIdx).trim();
      if (sectionText.length > 10) sections.push({ heading, content: sectionText.slice(0, 2000) });
    }
  }

  const flatContent = allText.slice(0, 10000);

  const sentences = flatContent.split(/[.!?]+/).filter(s => s.trim().length > 30);
  const keyConcepts = sentences
    .filter(s => /\b(important|key|critical|essential|significant|main|primary|fundamental|core|crucial)\b/i.test(s))
    .slice(0, 10)
    .map(s => s.trim());

  return { headings, paragraphs: paragraphs.slice(0, 30), lists: lists.slice(0, 10), sections: sections.slice(0, 20), keyConcepts, fullText: flatContent };
}

// Validate extracted content against URL to prevent hallucination
function validateExtraction(url: string, title: string, content: string): { valid: boolean; reason?: string } {
  // Content must have minimum substance
  if (content.length < 50) return { valid: false, reason: "Extracted content too short to be meaningful" };
  
  // Verify domain in title or content roughly matches URL
  try {
    const urlDomain = new URL(url).hostname.replace("www.", "").split(".")[0];
    // Loose check — domain keyword should appear somewhere in the page
    const combined = (title + " " + content).toLowerCase();
    // Skip domain validation for common platforms (youtube, etc.) where page title won't contain domain
    const skipDomainCheck = ["youtube", "youtu", "google", "facebook", "twitter", "instagram", "linkedin", "reddit", "github"].some(d => urlDomain.includes(d));
    if (!skipDomainCheck && !combined.includes(urlDomain.toLowerCase()) && content.length < 200) {
      return { valid: false, reason: `Domain mismatch: expected content from ${urlDomain}` };
    }
  } catch { /* invalid URL, skip domain check */ }

  return { valid: true };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { url } = await req.json();
    if (!url) throw new Error("URL is required");

    const urlType = detectUrlType(url);

    // ── YouTube handling ──
    if (urlType === "youtube") {
      const videoId = extractYoutubeVideoId(url);
      if (!videoId) throw new Error("Unable to extract YouTube video ID from URL.");

      // Fetch YouTube oEmbed for accurate title
      let videoTitle = "";
      let videoDescription = "";
      try {
        const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
        if (oembedRes.ok) {
          const oembed = await oembedRes.json();
          videoTitle = oembed.title || "";
        }
      } catch { /* oEmbed failed, try page fallback */ }

      // Fetch the actual YouTube page to get description
      try {
        const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; EthosBot/1.0)", "Accept-Language": "en-US,en;q=0.9" },
        });
        if (pageRes.ok) {
          const pageHtml = await pageRes.text();
          // Extract title if we don't have it
          if (!videoTitle) {
            const titleMatch = pageHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
            videoTitle = titleMatch ? titleMatch[1].replace(/ - YouTube$/, "").trim() : `YouTube Video ${videoId}`;
          }
          // Extract description from meta
          const descMatch = pageHtml.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*?)["']/i);
          videoDescription = descMatch ? descMatch[1].trim() : "";
        }
      } catch { /* page fetch failed */ }

      if (!videoTitle) videoTitle = `YouTube Video ${videoId}`;

      // Build structured response — NO transcript guessing
      const structuredContent = `# ${videoTitle}\n\nVideo ID: ${videoId}\nURL: ${url}\n\n${videoDescription ? `## Description\n${videoDescription}` : ""}`;

      const disclaimer = videoDescription
        ? ""
        : "\n\n⚠️ Transcript unavailable. Only the video title and metadata could be extracted. If you need the full content, please upload the transcript manually.";

      return new Response(JSON.stringify({
        title: videoTitle,
        description: videoDescription,
        urlType: "youtube",
        videoId,
        content: structuredContent + disclaimer,
        structured: {
          headings: [{ level: 1, text: videoTitle }],
          paragraphs: videoDescription ? [videoDescription] : [],
          lists: [],
          sections: videoDescription ? [{ heading: videoTitle, content: videoDescription }] : [],
          keyConcepts: [],
          fullText: structuredContent + disclaimer,
        },
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Standard webpage / PDF ──
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; EthosBot/1.0; +https://ethosdev.lovable.app)",
        "Accept": "text/html,application/xhtml+xml,text/plain,application/json",
      },
      redirect: "follow",
    });

    if (!response.ok) throw new Error(`Unable to retrieve page content. Please check the link. (Status: ${response.status})`);

    const contentType = response.headers.get("content-type") || "";

    // JSON
    if (contentType.includes("application/json")) {
      const rawText = await response.text();
      try {
        const jsonData = JSON.parse(rawText);
        return new Response(JSON.stringify({
          title: url,
          description: "JSON data",
          urlType: "json",
          content: JSON.stringify(jsonData, null, 2).slice(0, 10000),
          structured: { headings: [], paragraphs: [], lists: [], sections: [{ heading: "JSON Data", content: JSON.stringify(jsonData, null, 2).slice(0, 5000) }], keyConcepts: [], fullText: JSON.stringify(jsonData, null, 2).slice(0, 10000) },
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch {}
    }

    // PDF — can't extract text in edge function easily, return metadata only
    if (urlType === "pdf" || contentType.includes("application/pdf")) {
      return new Response(JSON.stringify({
        title: url.split("/").pop() || url,
        description: "PDF document",
        urlType: "pdf",
        content: "This is a PDF file. Please download and upload it directly for text extraction.",
        structured: { headings: [], paragraphs: ["This is a PDF file. Please download and upload it directly for text extraction."], lists: [], sections: [], keyConcepts: [], fullText: "" },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // HTML webpage
    const rawText = await response.text();
    const titleMatch = rawText.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].replace(/\s+/g, " ").trim() : url;
    const descMatch = rawText.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
    const description = descMatch ? descMatch[1].trim() : "";
    const ogMatch = rawText.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
    const ogImage = ogMatch ? ogMatch[1] : "";

    const structured = extractStructuredContent(rawText);

    // Validate extraction before returning
    const validation = validateExtraction(url, title, structured.fullText);
    if (!validation.valid) {
      return new Response(JSON.stringify({
        error: `Unable to retrieve meaningful content from this page. ${validation.reason || "Please check the link."}`,
      }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({
      title,
      description,
      ogImage,
      urlType: "webpage",
      content: structured.fullText.slice(0, 8000),
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