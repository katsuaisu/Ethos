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
      ideation: `You are Ethos, a sophisticated AI ideation partner. You help users brainstorm, structure ideas, and think creatively. You speak with clarity and warmth. Use markdown formatting naturally - headings for key concepts, bullet points for lists, bold for emphasis. When suggesting ideas, organize them clearly. You're like a brilliant creative director who understands both design thinking and strategic planning. Keep responses focused and actionable. When asked to generate mindmaps, create structured hierarchical outlines using nested lists.`,
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
      layout: `You are Ethos Layout Engine. Given raw text or ideas, organize them into a spatial layout. Return ONLY valid JSON array:
[
  { "content": "Summary text", "x": 0, "y": 0, "type": "sticky_note", "color": "#FFF9DB" },
  { "content": "Another point", "x": 300, "y": 0, "type": "sticky_note", "color": "#D4EDDA" }
]
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
