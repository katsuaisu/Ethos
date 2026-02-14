import { useState, useRef, useCallback, useEffect } from "react";
import { Upload, Loader2, X, Sparkles, Palette, ScanSearch, FileText, Trash2, Search, Wand2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

const ANALYZE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-analyze`;
const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`;
const STORAGE_KEY = "ethos-scan-history";

interface MindmapNode {
  id: string;
  label: string;
  children?: MindmapNode[];
}

interface AnalysisResult {
  title?: string;
  category?: string;
  tags?: string[];
  description?: string;
  insights?: string[];
  suggestedLayout?: string;
  mindmap?: { title: string; nodes: MindmapNode[] };
  palette?: { background?: string; primary?: string; secondary?: string; accent?: string; text?: string };
  fontVibe?: string;
  mood?: string;
  suggestions?: string[];
  raw?: string;
}

interface ScanEntry {
  id: string;
  preview: string;
  result: AnalysisResult;
  mode: "categorize" | "moodboard" | "palette-prompt";
  date: string;
  fileName?: string;
  fileType?: string;
}

function loadHistory(): ScanEntry[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch { return []; }
}

// Accepted file types
const ACCEPTED_TYPES = "image/*,.pdf,.pptx,.ppt,.docx,.doc,.txt,.md,.csv";

export default function ScanPanel({ onMindmapGenerated, onPaletteExtracted }: { onMindmapGenerated?: (data: any) => void; onPaletteExtracted?: (palette: Record<string, string>) => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileType, setFileType] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [status, setStatus] = useState("");
  const [mode, setMode] = useState<"categorize" | "moodboard" | "palette-prompt">("categorize");
  const [history, setHistory] = useState<ScanEntry[]>(loadHistory);
  const [searchQuery, setSearchQuery] = useState("");
  const [palettePrompt, setPalettePrompt] = useState("");
  const [generatingPalette, setGeneratingPalette] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, 50)));
  }, [history]);

  const handleFile = useCallback((file: File) => {
    setFileName(file.name);
    setFileType(file.type);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);
    setResult(null);
    if (mode === "palette-prompt") setMode("categorize");
  }, [mode]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const isImage = fileType.startsWith("image/");

  const analyze = async () => {
    if (!preview) return;
    setAnalyzing(true);
    setStatus(mode === "moodboard" ? "Extracting aesthetics..." : "Scanning file...");

    try {
      const res = await fetch(ANALYZE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          imageBase64: isImage ? preview : undefined,
          fileName,
          fileContent: !isImage ? preview : undefined,
          analysisType: mode,
          prompt: mode === "moodboard"
            ? "Extract the visual identity from this moodboard. Identify color palette (hex), font style, mood, and design suggestions."
            : `Analyze this ${isImage ? "image" : "document"} thoroughly. Extract key themes, generate a detailed mindmap structure, and suggest how this could be organized on a board.`,
        }),
      });

      const data = await res.json();
      if (data.result) {
        setResult(data.result);
        if (data.result.palette && onPaletteExtracted) onPaletteExtracted(data.result.palette);
        if (data.result.mindmap && onMindmapGenerated) onMindmapGenerated(data.result.mindmap);
        const entry: ScanEntry = {
          id: Date.now().toString(),
          preview: isImage ? preview.slice(0, 200) : "",
          result: data.result,
          mode,
          date: new Date().toISOString(),
          fileName,
          fileType,
        };
        setHistory(prev => [entry, ...prev]);
      }
      setStatus("");
    } catch (e) {
      console.error(e);
      setStatus("Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  const generatePaletteFromPrompt = async () => {
    if (!palettePrompt.trim()) return;
    setGeneratingPalette(true);
    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: [{
            role: "user",
            content: `Generate a design color palette based on this description: "${palettePrompt}"\n\nReturn ONLY valid JSON:\n{"palette": {"background": "#hex", "primary": "#hex", "secondary": "#hex", "accent": "#hex", "text": "#hex"}, "fontVibe": "serif|sans|handwritten", "mood": "description of mood", "suggestions": ["suggestion 1", "suggestion 2", "suggestion 3"]}`
          }],
          mode: "ideation",
        }),
      });

      if (!resp.ok || !resp.body) throw new Error("Failed");

      // Read SSE stream
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
      if (parsed) {
        setResult(parsed);
        if (parsed.palette && onPaletteExtracted) onPaletteExtracted(parsed.palette);
        const entry: ScanEntry = {
          id: Date.now().toString(),
          preview: "",
          result: parsed,
          mode: "palette-prompt",
          date: new Date().toISOString(),
          fileName: palettePrompt.slice(0, 40),
        };
        setHistory(prev => [entry, ...prev]);
        toast.success("Palette generated!");
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to generate palette");
    } finally {
      setGeneratingPalette(false);
    }
  };

  const clear = () => {
    setPreview(null);
    setResult(null);
    setStatus("");
    setFileName("");
    setFileType("");
  };

  const deleteEntry = (id: string) => {
    setHistory(prev => prev.filter(e => e.id !== id));
  };

  const clearHistory = () => {
    setHistory([]);
    toast.success("History cleared");
  };

  const filteredHistory = searchQuery
    ? history.filter(e =>
        (e.result.title || e.result.mood || e.fileName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.mode.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : history;

  const modeLabel = (m: string) => m === "categorize" ? "Analyze" : m === "moodboard" ? "Moodboard" : "Prompt";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto overscroll-contain scrollbar-thin px-4 py-3" style={{ minHeight: 0, WebkitOverflowScrolling: "touch" }}>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED_TYPES}
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />

        {/* Mode selector */}
        <div className="flex gap-1.5 mb-4">
          <button
            onClick={() => setMode("categorize")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all ${
              mode === "categorize" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            <ScanSearch className="w-3 h-3" />
            Analyze
          </button>
          <button
            onClick={() => setMode("moodboard")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all ${
              mode === "moodboard" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            <Palette className="w-3 h-3" />
            Moodboard
          </button>
          <button
            onClick={() => { setMode("palette-prompt"); clear(); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all ${
              mode === "palette-prompt" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            <Wand2 className="w-3 h-3" />
            Generate
          </button>
        </div>

        {/* Palette from prompt mode */}
        {mode === "palette-prompt" && !result && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <div className="glass rounded-xl p-5 text-center">
              <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-3">
                <Wand2 className="w-5 h-5 text-accent" />
              </div>
              <h4 className="text-serif text-lg mb-1">Generate Palette</h4>
              <p className="text-xs text-muted-foreground mb-4">Describe a mood, brand, or aesthetic and AI will create a color palette</p>
              <textarea
                value={palettePrompt}
                onChange={(e) => setPalettePrompt(e.target.value)}
                placeholder="e.g. 'Warm minimalist coffee shop', 'Futuristic tech startup with neon accents', 'Earthy organic wellness brand'"
                rows={3}
                className="w-full bg-transparent border border-border rounded-lg p-3 text-sm outline-none focus:ring-1 focus:ring-accent/40 resize-none placeholder:text-muted-foreground/50 mb-3"
              />
              <button
                onClick={generatePaletteFromPrompt}
                disabled={!palettePrompt.trim() || generatingPalette}
                className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {generatingPalette ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span className="animate-pulse-slow">Generating...</span></>
                ) : (
                  <><Sparkles className="w-3.5 h-3.5" />Generate Palette</>
                )}
              </button>
            </div>
          </motion.div>
        )}

        {/* File upload area */}
        {mode !== "palette-prompt" && !preview ? (
          <>
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-accent/40 hover:bg-accent/5 transition-all min-h-[180px]"
            >
              <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center">
                <Upload className="w-5 h-5 text-accent" />
              </div>
              <p className="text-sm text-muted-foreground text-center">
                Drop a file or click to upload
              </p>
              <p className="text-xs text-muted-foreground/60 text-center">
                {mode === "moodboard" ? "Images — extract colors, fonts & mood" : "Images, PDFs, PPTX, DOCX, and more"}
              </p>
              <div className="flex gap-1.5 mt-1">
                {["IMG", "PDF", "PPTX", "DOCX"].map(t => (
                  <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{t}</span>
                ))}
              </div>
            </motion.div>

            {/* History */}
            {history.length > 0 && (
              <div className="mt-5">
                <div className="flex items-center justify-between mb-2">
                  <h5 className="text-serif text-sm text-muted-foreground">Recent Scans</h5>
                  <button onClick={clearHistory} className="text-xs text-muted-foreground/60 hover:text-foreground transition-colors">
                    Clear All
                  </button>
                </div>
                {history.length > 3 && (
                  <div className="relative mb-2">
                    <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
                    <input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search scans..."
                      className="w-full bg-secondary/50 border-none rounded-lg pl-7 pr-3 py-1.5 text-xs outline-none placeholder:text-muted-foreground/40"
                    />
                  </div>
                )}
                <div className="space-y-1.5 max-h-[300px] overflow-y-auto scrollbar-thin">
                  {filteredHistory.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center gap-2 p-2.5 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors group"
                    >
                      <button
                        onClick={() => { setResult(entry.result); setMode(entry.mode); }}
                        className="flex-1 text-left min-w-0"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-md bg-accent/10 flex items-center justify-center shrink-0">
                            {entry.mode === "palette-prompt" ? <Wand2 className="w-3 h-3 text-accent" /> :
                             entry.mode === "moodboard" ? <Palette className="w-3 h-3 text-accent" /> :
                             entry.fileType?.startsWith("image/") ? <ScanSearch className="w-3 h-3 text-accent" /> :
                             <FileText className="w-3 h-3 text-accent" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="text-xs font-medium text-foreground truncate block">
                              {entry.result.title || entry.result.mood || entry.fileName || "Analysis"}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-muted-foreground/60">{modeLabel(entry.mode)}</span>
                              <span className="text-[10px] text-muted-foreground/40">·</span>
                              <span className="text-[10px] text-muted-foreground/60">{new Date(entry.date).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>
                      </button>
                      <button
                        onClick={() => deleteEntry(entry.id)}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-destructive transition-all shrink-0"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  {filteredHistory.length === 0 && searchQuery && (
                    <p className="text-xs text-muted-foreground/60 text-center py-3">No matches found</p>
                  )}
                </div>
              </div>
            )}
          </>
        ) : mode !== "palette-prompt" && preview ? (
          <div className="space-y-4">
            {/* File preview */}
            <div className="relative rounded-xl overflow-hidden">
              {isImage ? (
                <img src={preview} alt="Upload" className="w-full h-48 object-cover rounded-xl" />
              ) : (
                <div className="w-full h-32 rounded-xl bg-secondary/50 flex flex-col items-center justify-center gap-2">
                  <FileText className="w-8 h-8 text-muted-foreground/40" />
                  <p className="text-xs text-muted-foreground font-medium">{fileName}</p>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-secondary text-muted-foreground/60 uppercase">
                    {fileName.split(".").pop()}
                  </span>
                </div>
              )}
              <button
                onClick={clear}
                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-primary/80 text-primary-foreground flex items-center justify-center hover:bg-primary transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Analyze button */}
            {!result && (
              <button
                onClick={analyze}
                disabled={analyzing}
                className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {analyzing ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span className="animate-pulse-slow">{status}</span></>
                ) : (
                  <><Sparkles className="w-3.5 h-3.5" />{mode === "moodboard" ? "Extract Aesthetics" : "Analyze with AI"}</>
                )}
              </button>
            )}

            {/* Results */}
            <ResultsDisplay result={result} mode={mode} onClear={clear} />
          </div>
        ) : null}

        {/* Show results for palette-prompt mode too */}
        {mode === "palette-prompt" && result && (
          <div className="mt-4">
            <ResultsDisplay result={result} mode={mode} onClear={() => { setResult(null); setPalettePrompt(""); }} />
          </div>
        )}
      </div>
    </div>
  );
}

function ResultsDisplay({ result, mode, onClear }: { result: AnalysisResult | null; mode: string; onClear: () => void }) {
  if (!result) return null;

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
        {/* Palette results */}
        {(mode === "moodboard" || mode === "palette-prompt") && result.palette && (
          <div className="glass rounded-xl p-4 space-y-4">
            <h5 className="text-serif text-sm">{mode === "palette-prompt" ? "Generated Palette" : "Extracted Palette"}</h5>
            <div className="flex gap-2">
              {Object.entries(result.palette).map(([name, hex]) => (
                <div key={name} className="flex-1 text-center">
                  <div className="w-full aspect-square rounded-lg border border-border/50 mb-1.5 hover:scale-105 transition-transform cursor-pointer" style={{ backgroundColor: hex }} title={`Click to copy: ${hex}`}
                    onClick={() => { navigator.clipboard.writeText(hex as string); toast.success(`Copied ${hex}`); }}
                  />
                  <p className="text-[10px] text-muted-foreground capitalize">{name}</p>
                  <p className="text-[10px] font-mono text-muted-foreground/60">{hex}</p>
                </div>
              ))}
            </div>
            {result.fontVibe && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Font Vibe:</span>
                <span className="bg-secondary px-2 py-0.5 rounded-full capitalize">{result.fontVibe}</span>
              </div>
            )}
            {result.mood && (
              <p className="text-sm text-muted-foreground leading-relaxed italic">&ldquo;{result.mood}&rdquo;</p>
            )}
          </div>
        )}

        {result.suggestions && result.suggestions.length > 0 && (
          <div className="glass rounded-xl p-4 space-y-2">
            <h5 className="text-serif text-sm">Design Suggestions</h5>
            {result.suggestions.map((s, i) => (
              <p key={i} className="text-xs text-muted-foreground flex gap-2">
                <span className="text-accent shrink-0">→</span>{s}
              </p>
            ))}
          </div>
        )}

        {/* Categorize results */}
        {mode === "categorize" && result.title && (
          <div className="glass rounded-xl p-4">
            <h4 className="text-serif text-lg mb-1">{result.title}</h4>
            {result.category && (
              <span className="inline-block text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full">{result.category}</span>
            )}
            {result.description && (
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{result.description}</p>
            )}
          </div>
        )}

        {result.tags && result.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {result.tags.map((tag, i) => (
              <span key={i} className="text-xs bg-secondary px-2.5 py-1 rounded-full text-secondary-foreground">{tag}</span>
            ))}
          </div>
        )}

        {result.insights && result.insights.length > 0 && (
          <div className="glass rounded-xl p-4 space-y-2">
            <h5 className="text-serif text-sm">Insights</h5>
            {result.insights.map((insight, i) => (
              <p key={i} className="text-xs text-muted-foreground flex gap-2">
                <span className="text-accent shrink-0">•</span>{insight}
              </p>
            ))}
          </div>
        )}

        {result.mindmap && (
          <div className="glass rounded-xl p-4">
            <h5 className="text-serif text-sm mb-3">Generated Mindmap</h5>
            <MindmapViz data={result.mindmap} />
          </div>
        )}

        <button onClick={onClear} className="w-full py-2 rounded-xl border border-border text-sm text-muted-foreground hover:bg-secondary transition-colors">
          Analyze another file
        </button>
      </motion.div>
    </AnimatePresence>
  );
}

function MindmapViz({ data }: { data: { title: string; nodes: MindmapNode[] } }) {
  return (
    <div className="space-y-2">
      <div className="text-center">
        <span className="inline-block bg-accent/15 text-accent text-xs font-medium px-3 py-1.5 rounded-full">{data.title}</span>
      </div>
      <div className="space-y-1.5 mt-3">
        {data.nodes?.map((node, idx) => (
          <div key={node.id} className="ml-2">
            <div className="flex items-center gap-2 text-sm">
              <div className={`w-2 h-2 rounded-full ${idx % 2 === 0 ? "bg-accent/60" : "bg-primary/40"} shrink-0`} />
              <span className="font-medium text-foreground">{node.label}</span>
            </div>
            {node.children?.map((child) => (
              <div key={child.id} className="ml-6 flex items-center gap-2 text-xs text-muted-foreground mt-1">
                <div className="w-1 h-1 rounded-full bg-border shrink-0" />
                {child.label}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
