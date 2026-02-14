import { useState } from "react";
import { FileText, Presentation, Table2, Download, Loader2, X, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`;

interface ConvertDialogProps {
  items: { content: string; type: string; color?: string; connectedTo?: number[] }[];
  onClose: () => void;
}

type OutputFormat = "slides" | "document" | "sheet";
type DocStyle = "flowchart" | "report" | "outline" | "memo";

const OUTPUT_FORMATS = [
  { id: "slides" as const, label: "Slides", desc: "AI-designed presentation", icon: Presentation },
  { id: "document" as const, label: "Document", desc: "Formatted document", icon: FileText },
  { id: "sheet" as const, label: "Sheet", desc: "Structured spreadsheet", icon: Table2 },
];

const DOC_STYLES: { id: DocStyle; label: string }[] = [
  { id: "flowchart", label: "Flowchart Doc" },
  { id: "report", label: "Report" },
  { id: "outline", label: "Outline" },
  { id: "memo", label: "Memo" },
];

export default function ConvertDialog({ items, onClose }: ConvertDialogProps) {
  const [format, setFormat] = useState<OutputFormat>("slides");
  const [docStyle, setDocStyle] = useState<DocStyle>("report");
  const [customPrompt, setCustomPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<string | null>(null);

  const generate = async () => {
    setGenerating(true);
    const boardData = items.map(i => i.content).join("\n- ");

    const formatPrompts: Record<OutputFormat, string> = {
      slides: `Convert this board content into a beautifully structured slide presentation outline. For each slide, provide: slide number, title, bullet points, and speaker notes. Make it professional and visually described.\n\nBoard content:\n- ${boardData}\n\n${customPrompt ? `Additional instructions: ${customPrompt}\n\n` : ""}Format as clean markdown with ## for slide titles and bullet points for content.`,
      document: `Convert this board content into a well-formatted ${docStyle} document. ${
        docStyle === "flowchart" ? "Include a text-based flowchart using arrows (→) and boxes." :
        docStyle === "report" ? "Structure with executive summary, sections, and conclusion." :
        docStyle === "outline" ? "Create a hierarchical outline with clear nesting." :
        "Write as a concise business memo."
      }\n\nBoard content:\n- ${boardData}\n\n${customPrompt ? `Additional instructions: ${customPrompt}\n\n` : ""}Format as clean markdown.`,
      sheet: `Convert this board content into a structured table/spreadsheet format. Create columns for: Item, Category, Priority, Status, Notes, Connections.\n\nBoard content:\n- ${boardData}\n\n${customPrompt ? `Additional instructions: ${customPrompt}\n\n` : ""}Format as a markdown table.`,
    };

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: formatPrompts[format] }],
          mode: "ideation",
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

      setGeneratedContent(full);
    } catch (e) {
      console.error(e);
      toast.error("Failed to convert");
    } finally {
      setGenerating(false);
    }
  };

  const downloadAsText = (ext: string) => {
    if (!generatedContent) return;
    const blob = new Blob([generatedContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `board-export.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded as .${ext}`);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-primary/20 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="glass rounded-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/30">
          <div>
            <h3 className="text-serif text-lg">Convert Board</h3>
            <p className="text-xs text-muted-foreground">{items.length} elements to convert</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {!generatedContent ? (
            <>
              {/* Format selection */}
              <div>
                <p className="text-xs font-medium text-foreground mb-2">Output Format</p>
                <div className="grid grid-cols-3 gap-2">
                  {OUTPUT_FORMATS.map(f => {
                    const Icon = f.icon;
                    return (
                      <button
                        key={f.id}
                        onClick={() => setFormat(f.id)}
                        className={`flex flex-col items-center gap-2 p-3 rounded-xl text-xs transition-all ${
                          format === f.id
                            ? "bg-accent/10 text-accent border border-accent/20"
                            : "bg-secondary/50 text-secondary-foreground hover:bg-secondary border border-transparent"
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                        <span className="font-medium">{f.label}</span>
                        <span className="text-[9px] text-muted-foreground">{f.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Doc style for documents */}
              {format === "document" && (
                <div>
                  <p className="text-xs font-medium text-foreground mb-2">Document Style</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {DOC_STYLES.map(s => (
                      <button
                        key={s.id}
                        onClick={() => setDocStyle(s.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs transition-all ${
                          docStyle === s.id ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Custom instructions */}
              <div>
                <p className="text-xs font-medium text-foreground mb-2">Additional Instructions (optional)</p>
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="e.g. 'Make it more formal', 'Add metrics section', 'Focus on Q1 goals'"
                  rows={2}
                  className="w-full bg-transparent border border-border rounded-lg p-3 text-sm outline-none focus:ring-1 focus:ring-accent/40 resize-none placeholder:text-muted-foreground/50"
                />
              </div>

              <button
                onClick={generate}
                disabled={generating}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {generating ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /><span className="animate-pulse-slow">Converting...</span></>
                ) : (
                  <><Sparkles className="w-4 h-4" />Convert</>
                )}
              </button>
            </>
          ) : (
            <>
              {/* Generated content preview */}
              <div className="glass rounded-xl p-4 max-h-[300px] overflow-y-auto scrollbar-thin">
                <pre className="text-xs text-foreground whitespace-pre-wrap leading-relaxed font-sans">{generatedContent}</pre>
              </div>

              {/* Download options */}
              <div>
                <p className="text-xs font-medium text-foreground mb-2">Download As</p>
                <div className="flex gap-2">
                  {format === "slides" && (
                    <>
                      <button onClick={() => downloadAsText("md")} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity">
                        <Download className="w-3.5 h-3.5" />Markdown
                      </button>
                      <button onClick={() => downloadAsText("txt")} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-border text-xs text-muted-foreground hover:bg-secondary transition-colors">
                        <Download className="w-3.5 h-3.5" />Text
                      </button>
                    </>
                  )}
                  {format === "document" && (
                    <>
                      <button onClick={() => downloadAsText("md")} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity">
                        <Download className="w-3.5 h-3.5" />Markdown
                      </button>
                      <button onClick={() => downloadAsText("txt")} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-border text-xs text-muted-foreground hover:bg-secondary transition-colors">
                        <Download className="w-3.5 h-3.5" />Text
                      </button>
                    </>
                  )}
                  {format === "sheet" && (
                    <>
                      <button onClick={() => downloadAsText("csv")} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity">
                        <Download className="w-3.5 h-3.5" />CSV
                      </button>
                      <button onClick={() => downloadAsText("md")} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-border text-xs text-muted-foreground hover:bg-secondary transition-colors">
                        <Download className="w-3.5 h-3.5" />Markdown
                      </button>
                    </>
                  )}
                </div>
              </div>

              <button
                onClick={() => setGeneratedContent(null)}
                className="w-full py-2 rounded-xl border border-border text-sm text-muted-foreground hover:bg-secondary transition-colors"
              >
                Convert Again
              </button>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
