import { useState, useCallback, useEffect } from "react";
import { Loader2, Sparkles, Layout, GitBranch, Clock, RotateCcw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`;
const STORAGE_KEY = "ethos-preview-history";

interface LayoutItem {
  content: string;
  x: number;
  y: number;
  type: string;
  color?: string;
}

interface PreviewEntry {
  id: string;
  input: string;
  items: LayoutItem[];
  layoutType: string;
  date: string;
}

interface PreviewProps {
  onPushToMiro?: (items: LayoutItem[]) => void;
}

function loadHistory(): PreviewEntry[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch { return []; }
}

export default function InteractivePreview({ onPushToMiro }: PreviewProps) {
  const [input, setInput] = useState("");
  const [items, setItems] = useState<LayoutItem[]>([]);
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState("");
  const [layoutType, setLayoutType] = useState<"grid" | "mindmap" | "timeline">("grid");
  const [history, setHistory] = useState<PreviewEntry[]>(loadHistory);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, 10)));
  }, [history]);

  const generate = useCallback(async () => {
    if (!input.trim()) return;
    setGenerating(true);
    setStatus("Crystallizing thoughts...");

    try {
      const layoutPrompts: Record<string, string> = {
        grid: `Organize these ideas into a clean grid layout. Return ONLY a JSON array where each item has:
{"content": "text", "x": number, "y": number, "type": "sticky_note", "color": "#hex"}
Use 300px spacing. Use soft warm pastels (#FFF9DB, #E8F5E9, #FDE8E8, #E3F2FD, #F3E5F5). Max 12 items. Group related ideas together.`,
        mindmap: `Create a mindmap layout from these ideas. Return ONLY a JSON array where:
- The central topic is at x:600, y:300 with type "central"
- Main branches radiate outward at x values 200-1000, y values 100-500
- Sub-items are near their parent branches
Each: {"content": "text", "x": number, "y": number, "type": "branch"|"central"|"leaf", "color": "#hex"}
Use warm tones: central=#1A1A1A, branches=#E8825B (accent), leaves=#F5F0EB. Max 15 items.`,
        timeline: `Organize these ideas into a horizontal timeline layout. Return ONLY a JSON array where:
- Items flow left to right with x starting at 50 and incrementing by 280
- y values alternate between 50 and 200 for visual interest
Each: {"content": "text", "x": number, "y": number, "type": "milestone"|"event", "color": "#hex"}
Use soft palette. Max 10 items. Add brief descriptive content.`,
      };

      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content: `${layoutPrompts[layoutType]}\n\nContent to organize:\n\n${input}`,
            },
          ],
          mode: "layout",
        }),
      });

      if (!resp.ok || !resp.body) throw new Error("Failed");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let full = "";
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, idx);
          buf = buf.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const p = JSON.parse(jsonStr);
            const c = p.choices?.[0]?.delta?.content;
            if (c) full += c;
          } catch {}
        }
      }

      const cleaned = full.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      const newItems = Array.isArray(parsed) ? parsed : [];
      setItems(newItems);

      if (newItems.length > 0) {
        const entry: PreviewEntry = {
          id: Date.now().toString(),
          input: input.slice(0, 100),
          items: newItems,
          layoutType,
          date: new Date().toISOString(),
        };
        setHistory(prev => [entry, ...prev]);
      }

      setStatus("");
    } catch (e) {
      console.error(e);
      setStatus("Generation failed. Try again.");
    } finally {
      setGenerating(false);
    }
  }, [input, layoutType]);

  const layoutOptions = [
    { value: "grid" as const, label: "Grid", icon: Layout },
    { value: "mindmap" as const, label: "Mindmap", icon: GitBranch },
    { value: "timeline" as const, label: "Timeline", icon: Clock },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Input area */}
      <div className="px-4 py-3 space-y-3 border-b border-border/50 shrink-0">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Brain dump your ideas here... URLs, notes, anything."
          rows={3}
          className="w-full bg-transparent border border-border rounded-xl p-3 text-sm outline-none focus:ring-1 focus:ring-accent/40 resize-none placeholder:text-muted-foreground/50"
        />

        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {layoutOptions.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setLayoutType(value)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all ${
                  layoutType === value
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
              >
                <Icon className="w-3 h-3" />
                {label}
              </button>
            ))}
          </div>

          <button
            onClick={generate}
            disabled={generating || !input.trim()}
            className="ml-auto px-4 py-1.5 rounded-lg bg-accent text-accent-foreground text-xs font-medium flex items-center gap-1.5 hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {generating ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                <span className="animate-pulse-slow">{status || "Generating..."}</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3 h-3" />
                Generate
              </>
            )}
          </button>
        </div>
      </div>

      {/* Preview canvas */}
      <div className="flex-1 overflow-auto p-4" style={{ minHeight: 0 }}>
        <AnimatePresence mode="wait">
          {items.length > 0 ? (
            <motion.div
              key="preview"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-3"
            >
              {/* Board visualization */}
              <div className="glass rounded-xl p-4 overflow-auto">
                {layoutType === "mindmap" ? (
                  <MindmapBoard items={items} />
                ) : layoutType === "timeline" ? (
                  <TimelineBoard items={items} />
                ) : (
                  <GridBoard items={items} />
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => onPushToMiro?.(items)}
                  className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-medium flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                >
                  Push to Miro
                </button>
                <button
                  onClick={generate}
                  className="px-3 py-2 rounded-xl border border-border text-xs text-muted-foreground hover:bg-secondary transition-colors flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3 h-3" />
                  Redo
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-full text-center py-8"
            >
              <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-4">
                <Layout className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">Preview will appear here</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Brain dump above, then preview before committing</p>

              {/* History */}
              {history.length > 0 && (
                <div className="mt-6 w-full max-w-xs">
                  <h5 className="text-serif text-xs text-muted-foreground mb-2">Recent Previews</h5>
                  <div className="space-y-1.5">
                    {history.slice(0, 3).map((entry) => (
                      <button
                        key={entry.id}
                        onClick={() => { setItems(entry.items); setLayoutType(entry.layoutType as any); }}
                        className="w-full text-left p-2.5 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors text-xs"
                      >
                        <span className="text-foreground truncate block">{entry.input}</span>
                        <span className="text-muted-foreground/60 capitalize">{entry.layoutType}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ── Board renderers ── */

function GridBoard({ items }: { items: LayoutItem[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {items.map((item, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.06 }}
          className="rounded-xl p-3 text-xs leading-relaxed shadow-sm border border-border/30"
          style={{ backgroundColor: item.color || "hsl(var(--secondary))" }}
        >
          {item.content}
        </motion.div>
      ))}
    </div>
  );
}

function MindmapBoard({ items }: { items: LayoutItem[] }) {
  const central = items.find(i => i.type === "central");
  const branches = items.filter(i => i.type === "branch");
  const leaves = items.filter(i => i.type === "leaf");

  return (
    <div className="relative min-h-[350px]">
      {/* Central node */}
      {central && (
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10"
        >
          <div className="bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-medium shadow-lg max-w-[160px] text-center">
            {central.content}
          </div>
        </motion.div>
      )}

      {/* Branches */}
      {branches.map((item, i) => {
        const angle = (i / branches.length) * 2 * Math.PI - Math.PI / 2;
        const radius = 130;
        const x = 50 + Math.cos(angle) * (radius / 4);
        const y = 50 + Math.sin(angle) * (radius / 3.5);

        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 + i * 0.08 }}
            className="absolute z-5"
            style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)" }}
          >
            <div
              className="px-3 py-1.5 rounded-lg text-xs shadow-sm border border-border/30 max-w-[140px] text-center"
              style={{ backgroundColor: item.color || "hsl(24 80% 55% / 0.15)" }}
            >
              {item.content}
            </div>
          </motion.div>
        );
      })}

      {/* Leaves */}
      {leaves.map((item, i) => {
        const angle = (i / Math.max(leaves.length, 1)) * 2 * Math.PI;
        const radius = 170;
        const x = 50 + Math.cos(angle) * (radius / 3.5);
        const y = 50 + Math.sin(angle) * (radius / 3);

        return (
          <motion.div
            key={`leaf-${i}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 + i * 0.05 }}
            className="absolute"
            style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)" }}
          >
            <div
              className="px-2.5 py-1 rounded-md text-[11px] border border-border/20 max-w-[120px] text-center text-muted-foreground"
              style={{ backgroundColor: item.color || "hsl(var(--secondary))" }}
            >
              {item.content}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

function TimelineBoard({ items }: { items: LayoutItem[] }) {
  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute top-6 left-0 right-0 h-px bg-border" />

      <div className="flex gap-4 overflow-x-auto pb-4 pt-2">
        {items.map((item, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="flex flex-col items-center shrink-0"
            style={{ minWidth: 140 }}
          >
            {/* Dot on timeline */}
            <div className="w-3 h-3 rounded-full bg-accent border-2 border-background z-10 mb-3" />
            {/* Card */}
            <div
              className={`rounded-xl p-3 text-xs leading-relaxed shadow-sm border border-border/30 max-w-[160px] text-center ${
                i % 2 === 0 ? "" : "mt-8"
              }`}
              style={{ backgroundColor: item.color || "hsl(var(--secondary))" }}
            >
              {item.content}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
