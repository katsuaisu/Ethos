import { useState } from "react";
import { FileText, Presentation, Table2, Download, Loader2, X, Sparkles, MessageSquare } from "lucide-react";
import { motion } from "framer-motion";
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

  // Ask-the-user flow
  const [askMode, setAskMode] = useState(false);
  const [aiQuestion, setAiQuestion] = useState("");
  const [userAnswer, setUserAnswer] = useState("");
  const [loadingQ, setLoadingQ] = useState(false);
  const [answers, setAnswers] = useState<{ q: string; a: string }[]>([]);

  const boardData = items.map(i => i.content).join("\n- ");

  const askAiQuestion = async () => {
    setLoadingQ(true);
    try {
      const context = answers.map(a => `Q: ${a.q}\nA: ${a.a}`).join("\n");
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({
          messages: [{ role: "user", content: `You are helping convert board content into a ${format}. Board items:\n- ${boardData}\n\n${context ? `Previous answers:\n${context}\n\n` : ""}Ask ONE clarifying question to help produce a better ${format}. Be specific and short. Return ONLY the question text, nothing else.` }],
          mode: "ideation",
        }),
      });
      if (!resp.ok || !resp.body) throw new Error("Failed");
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let full = "", buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, idx); buf = buf.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try { const p = JSON.parse(jsonStr); const c = p.choices?.[0]?.delta?.content; if (c) full += c; } catch {}
        }
      }
      setAiQuestion(full.trim());
    } catch { toast.error("Failed to generate question"); }
    finally { setLoadingQ(false); }
  };

  const submitAnswer = () => {
    if (!userAnswer.trim()) return;
    setAnswers(prev => [...prev, { q: aiQuestion, a: userAnswer }]);
    setAiQuestion("");
    setUserAnswer("");
  };

  const generate = async () => {
    setGenerating(true);
    const answersContext = answers.length > 0 ? `\n\nUser preferences:\n${answers.map(a => `Q: ${a.q}\nA: ${a.a}`).join("\n")}` : "";

    const formatPrompts: Record<OutputFormat, string> = {
      slides: `Convert this board content into a beautifully structured slide presentation outline. For each slide, provide: slide number, title, bullet points, and speaker notes. Make it professional and visually described.\n\nBoard content:\n- ${boardData}${answersContext}\n\n${customPrompt ? `Additional instructions: ${customPrompt}\n\n` : ""}Format as clean markdown with ## for slide titles and bullet points for content.`,
      document: `Convert this board content into a well-formatted ${docStyle} document. ${
        docStyle === "flowchart" ? "Include a text-based flowchart using arrows (→) and boxes." :
        docStyle === "report" ? "Structure with executive summary, sections, and conclusion." :
        docStyle === "outline" ? "Create a hierarchical outline with clear nesting." :
        "Write as a concise business memo."
      }\n\nBoard content:\n- ${boardData}${answersContext}\n\n${customPrompt ? `Additional instructions: ${customPrompt}\n\n` : ""}Format as clean markdown.`,
      sheet: `Convert this board content into a structured table/spreadsheet format. Create columns for: Item, Category, Priority, Status, Notes, Connections.\n\nBoard content:\n- ${boardData}${answersContext}\n\n${customPrompt ? `Additional instructions: ${customPrompt}\n\n` : ""}Format as a markdown table.`,
    };

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({ messages: [{ role: "user", content: formatPrompts[format] }], mode: "ideation" }),
      });
      if (!resp.ok || !resp.body) throw new Error("Failed");
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let full = "", buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, idx); buf = buf.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try { const p = JSON.parse(jsonStr); const c = p.choices?.[0]?.delta?.content; if (c) full += c; } catch {}
        }
      }
      setGeneratedContent(full);
    } catch (e) {
      console.error(e);
      toast.error("Failed to convert");
    } finally { setGenerating(false); }
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
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-foreground/10 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}>
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="glass rounded-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/30">
          <div>
            <h3 className="text-serif text-lg text-foreground">Convert Board</h3>
            <p className="text-xs text-foreground/50">{items.length} elements to convert</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors">
            <X className="w-4 h-4 text-foreground/50" />
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
                      <button key={f.id} onClick={() => setFormat(f.id)}
                        className={`flex flex-col items-center gap-2 p-3 rounded-xl text-xs transition-all ${
                          format === f.id ? "bg-accent/10 text-accent border border-accent/20" : "bg-secondary/50 text-foreground/70 hover:bg-secondary border border-transparent"
                        }`}>
                        <Icon className="w-5 h-5" />
                        <span className="font-medium">{f.label}</span>
                        <span className="text-[9px] text-foreground/40">{f.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Doc style */}
              {format === "document" && (
                <div>
                  <p className="text-xs font-medium text-foreground mb-2">Document Style</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {DOC_STYLES.map(s => (
                      <button key={s.id} onClick={() => setDocStyle(s.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs transition-all ${
                          docStyle === s.id ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground/70 hover:bg-secondary/80"
                        }`}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Ask AI for guidance */}
              <div>
                <button onClick={() => { setAskMode(!askMode); if (!askMode && !aiQuestion) askAiQuestion(); }}
                  className="flex items-center gap-1.5 text-xs text-accent font-medium hover:underline mb-2">
                  <MessageSquare className="w-3 h-3" />
                  {askMode ? "Hide AI guidance" : "Let AI ask you questions first"}
                </button>
                {askMode && (
                  <div className="space-y-2">
                    {answers.map((a, i) => (
                      <div key={i} className="bg-secondary/50 rounded-lg px-3 py-2 text-xs">
                        <p className="text-foreground/50">{a.q}</p>
                        <p className="text-foreground mt-0.5">{a.a}</p>
                      </div>
                    ))}
                    {loadingQ ? (
                      <div className="flex items-center gap-2 text-xs text-foreground/50">
                        <Loader2 className="w-3 h-3 animate-spin" />Thinking...
                      </div>
                    ) : aiQuestion ? (
                      <div className="glass rounded-lg p-3 space-y-2">
                        <p className="text-xs text-foreground font-medium">{aiQuestion}</p>
                        <div className="flex gap-2">
                          <input value={userAnswer} onChange={(e) => setUserAnswer(e.target.value)}
                            placeholder="Your answer..."
                            className="flex-1 bg-transparent border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-accent/40 placeholder:text-foreground/30"
                            onKeyDown={(e) => { if (e.key === "Enter") { submitAnswer(); askAiQuestion(); } }} />
                          <button onClick={() => { submitAnswer(); askAiQuestion(); }} disabled={!userAnswer.trim()}
                            className="px-3 py-1.5 rounded-lg bg-accent text-accent-foreground text-xs font-medium disabled:opacity-40">
                            Next
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              {/* Custom instructions */}
              <div>
                <p className="text-xs font-medium text-foreground mb-2">Additional Instructions (optional)</p>
                <textarea value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="e.g. 'Make it more formal', 'Add metrics section', 'Focus on Q1 goals'"
                  rows={2}
                  className="w-full bg-transparent border border-border rounded-lg p-3 text-sm text-foreground outline-none focus:ring-1 focus:ring-accent/40 resize-none placeholder:text-foreground/30" />
              </div>

              <button onClick={generate} disabled={generating}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50">
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
                      <button onClick={() => downloadAsText("txt")} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-border text-xs text-foreground/60 hover:bg-secondary transition-colors">
                        <Download className="w-3.5 h-3.5" />Text
                      </button>
                    </>
                  )}
                  {format === "document" && (
                    <>
                      <button onClick={() => downloadAsText("md")} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity">
                        <Download className="w-3.5 h-3.5" />Markdown
                      </button>
                      <button onClick={() => downloadAsText("txt")} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-border text-xs text-foreground/60 hover:bg-secondary transition-colors">
                        <Download className="w-3.5 h-3.5" />Text
                      </button>
                    </>
                  )}
                  {format === "sheet" && (
                    <>
                      <button onClick={() => downloadAsText("csv")} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity">
                        <Download className="w-3.5 h-3.5" />CSV
                      </button>
                      <button onClick={() => downloadAsText("md")} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-border text-xs text-foreground/60 hover:bg-secondary transition-colors">
                        <Download className="w-3.5 h-3.5" />Markdown
                      </button>
                    </>
                  )}
                </div>
              </div>

              <button onClick={() => { setGeneratedContent(null); setAnswers([]); }}
                className="w-full py-2 rounded-xl border border-border text-sm text-foreground/60 hover:bg-secondary transition-colors">
                Convert Again
              </button>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
