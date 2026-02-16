import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-miro-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MIRO_API = "https://api.miro.com/v2";

const VALID_NAMED_COLORS = ["gray", "light_yellow", "yellow", "orange", "light_green", "green", "dark_green", "cyan", "light_pink", "pink", "violet", "red", "light_blue", "blue", "dark_blue", "black"];

function toStickyColor(color?: string): string {
  if (!color) return "light_yellow";
  if (VALID_NAMED_COLORS.includes(color)) return color;
  return "light_yellow";
}

function toShapeColor(color?: string): string {
  if (!color) return "#FFF9DB";
  if (color.startsWith("#") && (color.length === 7 || color.length === 4)) return color;
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
    const userToken = req.headers.get("x-miro-token");
    const MIRO_ACCESS_TOKEN = userToken || Deno.env.get("MIRO_ACCESS_TOKEN");
    if (!MIRO_ACCESS_TOKEN) throw new Error("MIRO_ACCESS_TOKEN is not configured");

    const body = await req.json();
    const { action, boardId, items, connections, code, redirectUri } = body;

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
      const nodeResults = [];
      const miroIdMap: Record<number, string> = {}; // index -> miro ID
      
      console.log(`Pushing ${items.length} items to board ${boardId}`);
      
      // Step 1: Create all nodes first
      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
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

        console.log(`Creating ${isShape ? "shape" : "sticky"} [${idx}]: "${(item.content || "").slice(0, 30)}" color=${isShape ? toShapeColor(item.color) : toStickyColor(item.color)}`);
        const res = await fetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(bodyPayload),
        });
        if (!res.ok) {
          const t = await res.text();
          console.error(`Miro push item failed [${res.status}]: ${t}`);
          nodeResults.push({ error: t, item, index: idx });
        } else {
          const created = await res.json();
          miroIdMap[idx] = created.id;
          nodeResults.push({ ...created, index: idx });
        }
      }

      // Step 2: Create connectors using the miroId map
      const connectorResults = [];
      if (connections && connections.length > 0) {
        console.log(`Creating ${connections.length} connectors`);
        for (const conn of connections) {
          const [fromIdx, toIdx] = conn;
          const startMiroId = miroIdMap[fromIdx];
          const endMiroId = miroIdMap[toIdx];
          
          if (!startMiroId || !endMiroId) {
            console.warn(`Skipping connector ${fromIdx}->${toIdx}: missing Miro ID (start=${startMiroId}, end=${endMiroId})`);
            connectorResults.push({ error: `Missing node for connector ${fromIdx}->${toIdx}`, conn });
            continue;
          }

          const connectorPayload = {
            startItem: { id: startMiroId },
            endItem: { id: endMiroId },
            style: {
              strokeColor: "#4262FF",
              strokeWidth: "1.5",
            },
            shape: "curved",
          };

          console.log(`Creating connector: ${fromIdx}(${startMiroId}) -> ${toIdx}(${endMiroId})`);
          const res = await fetch(`${MIRO_API}/boards/${boardId}/connectors`, {
            method: "POST",
            headers,
            body: JSON.stringify(connectorPayload),
          });
          if (!res.ok) {
            const t = await res.text();
            console.error(`Miro connector failed [${res.status}]: ${t}`);
            connectorResults.push({ error: t, conn });
          } else {
            connectorResults.push(await res.json());
          }
        }
      }

      return new Response(JSON.stringify({ 
        results: nodeResults, 
        connectorResults,
        idMap: miroIdMap,
      }), {
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
