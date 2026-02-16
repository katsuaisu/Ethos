import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-miro-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MIRO_API = "https://api.miro.com/v2";

// Map hex colors to Miro's named colors
// Valid Miro named colors for sticky notes
const VALID_NAMED_COLORS = ["gray", "light_yellow", "yellow", "orange", "light_green", "green", "dark_green", "cyan", "light_pink", "pink", "violet", "red", "light_blue", "blue", "dark_blue", "black"];

// For sticky notes: must use named colors
// For shapes: must use hex colors
function toStickyColor(color?: string): string {
  if (!color) return "light_yellow";
  // Already a valid named color
  if (VALID_NAMED_COLORS.includes(color)) return color;
  // Not a named color — default
  return "light_yellow";
}

function toShapeColor(color?: string): string {
  if (!color) return "#FFF9DB";
  // If it's a hex color, use it directly
  if (color.startsWith("#") && (color.length === 7 || color.length === 4)) return color;
  // Named color → convert to hex for shapes
  const namedToHex: Record<string, string> = {
    light_yellow: "#FFF9DB", yellow: "#F5D128", orange: "#F24726",
    light_green: "#D5F692", green: "#93D275", dark_green: "#1A7A3F",
    cyan: "#6CD8CE", light_pink: "#F5B8C4", pink: "#F16C7F",
    violet: "#B384BB", red: "#E6282B", light_blue: "#A6CCF5",
    blue: "#2D9BF0", dark_blue: "#2850A8", black: "#1A1A2E", gray: "#E6E6E6",
  };
  return namedToHex[color] || "#FFF9DB";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Support user-provided token via header, fall back to env
    const userToken = req.headers.get("x-miro-token");
    const MIRO_ACCESS_TOKEN = userToken || Deno.env.get("MIRO_ACCESS_TOKEN");
    if (!MIRO_ACCESS_TOKEN) throw new Error("MIRO_ACCESS_TOKEN is not configured");

    const body = await req.json();
    const { action, boardId, items, code, redirectUri } = body;

    // OAuth token exchange
    if (action === "oauth-exchange") {
      if (!code) throw new Error("Authorization code required");
      const clientId = Deno.env.get("MIRO_CLIENT_ID");
      const clientSecret = Deno.env.get("MIRO_CLIENT_SECRET");
      if (!clientId || !clientSecret) throw new Error("Miro OAuth not configured");

      const tokenRes = await fetch("https://api.miro.com/v1/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri || "",
        }),
      });

      if (!tokenRes.ok) {
        const t = await tokenRes.text();
        console.error("OAuth exchange failed:", tokenRes.status, t);
        throw new Error(`OAuth exchange failed: ${tokenRes.status}`);
      }

      const tokenData = await tokenRes.json();
      return new Response(JSON.stringify({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        team_id: tokenData.team_id,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get client ID for OAuth redirect
    if (action === "get-client-id") {
      const clientId = Deno.env.get("MIRO_CLIENT_ID");
      return new Response(JSON.stringify({ clientId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
      console.log(`Pushing ${items.length} items to board ${boardId}`);
      for (const item of items) {
        const isShape = item.type === "shape";
        const bodyPayload: any = {
          data: { content: item.content || "" },
          position: { x: item.x || 0, y: item.y || 0 },
        };

        if (isShape) {
          bodyPayload.style = { fillColor: toShapeColor(item.color) };
          bodyPayload.shape = "rectangle";
          if (item.width) bodyPayload.geometry = { width: item.width, height: item.height || item.width };
        } else {
          bodyPayload.style = { fillColor: toStickyColor(item.color) };
          if (item.width) bodyPayload.geometry = { width: item.width };
        }

        const endpoint = isShape
          ? `${MIRO_API}/boards/${boardId}/shapes`
          : `${MIRO_API}/boards/${boardId}/sticky_notes`;

        console.log(`Creating ${isShape ? "shape" : "sticky"}: "${(item.content || "").slice(0, 30)}" color=${isShape ? toShapeColor(item.color) : toStickyColor(item.color)}`);
        const res = await fetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(bodyPayload),
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
