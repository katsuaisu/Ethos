import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MIRO_API = "https://api.miro.com/v2";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const MIRO_ACCESS_TOKEN = Deno.env.get("MIRO_ACCESS_TOKEN");
    if (!MIRO_ACCESS_TOKEN) throw new Error("MIRO_ACCESS_TOKEN is not configured");

    const { action, boardId, items } = await req.json();
    const headers = {
      Authorization: `Bearer ${MIRO_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    };

    if (action === "get-boards") {
      const res = await fetch(`${MIRO_API}/boards`, { headers });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Miro boards fetch failed [${res.status}]: ${t}`);
      }
      const data = await res.json();
      return new Response(JSON.stringify({ boards: data.data || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get-items") {
      if (!boardId) throw new Error("boardId required");
      const res = await fetch(`${MIRO_API}/boards/${boardId}/items?limit=50`, { headers });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Miro items fetch failed [${res.status}]: ${t}`);
      }
      const data = await res.json();
      return new Response(JSON.stringify({ items: data.data || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "push-items") {
      if (!boardId || !items?.length) throw new Error("boardId and items required");
      const results = [];
      for (const item of items) {
        const body: any = {
          data: { content: item.content || "" },
          position: { x: item.x || 0, y: item.y || 0 },
        };
        if (item.color) {
          body.style = { fillColor: item.color };
        }
        if (item.width) body.geometry = { width: item.width };

        const endpoint = item.type === "shape"
          ? `${MIRO_API}/boards/${boardId}/shapes`
          : `${MIRO_API}/boards/${boardId}/sticky_notes`;

        const res = await fetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const t = await res.text();
          console.error(`Miro push item failed [${res.status}]: ${t}`);
          results.push({ error: t, item });
        } else {
          results.push(await res.json());
        }
      }
      return new Response(JSON.stringify({ results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("miro-sync error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
