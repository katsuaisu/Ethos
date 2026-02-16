import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Decode base64 data URL to raw text (for text-based files)
function decodeBase64Text(dataUrl: string): string {
  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  return atob(base64);
}

// Extract text from simple XML-based formats (DOCX, PPTX)
function extractXmlText(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// Chunk text into sections preserving hierarchy
function chunkText(text: string, maxChunkSize = 2000): { sections: { heading: string; content: string }[] } {
  const lines = text.split(/\n/);
  const sections: { heading: string; content: string }[] = [];
  let currentHeading = "Overview";
  let currentContent: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Detect heading-like patterns
    const isHeading = /^(#{1,6}\s|[A-Z][A-Za-z\s]{5,60}$|[\d]+\.\s+[A-Z])/.test(trimmed) 
      || (trimmed.length < 80 && trimmed === trimmed.replace(/[a-z]/g, '').length > trimmed.length * 0.5 ? false : /^[A-Z]/.test(trimmed) && !trimmed.includes('.') && trimmed.length < 60);

    if (isHeading && currentContent.join(" ").length > 100) {
      sections.push({ heading: currentHeading, content: currentContent.join("\n").slice(0, maxChunkSize) });
      currentHeading = trimmed.replace(/^#{1,6}\s*/, "");
      currentContent = [];
    } else {
      currentContent.push(trimmed);
    }

    // Auto-split long sections
    if (currentContent.join(" ").length > maxChunkSize) {
      sections.push({ heading: currentHeading, content: currentContent.join("\n").slice(0, maxChunkSize) });
      currentHeading = currentHeading + " (cont.)";
      currentContent = [];
    }
  }

  if (currentContent.length > 0) {
    sections.push({ heading: currentHeading, content: currentContent.join("\n").slice(0, maxChunkSize) });
  }

  return { sections: sections.length > 0 ? sections : [{ heading: "Content", content: text.slice(0, maxChunkSize) }] };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { fileData, fileName } = await req.json();
    if (!fileData || !fileName) throw new Error("fileData and fileName are required");

    const ext = fileName.split(".").pop()?.toLowerCase() || "";
    let rawText = "";

    // Text-based files: decode directly
    if (["txt", "md", "csv", "json", "xml", "html", "htm", "log", "yaml", "yml", "toml", "ini", "cfg"].includes(ext)) {
      rawText = decodeBase64Text(fileData);
    }
    // PDF: extract text between stream markers and decode readable portions
    else if (ext === "pdf") {
      const raw = decodeBase64Text(fileData);
      // Extract text objects from PDF - look for text between BT/ET markers and parentheses
      const textMatches = raw.match(/\(([^)]{2,})\)/g) || [];
      const pieces: string[] = [];
      for (const match of textMatches) {
        const inner = match.slice(1, -1);
        // Filter out binary junk - only keep strings with mostly printable chars
        const printable = inner.replace(/[^\\x20-\\x7E\\xA0-\\xFF]/g, "");
        if (printable.length > inner.length * 0.6 && printable.length > 3) {
          pieces.push(printable);
        }
      }
      rawText = pieces.join(" ");
      
      // If direct extraction yields little, try a broader approach
      if (rawText.length < 100) {
        const broader = raw
          .replace(/[^\\x20-\\x7E\n\r\t]/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        // Extract meaningful words (3+ chars, mostly alpha)
        const words = broader.split(" ").filter(w => w.length > 2 && /^[a-zA-Z]/.test(w));
        rawText = words.join(" ");
      }
    }
    // DOCX/PPTX: these are ZIP files with XML inside - extract what we can from the base64
    else if (["docx", "doc", "pptx", "ppt"].includes(ext)) {
      const raw = decodeBase64Text(fileData);
      // Find XML-like content embedded in the binary
      const xmlFragments = raw.match(/<[a-z:]+[^>]*>[^<]+\/[a-z:]+>/gi) || [];
      const texts: string[] = [];
      for (const frag of xmlFragments) {
        const cleaned = extractXmlText(frag);
        if (cleaned.length > 2) texts.push(cleaned);
      }
      rawText = texts.join("\n");

      // Fallback: extract readable strings
      if (rawText.length < 50) {
        const readable = raw
          .replace(/[^\\x20-\\x7E\n]/g, " ")
          .replace(/\s+/g, " ")
          .split(" ")
          .filter(w => w.length > 3 && /^[a-zA-Z]/.test(w));
        rawText = readable.join(" ");
      }
    }
    // Fallback for unknown types
    else {
      try {
        rawText = decodeBase64Text(fileData);
        // Check if it's actually readable text
        const printableRatio = rawText.replace(/[^\\x20-\\x7E\n\r\t]/g, "").length / rawText.length;
        if (printableRatio < 0.7) {
          rawText = rawText.replace(/[^\\x20-\\x7E\n\r\t]/g, " ").replace(/\s+/g, " ").trim();
        }
      } catch {
        rawText = "[Unable to extract text from this file format]";
      }
    }

    // Truncate to reasonable size
    if (rawText.length > 15000) rawText = rawText.slice(0, 15000);

    // Clean up the text
    rawText = rawText.replace(/\s+/g, " ").trim();

    // Chunk into structured sections
    const structured = chunkText(rawText);

    // Generate a summary line
    const wordCount = rawText.split(/\s+/).length;
    const summary = rawText.length > 200 ? rawText.slice(0, 200).trim() + "..." : rawText;

    return new Response(JSON.stringify({
      fileName,
      fileType: ext,
      wordCount,
      summary,
      fullText: rawText,
      sections: structured.sections,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("file-extract error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Extraction failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
