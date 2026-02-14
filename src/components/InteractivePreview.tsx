import { useState, useCallback, useEffect, useRef } from "react";
import { Loader2, Sparkles, Layout, GitBranch, Clock, RotateCcw, GripVertical, Plus, Trash2, MessageSquare, Save, FolderOpen, ZoomIn, ZoomOut, Maximize2, Minimize2, Import } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`;
const STORAGE_KEY = "ethos-preview-sessions";

interface LayoutItem {
  content: string;
  x: number;
  y: number;
  type: string;
  color?: string;
  width?: number;
  height?: number;
  connectedTo?: number[]; // indices of connected items
}

interface FollowUpQ {
  question: string;
  answer: string;
}

interface PreviewSession {
  id: string;
  name: string;
  input: string;
  items: LayoutItem[];
  layoutType: string;
  followUps: FollowUpQ[];
  date: string;
}

interface PreviewProps {
  onPushToMiro?: (items: LayoutItem[]) => void;
  importedPalette?: Record<string, string> | null;
  importedIdeas?: string[];
}

function loadSessions(): PreviewSession[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
}

const STICKY_COLORS = [
  { name: "Cream", hex: "#FFF9DB" },
  { name: "Mint", hex: "#D4EDDA" },
  { name: "Rose", hex: "#FDE8E8" },
  { name: "Sky", hex: "#E3F2FD" },
  { name: "Lavender", hex: "#F3E5F5" },
  { name: "Peach", hex: "#FFE8D6" },
];

type Phase = "input" | "questions" | "generating" | "board";

export default function InteractivePreview({ onPushToMiro, importedPalette, importedIdeas }: PreviewProps) {
  const [input, setInput] = useState("");
  const [items, setItems] = useState<LayoutItem[]>([]);
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState("");
  const [layoutType, setLayoutType] = useState<"grid" | "mindmap" | "timeline">("grid");
  const [sessions, setSessions] = useState<PreviewSession[]>(loadSessions);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showSessions, setShowSessions] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  // Zoom and canvas
  const [zoom, setZoom] = useState(100);
  const [canvasSize, setCanvasSize] = useState({ w: 1200, h: 600 });
  const [expanded, setExpanded] = useState(false);

  // Follow-up questions flow
  const [phase, setPhase] = useState<Phase>("input");
  const [followUps, setFollowUps] = useState<FollowUpQ[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [qAnswer, setQAnswer] = useState("");
  const [loadingQs, setLoadingQs] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, 20)));
  }, [sessions]);

  const zoomIn = () => setZoom(z => Math.min(200, z + 20));
  const zoomOut = () => setZoom(z => Math.max(40, z - 20));
  const toggleExpand = () => {
    if (expanded) {
      setCanvasSize({ w: 1200, h: 600 });
    } else {
      setCanvasSize({ w: 2400, h: 1200 });
    }
    setExpanded(!expanded);
  };

  // Import ideas from Ideation tab
  const importIdeas = () => {
    if (!importedIdeas || importedIdeas.length === 0) return;
    const newItems: LayoutItem[] = importedIdeas.map((idea, i) => ({
      content: idea,
      x: 100 + (i % 4) * 280,
      y: 80 + Math.floor(i / 4) * 200,
      type: "sticky_note",
      color: STICKY_COLORS[i % STICKY_COLORS.length].hex,
    }));
    setItems(prev => [...prev, ...newItems]);
    if (phase !== "board") setPhase("board");
  };

  // Ask AI for follow-up questions before generating
  const askFollowUps = useCallback(async () => {
    if (!input.trim()) return;
    setLoadingQs(true);
    setPhase("questions");

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
            content: `The user wants to create a ${layoutType} board from this brain dump:\n\n"${input}"\n\nAsk 3 short, specific follow-up questions to better understand their needs before generating the board. Questions should help clarify scope, priorities, audience, or context. Return ONLY a JSON array of strings like: ["Question 1?", "Question 2?", "Question 3?"]`
          }],
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

      const cleaned = full.replace(/```json/g, "").replace(/```/g, "").trim();
      const questions: string[] = JSON.parse(cleaned);
      setFollowUps(questions.map(q => ({ question: q, answer: "" })));
      setCurrentQ(0);
      setQAnswer("");
    } catch (e) {
      console.error(e);
      setPhase("input");
      generate(input, []);
    } finally {
      setLoadingQs(false);
    }
  }, [input, layoutType]);

  const answerQuestion = () => {
    const updated = [...followUps];
    updated[currentQ] = { ...updated[currentQ], answer: qAnswer };
    setFollowUps(updated);
    setQAnswer("");

    if (currentQ < followUps.length - 1) {
      setCurrentQ(currentQ + 1);
    } else {
      generate(input, updated);
    }
  };

  const skipQuestions = () => {
    generate(input, followUps.filter(f => f.answer));
  };

  const generate = useCallback(async (braindump: string, answers: FollowUpQ[]) => {
    setPhase("generating");
    setGenerating(true);
    setStatus("Crystallizing thoughts...");

    const context = answers.filter(a => a.answer).map(a => `Q: ${a.question}\nA: ${a.answer}`).join("\n\n");
    const paletteColors = importedPalette ? Object.values(importedPalette) : null;

    try {
      const colorInstructions = paletteColors
        ? `Use these extracted palette colors: ${paletteColors.join(", ")}`
        : `Use soft warm pastels (#FFF9DB, #D4EDDA, #FDE8E8, #E3F2FD, #F3E5F5, #FFE8D6)`;

      const layoutPrompts: Record<string, string> = {
        grid: `Organize these ideas into a clean grid layout. Return ONLY a JSON array where each item has:
{"content": "text", "x": number, "y": number, "type": "sticky_note", "color": "#hex", "connectedTo": [indices]}
Use 300px spacing. ${colorInstructions}. Max 12 items. Group related ideas together. Add connectedTo arrays linking related items by index.`,
        mindmap: `Create a mindmap layout from these ideas. Return ONLY a JSON array where:
- The central topic is at x:500, y:300 with type "central"
- Main branches radiate outward at ~250px distance
- Sub-items are near their parent branches
Each: {"content": "text", "x": number, "y": number, "type": "branch"|"central"|"leaf", "color": "#hex", "connectedTo": [parent_index]}
${colorInstructions}. Max 15 items. Every non-central node must have connectedTo pointing to its parent.`,
        timeline: `Organize these ideas into a horizontal timeline. Return ONLY a JSON array where:
- Items flow left to right with x starting at 100 and incrementing by 280
- y values alternate between 120 and 300 for visual interest
Each: {"content": "text", "x": number, "y": number, "type": "milestone"|"event", "color": "#hex", "connectedTo": [previous_index]}
${colorInstructions}. Max 10 items. Connect each item to the previous one.`,
      };

      const fullPrompt = context
        ? `${layoutPrompts[layoutType]}\n\nOriginal brain dump:\n${braindump}\n\nAdditional context from user:\n${context}`
        : `${layoutPrompts[layoutType]}\n\nContent to organize:\n\n${braindump}`;

      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: fullPrompt }],
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
      setPhase("board");
      setStatus("");
    } catch (e) {
      console.error(e);
      setStatus("Generation failed. Try again.");
      setPhase("input");
    } finally {
      setGenerating(false);
    }
  }, [layoutType, importedPalette]);

  const saveSession = () => {
    const name = input.slice(0, 40) || "Untitled";
    const session: PreviewSession = {
      id: activeSessionId || Date.now().toString(),
      name,
      input,
      items,
      layoutType,
      followUps,
      date: new Date().toISOString(),
    };
    setSessions(prev => {
      const existing = prev.findIndex(s => s.id === session.id);
      if (existing >= 0) {
        const copy = [...prev];
        copy[existing] = session;
        return copy;
      }
      return [session, ...prev];
    });
    setActiveSessionId(session.id);
  };

  const loadSession = (session: PreviewSession) => {
    setInput(session.input);
    setItems(session.items);
    setLayoutType(session.layoutType as any);
    setFollowUps(session.followUps || []);
    setActiveSessionId(session.id);
    setPhase(session.items.length > 0 ? "board" : "input");
    setShowSessions(false);
  };

  const newSession = () => {
    setInput("");
    setItems([]);
    setFollowUps([]);
    setActiveSessionId(null);
    setPhase("input");
    setShowSessions(false);
  };

  const addStickyNote = () => {
    const newItem: LayoutItem = {
      content: "New note",
      x: 50 + Math.random() * 400,
      y: 50 + Math.random() * 300,
      type: "sticky_note",
      color: STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)].hex,
    };
    setItems(prev => [...prev, newItem]);
  };

  const updateItem = (idx: number, updates: Partial<LayoutItem>) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, ...updates } : item));
  };

  const deleteItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
    setEditingIdx(null);
  };

  const layoutOptions = [
    { value: "grid" as const, label: "Grid", icon: Layout },
    { value: "mindmap" as const, label: "Mindmap", icon: GitBranch },
    { value: "timeline" as const, label: "Timeline", icon: Clock },
  ];

  const stickyCount = items.filter(i => i.type === "sticky_note" || i.type === "leaf").length;
  const shapeCount = items.filter(i => i.type === "central" || i.type === "branch").length;
  const textCount = items.filter(i => i.type === "milestone" || i.type === "event").length;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left sidebar — Layout DNA + Color Palette */}
      <div className="hidden lg:flex w-64 xl:w-72 flex-col border-r border-border/30 p-4 gap-4 overflow-y-auto scrollbar-thin shrink-0">
        {/* Sessions */}
        <div className="glass rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <button onClick={() => setShowSessions(!showSessions)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <FolderOpen className="w-3 h-3" />
              Previews
              {sessions.length > 0 && <span className="text-[10px] bg-secondary rounded-full px-1.5">{sessions.length}</span>}
            </button>
            <button onClick={newSession} className="text-xs text-accent hover:text-accent/80 transition-colors">+ New</button>
          </div>
          <AnimatePresence>
            {showSessions && sessions.length > 0 && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="space-y-1 max-h-[180px] overflow-y-auto scrollbar-thin">
                  {sessions.map(s => (
                    <button
                      key={s.id}
                      onClick={() => loadSession(s)}
                      className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition-colors ${
                        activeSessionId === s.id ? "bg-accent/10 text-accent" : "bg-secondary/50 hover:bg-secondary text-foreground"
                      }`}
                    >
                      <span className="truncate block">{s.name}</span>
                      <span className="text-[10px] text-muted-foreground/60 capitalize">{s.layoutType}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Layout DNA */}
        <div className="glass rounded-xl p-4">
          <h4 className="text-serif text-sm mb-3">Layout DNA</h4>
          <div className="space-y-2">
            {layoutOptions.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setLayoutType(value)}
                className={`w-full flex items-center gap-3 p-2.5 rounded-lg text-xs transition-all ${
                  layoutType === value
                    ? "bg-accent/10 text-accent border border-accent/20"
                    : "bg-secondary/50 text-secondary-foreground hover:bg-secondary"
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  layoutType === value ? "bg-accent/15" : "bg-secondary"
                }`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="text-left">
                  <p className="font-medium">{label}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {value === "grid" ? "Grid-based layout" : value === "mindmap" ? "Mind map structure" : "Timeline arrangement"}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Extracted Color Palette */}
        {importedPalette && (
          <div className="glass rounded-xl p-4">
            <h4 className="text-serif text-sm mb-3">Extracted Palette</h4>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(importedPalette).map(([name, hex]) => (
                <div key={name} className="text-center">
                  <div className="w-full aspect-square rounded-lg border border-border/50 mb-1" style={{ backgroundColor: hex }} />
                  <p className="text-[10px] text-muted-foreground capitalize truncate">{name}</p>
                  <p className="text-[9px] font-mono text-muted-foreground/50">{hex}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Import buttons */}
        {((importedIdeas && importedIdeas.length > 0) || importedPalette) && phase === "board" && (
          <div className="glass rounded-xl p-4">
            <h4 className="text-serif text-sm mb-3">Import</h4>
            {importedIdeas && importedIdeas.length > 0 && (
              <button
                onClick={importIdeas}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/50 text-xs text-foreground hover:bg-secondary transition-colors mb-2"
              >
                <Import className="w-3 h-3 text-accent" />
                Import {importedIdeas.length} ideas from chat
              </button>
            )}
          </div>
        )}
      </div>

      {/* Center — Canvas area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Zoom controls bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/30 shrink-0">
          <div className="flex items-center gap-2">
            {phase === "board" && (
              <>
                <button onClick={addStickyNote} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground text-xs hover:bg-secondary/80 transition-colors">
                  <Plus className="w-3 h-3" />
                  Add Note
                </button>
                <div className="flex gap-1 ml-2">
                  {STICKY_COLORS.map(c => (
                    <button
                      key={c.hex}
                      onClick={() => { if (editingIdx !== null) updateItem(editingIdx, { color: c.hex }); }}
                      className="w-4 h-4 rounded-full border border-border/50 hover:scale-125 transition-transform"
                      style={{ backgroundColor: c.hex }}
                      title={c.name}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={zoomOut} className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors">
              <ZoomOut className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            <span className="text-xs text-muted-foreground font-mono w-10 text-center">{zoom}%</span>
            <button onClick={zoomIn} className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors">
              <ZoomIn className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            <button onClick={toggleExpand} className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors ml-1" title={expanded ? "Shrink canvas" : "Expand canvas"}>
              {expanded ? <Minimize2 className="w-3.5 h-3.5 text-muted-foreground" /> : <Maximize2 className="w-3.5 h-3.5 text-muted-foreground" />}
            </button>
          </div>
        </div>

        {/* Main canvas */}
        <div className="flex-1 overflow-auto p-4" style={{ minHeight: 0 }}>
          <AnimatePresence mode="wait">
            {/* Phase: Input */}
            {phase === "input" && (
              <motion.div key="input" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="max-w-xl mx-auto pt-16 space-y-4">
                <div className="text-center mb-8">
                  <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-4">
                    <Sparkles className="w-6 h-6 text-accent" />
                  </div>
                  <h2 className="text-serif text-2xl mb-2">Create a board</h2>
                  <p className="text-sm text-muted-foreground">Brain dump your ideas and AI will organize them into a visual layout</p>
                </div>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Brain dump your ideas here... URLs, notes, anything."
                  rows={5}
                  className="w-full bg-transparent border border-border rounded-xl p-4 text-sm outline-none focus:ring-1 focus:ring-accent/40 resize-none placeholder:text-muted-foreground/50"
                />
                <button
                  onClick={askFollowUps}
                  disabled={!input.trim() || loadingQs}
                  className="w-full px-4 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-40"
                >
                  {loadingQs ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /><span className="animate-pulse-slow">Thinking...</span></>
                  ) : (
                    <><Sparkles className="w-4 h-4" />Generate Board</>
                  )}
                </button>

                {sessions.length > 0 && (
                  <div className="mt-8">
                    <h5 className="text-serif text-sm text-muted-foreground mb-3">Recent Previews</h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {sessions.slice(0, 4).map(s => (
                        <button
                          key={s.id}
                          onClick={() => loadSession(s)}
                          className="text-left p-3 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors text-xs"
                        >
                          <span className="text-foreground truncate block font-medium">{s.name}</span>
                          <span className="text-muted-foreground/60 capitalize">{s.layoutType} · {new Date(s.date).toLocaleDateString()}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* Phase: Follow-up Questions */}
            {phase === "questions" && !loadingQs && followUps.length > 0 && (
              <motion.div key="questions" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="max-w-lg mx-auto pt-16 space-y-4">
                <div className="text-center mb-4">
                  <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-3">
                    <MessageSquare className="w-5 h-5 text-accent" />
                  </div>
                  <h3 className="text-serif text-xl mb-1">Quick questions</h3>
                  <p className="text-xs text-muted-foreground">To make your board better</p>
                </div>

                <div className="flex justify-center gap-2">
                  {followUps.map((_, i) => (
                    <div key={i} className={`w-2.5 h-2.5 rounded-full transition-colors ${
                      i < currentQ ? "bg-accent" : i === currentQ ? "bg-accent/60" : "bg-border"
                    }`} />
                  ))}
                </div>

                <div className="glass rounded-xl p-5">
                  <p className="text-sm text-foreground font-medium mb-3">{followUps[currentQ]?.question}</p>
                  <textarea
                    value={qAnswer}
                    onChange={(e) => setQAnswer(e.target.value)}
                    placeholder="Your answer..."
                    rows={3}
                    className="w-full bg-transparent border border-border rounded-lg p-3 text-sm outline-none focus:ring-1 focus:ring-accent/40 resize-none placeholder:text-muted-foreground/50"
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); answerQuestion(); } }}
                    autoFocus
                  />
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={answerQuestion}
                      disabled={!qAnswer.trim()}
                      className="flex-1 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40"
                    >
                      {currentQ < followUps.length - 1 ? "Next" : "Generate Board"}
                    </button>
                    <button
                      onClick={skipQuestions}
                      className="px-4 py-2.5 rounded-lg border border-border text-sm text-muted-foreground hover:bg-secondary transition-colors"
                    >
                      Skip
                    </button>
                  </div>
                </div>

                {currentQ > 0 && (
                  <div className="space-y-2">
                    {followUps.slice(0, currentQ).filter(f => f.answer).map((f, i) => (
                      <div key={i} className="bg-secondary/50 rounded-lg px-3 py-2 text-xs">
                        <p className="text-muted-foreground">{f.question}</p>
                        <p className="text-foreground mt-0.5">{f.answer}</p>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* Phase: Generating */}
            {(phase === "generating" || (phase === "questions" && loadingQs)) && (
              <motion.div key="generating" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center h-full py-24">
                <Loader2 className="w-10 h-10 animate-spin text-accent mb-4" />
                <p className="text-sm text-muted-foreground animate-pulse-slow">{status || "Generating your board..."}</p>
              </motion.div>
            )}

            {/* Phase: Board */}
            {phase === "board" && items.length > 0 && (
              <motion.div key="board" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="space-y-3">
                <InteractiveBoard
                  items={items}
                  layoutType={layoutType}
                  editingIdx={editingIdx}
                  onEditIdx={setEditingIdx}
                  onUpdateItem={updateItem}
                  onDeleteItem={deleteItem}
                  dragIdx={dragIdx}
                  onDragIdx={setDragIdx}
                  zoom={zoom}
                  canvasWidth={canvasSize.w}
                  canvasHeight={canvasSize.h}
                />

                {/* Actions */}
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => onPushToMiro?.(items)}
                    className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-medium flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                  >
                    Push to Miro
                  </button>
                  <button
                    onClick={saveSession}
                    className="px-4 py-2.5 rounded-xl border border-accent/30 text-xs text-accent hover:bg-accent/5 transition-colors flex items-center gap-1.5"
                  >
                    <Save className="w-3 h-3" />
                    Save
                  </button>
                  <button
                    onClick={() => { setPhase("input"); }}
                    className="px-4 py-2.5 rounded-xl border border-border text-xs text-muted-foreground hover:bg-secondary transition-colors flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Regenerate
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Right sidebar — Preview Statistics */}
      <div className="hidden lg:flex w-64 xl:w-72 flex-col border-l border-border/30 p-4 gap-4 overflow-y-auto scrollbar-thin shrink-0">
        <div className="glass rounded-xl p-4">
          <h4 className="text-serif text-sm mb-3">Preview Statistics</h4>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Total Elements", value: items.length, color: "text-accent" },
              { label: "Sticky Notes", value: stickyCount, color: "text-foreground" },
              { label: "Shapes", value: shapeCount, color: "text-foreground" },
              { label: "Text Elements", value: textCount, color: "text-foreground" },
            ].map((s) => (
              <div key={s.label} className="bg-secondary/50 rounded-lg p-3 text-center">
                <p className={`text-lg font-medium ${s.color}`}>{s.value}</p>
                <p className="text-[10px] text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground mt-3 pt-3 border-t border-border/30">
            <span>Canvas Size:</span>
            <span className="font-mono">{canvasSize.w} × {canvasSize.h}</span>
          </div>
        </div>

        {/* Color palette from items */}
        {items.length > 0 && (
          <div className="glass rounded-xl p-4">
            <h4 className="text-serif text-sm mb-3">Board Colors</h4>
            <div className="flex flex-wrap gap-1.5">
              {[...new Set(items.map(i => i.color).filter(Boolean))].map(hex => (
                <div key={hex} className="w-6 h-6 rounded-lg border border-border/50" style={{ backgroundColor: hex }} title={hex} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Interactive Board with Connectors ── */

interface BoardProps {
  items: LayoutItem[];
  layoutType: string;
  editingIdx: number | null;
  onEditIdx: (idx: number | null) => void;
  onUpdateItem: (idx: number, updates: Partial<LayoutItem>) => void;
  onDeleteItem: (idx: number) => void;
  dragIdx: number | null;
  onDragIdx: (idx: number | null) => void;
  zoom: number;
  canvasWidth: number;
  canvasHeight: number;
}

function InteractiveBoard({ items, layoutType, editingIdx, onEditIdx, onUpdateItem, onDeleteItem, dragIdx, onDragIdx, zoom, canvasWidth, canvasHeight }: BoardProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const scale = zoom / 100;
  const displayW = canvasWidth * scale;
  const displayH = canvasHeight * scale;

  const handlePointerDown = (e: React.PointerEvent, idx: number) => {
    if (editingIdx === idx) return;
    const board = boardRef.current;
    if (!board) return;
    const rect = board.getBoundingClientRect();
    const item = items[idx];
    setDragOffset({
      x: e.clientX - rect.left - (item.x / canvasWidth) * displayW,
      y: e.clientY - rect.top - (item.y / canvasHeight) * displayH,
    });
    onDragIdx(idx);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (dragIdx === null) return;
    const board = boardRef.current;
    if (!board) return;
    const rect = board.getBoundingClientRect();
    const x = Math.max(0, Math.min(canvasWidth - 100, ((e.clientX - rect.left - dragOffset.x) / displayW) * canvasWidth));
    const y = Math.max(0, Math.min(canvasHeight - 50, ((e.clientY - rect.top - dragOffset.y) / displayH) * canvasHeight));
    onUpdateItem(dragIdx, { x, y });
  };

  const handlePointerUp = () => { onDragIdx(null); };

  // Build connector lines
  const connectors: { x1: number; y1: number; x2: number; y2: number }[] = [];
  items.forEach((item, i) => {
    if (item.connectedTo) {
      item.connectedTo.forEach(targetIdx => {
        if (targetIdx >= 0 && targetIdx < items.length && targetIdx !== i) {
          connectors.push({
            x1: item.x + 60,
            y1: item.y + 30,
            x2: items[targetIdx].x + 60,
            y2: items[targetIdx].y + 30,
          });
        }
      });
    }
  });

  return (
    <div
      ref={boardRef}
      className="glass rounded-xl relative overflow-hidden cursor-crosshair select-none"
      style={{ width: displayW, height: displayH, minHeight: 400 }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={() => onEditIdx(null)}
    >
      {/* Dot grid */}
      <div className="absolute inset-0 opacity-[0.04]" style={{
        backgroundImage: "radial-gradient(circle, hsl(var(--foreground)) 1px, transparent 1px)",
        backgroundSize: `${24 * scale}px ${24 * scale}px`,
      }} />

      {/* SVG connectors */}
      <svg className="absolute inset-0 pointer-events-none" width={displayW} height={displayH}>
        {connectors.map((c, i) => {
          const sx = (c.x1 / canvasWidth) * displayW;
          const sy = (c.y1 / canvasHeight) * displayH;
          const ex = (c.x2 / canvasWidth) * displayW;
          const ey = (c.y2 / canvasHeight) * displayH;
          const mx = (sx + ex) / 2;
          const my = (sy + ey) / 2 - 20;
          return (
            <path
              key={i}
              d={`M ${sx} ${sy} Q ${mx} ${my} ${ex} ${ey}`}
              fill="none"
              stroke="hsl(var(--border))"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              opacity={0.6}
            />
          );
        })}
      </svg>

      {items.map((item, i) => (
        <StickyNote
          key={i}
          item={item}
          index={i}
          isEditing={editingIdx === i}
          isDragging={dragIdx === i}
          onPointerDown={(e) => handlePointerDown(e, i)}
          onEdit={() => onEditIdx(i)}
          onUpdate={(updates) => onUpdateItem(i, updates)}
          onDelete={() => onDeleteItem(i)}
          canvasWidth={canvasWidth}
          canvasHeight={canvasHeight}
          displayWidth={displayW}
          displayHeight={displayH}
        />
      ))}
    </div>
  );
}

interface StickyNoteProps {
  item: LayoutItem;
  index: number;
  isEditing: boolean;
  isDragging: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onEdit: () => void;
  onUpdate: (updates: Partial<LayoutItem>) => void;
  onDelete: () => void;
  canvasWidth: number;
  canvasHeight: number;
  displayWidth: number;
  displayHeight: number;
}

function StickyNote({ item, index, isEditing, isDragging, onPointerDown, onEdit, onUpdate, onDelete, canvasWidth, canvasHeight, displayWidth, displayHeight }: StickyNoteProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [isEditing]);

  const left = (item.x / canvasWidth) * displayWidth;
  const top = (item.y / canvasHeight) * displayHeight;
  const isCentral = item.type === "central";

  const typeLabel = item.type === "sticky_note" || item.type === "leaf"
    ? "STICKY NOTE"
    : item.type === "central" || item.type === "branch"
    ? "SHAPE"
    : "TEXT";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: isDragging ? 1.05 : 1, zIndex: isDragging ? 50 : isEditing ? 40 : 10 }}
      transition={{ delay: index * 0.03, duration: 0.2 }}
      className={`absolute group ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
      style={{ left, top }}
      onPointerDown={onPointerDown}
      onDoubleClick={(e) => { e.stopPropagation(); onEdit(); }}
    >
      <div
        className={`relative rounded-xl shadow-sm border transition-shadow ${
          isEditing ? "ring-2 ring-accent/40 shadow-md" : "hover:shadow-md"
        } ${isCentral ? "border-primary/20" : "border-border/30"}`}
        style={{ backgroundColor: item.color || "#FFF9DB", minWidth: isCentral ? 150 : 130, maxWidth: 200 }}
      >
        {/* Type label */}
        <div className="px-3 pt-2 flex items-center gap-1.5">
          <span className="text-[9px] font-medium tracking-wider opacity-40 uppercase">{typeLabel}</span>
        </div>
        {/* Paper fold */}
        <div className="absolute top-0 right-0 w-4 h-4 overflow-hidden">
          <div className="absolute top-0 right-0 w-6 h-6 -translate-x-1 translate-y-1 rotate-45" style={{ backgroundColor: "rgba(0,0,0,0.04)" }} />
        </div>
        <div className="absolute -left-0.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-40 transition-opacity">
          <GripVertical className="w-3 h-3 text-foreground" />
        </div>
        <div className="p-3 pt-1">
          {isEditing ? (
            <textarea
              ref={textareaRef}
              value={item.content}
              onChange={(e) => onUpdate({ content: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Escape") onEdit(); }}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-transparent border-none outline-none resize-none text-xs leading-relaxed min-h-[40px]"
              rows={3}
            />
          ) : (
            <p className={`text-xs leading-relaxed ${isCentral ? "font-medium text-center" : ""}`}>{item.content}</p>
          )}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Trash2 className="w-2.5 h-2.5" />
        </button>
      </div>
    </motion.div>
  );
}
