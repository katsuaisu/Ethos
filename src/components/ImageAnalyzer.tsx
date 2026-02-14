import { useState, useRef, useCallback, useEffect } from "react";
import { Upload, Loader2, X, Sparkles, Palette, ScanSearch } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const ANALYZE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-analyze`;
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
  mode: "categorize" | "moodboard";
  date: string;
}

function loadHistory(): ScanEntry[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch { return []; }
}

export default function ImageAnalyzer({ onMindmapGenerated, onPaletteExtracted }: { onMindmapGenerated?: (data: any) => void; onPaletteExtracted?: (palette: Record<string, string>) => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [status, setStatus] = useState("");
  const [mode, setMode] = useState<"categorize" | "moodboard">("categorize");
  const [history, setHistory] = useState<ScanEntry[]>(loadHistory);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, 20)));
  }, [history]);

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);
    setResult(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith("image/")) handleFile(file);
  }, [handleFile]);

  const analyze = async () => {
    if (!preview) return;
    setAnalyzing(true);
    setStatus(mode === "moodboard" ? "Extracting aesthetics..." : "Scanning image...");

    try {
      const res = await fetch(ANALYZE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          imageBase64: preview,
          analysisType: mode,
          prompt: mode === "moodboard"
            ? "Extract the visual identity from this moodboard. Identify color palette (hex), font style, mood, and design suggestions."
            : "Analyze this image thoroughly. Extract key themes, generate a detailed mindmap structure, and suggest how this could be organized on a board.",
        }),
      });

      const data = await res.json();
      if (data.result) {
        setResult(data.result);
        if (data.result.palette && onPaletteExtracted) {
          onPaletteExtracted(data.result.palette);
        }
        if (data.result.mindmap && onMindmapGenerated) {
          onMindmapGenerated(data.result.mindmap);
        }
        // Save to history
        const entry: ScanEntry = {
          id: Date.now().toString(),
          preview: preview.slice(0, 200), // thumbnail reference
          result: data.result,
          mode,
          date: new Date().toISOString(),
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

  const clear = () => {
    setPreview(null);
    setResult(null);
    setStatus("");
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto overscroll-contain scrollbar-thin px-4 py-3" style={{ minHeight: 0, WebkitOverflowScrolling: "touch" }}>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
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
            Analyze & Mindmap
          </button>
          <button
            onClick={() => setMode("moodboard")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all ${
              mode === "moodboard" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            <Palette className="w-3 h-3" />
            Moodboard Extract
          </button>
        </div>

        {!preview ? (
          <>
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-accent/40 hover:bg-accent/5 transition-all min-h-[200px]"
            >
              <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center">
                <Upload className="w-5 h-5 text-accent" />
              </div>
              <p className="text-sm text-muted-foreground text-center">
                Drop an image or click to upload
              </p>
              <p className="text-xs text-muted-foreground/60">
                {mode === "moodboard" ? "Extract colors, fonts & mood" : "AI will analyze, categorize & generate mindmaps"}
              </p>
            </motion.div>

            {/* Scan history */}
            {history.length > 0 && (
              <div className="mt-6">
                <div className="flex items-center justify-between mb-2">
                  <h5 className="text-serif text-sm text-muted-foreground">Recent Scans</h5>
                  <button onClick={() => setHistory([])} className="text-xs text-muted-foreground/60 hover:text-foreground transition-colors">
                    Clear
                  </button>
                </div>
                <div className="space-y-2">
                  {history.slice(0, 5).map((entry) => (
                    <button
                      key={entry.id}
                      onClick={() => { setResult(entry.result); setMode(entry.mode); }}
                      className="w-full text-left p-3 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-foreground truncate">
                          {entry.result.title || entry.result.mood || "Analysis"}
                        </span>
                        <span className="text-[10px] text-muted-foreground/60 capitalize shrink-0 ml-2">{entry.mode}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {new Date(entry.date).toLocaleDateString()}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="space-y-4">
            {/* Image preview */}
            <div className="relative rounded-xl overflow-hidden">
              <img src={preview} alt="Upload" className="w-full h-48 object-cover rounded-xl" />
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
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span className="animate-pulse-slow">{status}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    {mode === "moodboard" ? "Extract Aesthetics" : "Analyze with AI"}
                  </>
                )}
              </button>
            )}

            {/* Results */}
            <AnimatePresence>
              {result && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  {/* Moodboard results */}
                  {mode === "moodboard" && result.palette && (
                    <div className="glass rounded-xl p-4 space-y-4">
                      <h5 className="text-serif text-sm">Extracted Palette</h5>
                      <div className="flex gap-2">
                        {Object.entries(result.palette).map(([name, hex]) => (
                          <div key={name} className="flex-1 text-center">
                            <div
                              className="w-full aspect-square rounded-lg border border-border/50 mb-1.5"
                              style={{ backgroundColor: hex }}
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
                          <span className="text-accent shrink-0">→</span>
                          {s}
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Categorize results */}
                  {mode === "categorize" && result.title && (
                    <div className="glass rounded-xl p-4">
                      <h4 className="text-serif text-lg mb-1">{result.title}</h4>
                      {result.category && (
                        <span className="inline-block text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full">
                          {result.category}
                        </span>
                      )}
                      {result.description && (
                        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{result.description}</p>
                      )}
                    </div>
                  )}

                  {result.tags && result.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {result.tags.map((tag, i) => (
                        <span key={i} className="text-xs bg-secondary px-2.5 py-1 rounded-full text-secondary-foreground">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {result.insights && result.insights.length > 0 && (
                    <div className="glass rounded-xl p-4 space-y-2">
                      <h5 className="text-serif text-sm">Insights</h5>
                      {result.insights.map((insight, i) => (
                        <p key={i} className="text-xs text-muted-foreground flex gap-2">
                          <span className="text-accent shrink-0">•</span>
                          {insight}
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Mindmap visualization */}
                  {result.mindmap && (
                    <div className="glass rounded-xl p-4">
                      <h5 className="text-serif text-sm mb-3">Generated Mindmap</h5>
                      <MindmapViz data={result.mindmap} />
                    </div>
                  )}

                  <button
                    onClick={clear}
                    className="w-full py-2 rounded-xl border border-border text-sm text-muted-foreground hover:bg-secondary transition-colors"
                  >
                    Analyze another image
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}

function MindmapViz({ data }: { data: { title: string; nodes: MindmapNode[] } }) {
  const colors = [
    "bg-accent/15 text-accent",
    "bg-primary/10 text-primary",
    "bg-secondary text-secondary-foreground",
    "bg-accent/10 text-accent",
  ];

  return (
    <div className="space-y-2">
      <div className="text-center">
        <span className="inline-block bg-accent/15 text-accent text-xs font-medium px-3 py-1.5 rounded-full">
          {data.title}
        </span>
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
