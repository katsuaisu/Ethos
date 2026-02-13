import { useState, useCallback } from "react";
import { Loader2, Sparkles, Eye, Layout } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`;

interface LayoutItem {
  content: string;
  x: number;
  y: number;
  type: string;
  color?: string;
}

interface PreviewProps {
  onPushToMiro?: (items: LayoutItem[]) => void;
}

export default function InteractivePreview({ onPushToMiro }: PreviewProps) {
  const [input, setInput] = useState("");
  const [items, setItems] = useState<LayoutItem[]>([]);
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState("");
  const [layoutType, setLayoutType] = useState<"grid" | "mindmap" | "timeline">("grid");

  const generate = useCallback(async () => {
    if (!input.trim()) return;
    setGenerating(true);
    setStatus("Crystallizing thoughts...");

    try {
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
              content: `Layout type: ${layoutType}. Content to organize:\n\n${input}\n\nGenerate a ${layoutType} layout. Return ONLY a JSON array.`,
            },
          ],
          mode: "layout",
        }),
      });

      if (!resp.ok || !resp.body) throw new Error("Failed");

      // Collect full response
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

      // Parse layout items
      const cleaned = full.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      setItems(Array.isArray(parsed) ? parsed : []);
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
    { value: "mindmap" as const, label: "Mindmap", icon: Sparkles },
    { value: "timeline" as const, label: "Timeline", icon: Eye },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Input area */}
      <div className="px-4 py-3 space-y-3 border-b border-border">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Brain dump your ideas here... URLs, notes, anything."
          rows={4}
          className="w-full bg-transparent border border-border rounded-xl p-3 text-sm outline-none focus:ring-1 focus:ring-accent/40 resize-none placeholder:text-muted-foreground/50"
          style={{ fontFamily: "'Inter', sans-serif" }}
        />

        {/* Layout type selector */}
        <div className="flex gap-1.5">
          {layoutOptions.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setLayoutType(value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all ${
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
          className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          {generating ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span className="animate-pulse-slow">{status}</span>
            </>
          ) : (
            <>
              <Eye className="w-3.5 h-3.5" />
              Preview Layout
            </>
          )}
        </button>
      </div>

      {/* Preview canvas */}
      <div className="flex-1 overflow-auto p-4">
        <AnimatePresence mode="wait">
          {items.length > 0 ? (
            <motion.div
              key="preview"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-3"
            >
              {/* Visual preview */}
              <div className="glass rounded-xl p-4 min-h-[300px] relative overflow-hidden">
                <div className="relative" style={{ minHeight: 400 }}>
                  {items.map((item, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.08 }}
                      className="absolute rounded-lg p-3 text-xs leading-relaxed shadow-sm border border-border/50"
                      style={{
                        left: `${((item.x || 0) / 1200) * 100}%`,
                        top: `${((item.y || 0) / 800) * 100}%`,
                        backgroundColor: item.color || "hsl(var(--secondary))",
                        maxWidth: "180px",
                      }}
                    >
                      {item.content}
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => onPushToMiro?.(items)}
                  className="flex-1 py-2.5 rounded-xl bg-accent text-accent-foreground text-sm font-medium flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                >
                  Push to Miro
                </button>
                <button
                  onClick={generate}
                  className="px-4 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:bg-secondary transition-colors"
                >
                  Regenerate
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-full text-center py-12"
            >
              <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-4">
                <Layout className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                Preview will appear here
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Brain dump above, then preview before committing
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
