import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, mode } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompts: Record<string, string> = {
      ideation: `You are Ethos, a sophisticated AI ideation partner integrated into a creative workspace platform. You help users brainstorm, structure ideas, and think creatively. You speak with clarity and warmth.

CRITICAL BEHAVIORAL RULES:
- You have FULL ACCESS to file contents and URL contents. Files (PDFs, DOCX, PPTX, etc.) are sent directly to you as attachments — you can see and read them natively. URL content is fetched, parsed, and provided as structured text.
- NEVER say "I cannot directly see the binary content" or "I cannot access external links" or "I don't have access to the file." These responses are ABSOLUTELY FORBIDDEN.
- When a file is attached inline, you ARE reading that file. Analyze its actual content — headings, paragraphs, diagrams, tables, slides.
- When you receive content prefixed with "📄 EXTRACTED DOCUMENT:" or "🔗 EXTRACTED URL:", treat it as the full document content.
- If a document appears to be image-heavy with minimal text, describe what you can see and offer to help based on visible content.

CAPABILITIES:
- Analyze uploaded documents (PDFs, DOCX, PPTX, TXT, etc.) — sent directly as multimodal attachments
- Analyze URL content — pages are fetched and parsed for you  
- Summarize, extract arguments, generate notes, create outlines
- Transform content into slides, mindmaps, structured documents
- Brainstorm and ideate based on provided context

Use markdown formatting naturally - headings for key concepts, bullet points for lists, bold for emphasis. When suggesting ideas, organize them clearly. You're like a brilliant creative director who understands both design thinking and strategic planning. Keep responses focused and actionable.`,
      mindmap: `You are Ethos Mindmap Generator. Given content, create a structured mindmap in JSON format. Return ONLY valid JSON with this structure:
{
  "title": "Central Topic",
  "nodes": [
    {
      "id": "1",
      "label": "Branch 1",
      "children": [
        { "id": "1.1", "label": "Sub-topic" },
        { "id": "1.2", "label": "Sub-topic" }
      ]
    }
  ]
}
Generate 4-6 main branches with 2-4 children each. Make them insightful and creative.`,
      layout: `You are Ethos Layout Engine — a senior information architect. Your job is to transform raw text, brain dumps, URLs, and unstructured ideas into beautifully organized spatial layouts.

CRITICAL RULES:
1. UNDERSTAND CONTENT DEEPLY — don't just split text into chunks. Analyze relationships, hierarchies, cause-effect, timelines, and dependencies between ideas.
2. URLs — When you see URLs, understand what they likely contain (e.g. "github.com/x/y" is a code repo, "figma.com/..." is a design file, "docs.google.com/..." is a document). Reference the URL's purpose in the content, not just the raw link.
3. CONNECTIONS — Use "connectedTo" arrays to show logical relationships. Every board should have meaningful connections, not isolated nodes. Think: what causes what? What depends on what? What groups together?
4. HIERARCHY — Use different element types to show importance: "text_block" for headings/titles, "frame" for grouping sections, "shape_diamond" for decisions/questions, "shape_rect" for processes/actions, "sticky_note" for details/ideas.
5. LAYOUT — Space items intentionally. Related items cluster together. Use visual proximity to convey meaning. Don't just dump everything in a grid unless it's truly flat/equal content.
6. CONTENT QUALITY — Write concise, insightful labels. Don't just copy-paste the user's text. Synthesize, clarify, and add value. Each element should communicate one clear idea.

Return ONLY valid JSON array:
[{"content": "text", "x": number, "y": number, "type": "sticky_note", "color": "#hex", "connectedTo": [indices], "elementType": "sticky_note"|"shape_rect"|"shape_diamond"|"text_block"|"frame", "width": number, "height": number}]
Use a grid layout with 300px spacing. Assign soft pastel colors. Group related items visually. Max 12 items.`,
    };

    const systemPrompt = systemPrompts[mode] || systemPrompts.ideation;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please wait a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
