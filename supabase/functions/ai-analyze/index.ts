import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { imageBase64, prompt, analysisType } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompts: Record<string, string> = {
      categorize: `You are a visual analysis expert. Analyze this image and return a JSON object with:
{
  "title": "What this image represents",
  "category": "Category name",
  "tags": ["tag1", "tag2", "tag3"],
  "description": "Brief description",
  "insights": ["Insight 1", "Insight 2"],
  "suggestedLayout": "grid|mindmap|timeline",
  "mindmap": {
    "title": "Central concept from image",
    "nodes": [
      { "id": "1", "label": "Key theme 1", "children": [{ "id": "1.1", "label": "Detail" }] },
      { "id": "2", "label": "Key theme 2", "children": [{ "id": "2.1", "label": "Detail" }] }
    ]
  }
}
Be insightful and creative. Return ONLY valid JSON.`,
      moodboard: `You are a Design System Expert. Analyze this moodboard image. Extract the visual identity. Return ONLY valid JSON:
{
  "palette": { "background": "#hex", "primary": "#hex", "secondary": "#hex", "accent": "#hex", "text": "#hex" },
  "fontVibe": "serif|sans|handwritten",
  "mood": "Description of the overall mood",
  "suggestions": ["Design suggestion 1", "Design suggestion 2"]
}`,
    };

    const messages: any[] = [
      { role: "system", content: systemPrompts[analysisType] || systemPrompts.categorize },
    ];

    if (imageBase64) {
      messages.push({
        role: "user",
        content: [
          { type: "image_url", image_url: { url: imageBase64.startsWith("data:") ? imageBase64 : `data:image/jpeg;base64,${imageBase64}` } },
          { type: "text", text: prompt || "Analyze this image thoroughly." },
        ],
      });
    } else {
      messages.push({ role: "user", content: prompt || "Analyze this content." });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("AI analyze error:", response.status, t);
      return new Response(JSON.stringify({ error: `AI error: ${response.status}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Try to parse JSON from response
    let parsed = null;
    try {
      const cleaned = content.replace(/```json/g, "").replace(/```/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { raw: content };
    }

    return new Response(JSON.stringify({ result: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
