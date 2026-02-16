import { useState, useCallback, useEffect, useRef } from "react";
import { Loader2, Sparkles, Layout, GitBranch, Clock, RotateCcw, GripVertical, Plus, Trash2, MessageSquare, Save, FolderOpen, ZoomIn, ZoomOut, Maximize2, Minimize2, Import, Link2, Sliders, Palette, Wand2, Move, ChevronDown, FileOutput, Square, Circle, Diamond, Type, Frame, Upload, Edit3 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Slider } from "./ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { toast } from "sonner";
import ConvertDialog from "./ConvertDialog";

const ELEMENT_TYPES = [
  { id: "sticky_note" as const, label: "Sticky Note", icon: Square, desc: "Classic sticky note" },
  { id: "shape_rect" as const, label: "Rectangle", icon: Square, desc: "Rectangle shape" },
  { id: "shape_circle" as const, label: "Circle", icon: Circle, desc: "Circle shape" },
  { id: "shape_diamond" as const, label: "Diamond", icon: Diamond, desc: "Decision diamond" },
  { id: "text_block" as const, label: "Text", icon: Type, desc: "Text block" },
  { id: "frame" as const, label: "Frame", icon: Frame, desc: "Grouping frame" },
];

// Board types the user can pick before generating
const BOARD_TYPES = [
  { id: "auto", label: "Auto", desc: "AI picks the best layout", emoji: "✨" },
  { id: "sticky_notes", label: "Sticky Notes", desc: "Classic idea board", emoji: "📝" },
  { id: "flowchart", label: "Flowchart", desc: "Process flow with decisions", emoji: "🔀" },
  { id: "mindmap", label: "Mind Map", desc: "Branching ideas from center", emoji: "🧠" },
  { id: "kanban", label: "Kanban", desc: "To-do / Doing / Done columns", emoji: "📋" },
  { id: "swot", label: "SWOT", desc: "Strengths, Weaknesses, Opportunities, Threats", emoji: "📊" },
  { id: "timeline", label: "Timeline", desc: "Events in chronological order", emoji: "⏳" },
  { id: "mixed", label: "Mixed", desc: "Combine multiple element types", emoji: "🎨" },
];

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`;
const STORAGE_KEY = "ethos-preview-sessions";
const SCAN_STORAGE_KEY = "ethos-scan-history";

interface LayoutItem {
  content: string;
  x: number;
  y: number;
  type: string;
  color?: string;
  width?: number;
  height?: number;
  connectedTo?: number[];
  elementType?: "sticky_note" | "shape_rect" | "shape_circle" | "shape_diamond" | "text_block" | "frame";
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
  gridDensity?: number;
}

interface ScanEntry {
  id: string;
  preview: string;
  result: any;
  mode: string;
  date: string;
  fileName?: string;
  fileType?: string;
}

interface PreviewProps {
  onPushToMiro?: (items: LayoutItem[]) => void;
  importedPalette?: Record<string, string> | null;
  importedIdeas?: string[];
}

function loadSessions(): PreviewSession[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
}

function loadScanHistory(): ScanEntry[] {
  try { return JSON.parse(localStorage.getItem(SCAN_STORAGE_KEY) || "[]"); } catch { return []; }
}

const STICKY_COLORS = [
  { name: "Cream", hex: "#FFF9DB" },
  { name: "Mint", hex: "#D4EDDA" },
  { name: "Rose", hex: "#FDE8E8" },
  { name: "Sky", hex: "#E3F2FD" },
  { name: "Lavender", hex: "#F3E5F5" },
  { name: "Peach", hex: "#FFE8D6" },
];

const BOARD_THEMES = [
  { name: "Warm Pastels", colors: ["#FFF9DB", "#D4EDDA", "#FDE8E8", "#FFE8D6", "#F3E5F5", "#E3F2FD"] },
  { name: "Earth Tones", colors: ["#F5E6D3", "#E8D5B7", "#D4C5A9", "#C9B99A", "#BFA98B", "#E6D5C3"] },
  { name: "Ocean Breeze", colors: ["#E0F4FF", "#B8E6FF", "#D4F1F9", "#E8F8F5", "#D1ECFE", "#C5E8F7"] },
  { name: "Midnight", colors: ["#E8E3F3", "#DCD6ED", "#D0CAE7", "#C4BEE1", "#E5E0F0", "#DBD5EA"] },
  { name: "Sunset", colors: ["#FFECD2", "#FCB69F", "#FFD6B0", "#FFEAA7", "#FDE8E8", "#F8C9B8"] },
  { name: "Monochrome", colors: ["#F5F5F5", "#EBEBEB", "#E0E0E0", "#D6D6D6", "#CCCCCC", "#F0F0F0"] },
];

type Phase = "input" | "type-select" | "questions" | "generating" | "board";

// Organize items into a clean grid layout based on density
function organizeGrid(items: LayoutItem[], density: number, canvasW: number): LayoutItem[] {
  const cols = density + 1;
  const spacingX = Math.floor(canvasW / (cols + 0.5));
  const spacingY = 180;
  const startX = 40;
  const startY = 40;
  return items.map((item, i) => ({
    ...item,
    x: startX + (i % cols) * spacingX,
    y: startY + Math.floor(i / cols) * spacingY,
  }));
}

function organizeMindmap(items: LayoutItem[], canvasW: number, canvasH: number): LayoutItem[] {
  if (items.length === 0) return items;
  const cx = canvasW / 2 - 60;
  const cy = canvasH / 2 - 30;
  const result = [...items];
  result[0] = { ...result[0], x: cx, y: cy, type: "central", connectedTo: [] };
  const branches = result.slice(1);
  const angleStep = (2 * Math.PI) / Math.max(branches.length, 1);
  const radius = Math.min(canvasW, canvasH) * 0.3;
  branches.forEach((item, i) => {
    const angle = angleStep * i - Math.PI / 2;
    result[i + 1] = { ...item, x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius, type: "branch", connectedTo: [0] };
  });
  return result;
}

function organizeTimeline(items: LayoutItem[], canvasW: number): LayoutItem[] {
  const spacing = Math.max(250, canvasW / (items.length + 1));
  return items.map((item, i) => ({
    ...item,
    x: 60 + i * spacing,
    y: i % 2 === 0 ? 100 : 280,
    type: i === 0 ? "milestone" : "event",
    connectedTo: i > 0 ? [i - 1] : [],
  }));
}

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
  const [gridDensity, setGridDensity] = useState(3);
  const [connectMode, setConnectMode] = useState(false);
  const [connectFrom, setConnectFrom] = useState<number | null>(null);
  const [showConvert, setShowConvert] = useState(false);
  const [addElementType, setAddElementType] = useState<LayoutItem["elementType"]>("sticky_note");
  const [selectedBoardTypes, setSelectedBoardTypes] = useState<string[]>(["auto"]);

  // Zoom and canvas
  const [zoom, setZoom] = useState(100);
  const [canvasSize, setCanvasSize] = useState({ w: 1400, h: 800 });

  // Board color theme — editable palette
  const [activeTheme, setActiveTheme] = useState<string>("Warm Pastels");
  const [customPalette, setCustomPalette] = useState<string[] | null>(null);
  const [editingColorIdx, setEditingColorIdx] = useState<number | null>(null);

  // Scan history for importing
  const [scanHistory, setScanHistory] = useState<ScanEntry[]>(loadScanHistory);
  const [showScanImport, setShowScanImport] = useState(false);

  // Follow-up questions flow
  const [phase, setPhase] = useState<Phase>("input");
  const [followUps, setFollowUps] = useState<FollowUpQ[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [qAnswer, setQAnswer] = useState("");
  const [loadingQs, setLoadingQs] = useState(false);

  // AI tailoring
  const [tailorPrompt, setTailorPrompt] = useState("");
  const [tailoring, setTailoring] = useState(false);

  // Autosave
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Refresh scan history when tab focuses
  useEffect(() => {
    const refresh = () => setScanHistory(loadScanHistory());
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  // Persist sessions
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, 20)));
  }, [sessions]);

  // Autosave
  useEffect(() => {
    if (phase !== "board" || items.length === 0) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => { doAutoSave(); }, 3000);
    return () => { if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current); };
  }, [items, phase]);

  const doAutoSave = useCallback(() => {
    const name = input.slice(0, 40) || "Untitled";
    const session: PreviewSession = {
      id: activeSessionId || Date.now().toString(),
      name, input, items, layoutType, followUps, gridDensity,
      date: new Date().toISOString(),
    };
    setSessions(prev => {
      const existing = prev.findIndex(s => s.id === session.id);
      if (existing >= 0) { const copy = [...prev]; copy[existing] = session; return copy; }
      return [session, ...prev];
    });
    if (!activeSessionId) setActiveSessionId(session.id);
    setLastSaved(new Date());
  }, [activeSessionId, input, items, layoutType, followUps, gridDensity]);

  const zoomIn = () => setZoom(z => Math.min(200, z + 20));
  const zoomOut = () => setZoom(z => Math.max(40, z - 20));
  const expandCanvas = () => setCanvasSize(s => ({ w: s.w + 400, h: s.h + 200 }));
  const shrinkCanvas = () => setCanvasSize(s => ({ w: Math.max(800, s.w - 400), h: Math.max(500, s.h - 200) }));

  // Get active palette colors
  const getActivePalette = useCallback((): string[] => {
    if (customPalette) return customPalette;
    if (activeTheme === "Scanned Palette" && importedPalette) return Object.values(importedPalette);
    const theme = BOARD_THEMES.find(t => t.name === activeTheme);
    return theme ? theme.colors : STICKY_COLORS.map(c => c.hex);
  }, [customPalette, activeTheme, importedPalette]);

  // Import ideas from Ideation tab — ALWAYS creates a NEW board
  const importIdeas = () => {
    if (!importedIdeas || importedIdeas.length === 0) return;
    const palette = getActivePalette();
    const newItems: LayoutItem[] = importedIdeas.map((idea, i) => ({
      content: idea, x: 0, y: 0, type: "sticky_note", color: palette[i % palette.length],
    }));
    const organized = organizeGrid(newItems, gridDensity, canvasSize.w);
    // Create new board — never merge into existing
    setActiveSessionId(null);
    setInput("Imported ideas");
    setItems(organized);
    setPhase("board");
    toast.success(`Created new board with ${importedIdeas.length} ideas`);
  };

  // Import scan entry content into board — ALWAYS creates a NEW board
  const importScanEntry = (entry: ScanEntry) => {
    const palette = getActivePalette();
    const newItems: LayoutItem[] = [];

    // Extract content from scan result
    const r = entry.result;
    if (r.title) newItems.push({ content: r.title, x: 0, y: 0, type: "central", elementType: "text_block", color: "transparent" });
    if (r.insights) r.insights.forEach((ins: string) => newItems.push({ content: ins, x: 0, y: 0, type: "sticky_note", color: palette[newItems.length % palette.length] }));
    if (r.tags) r.tags.forEach((tag: string) => newItems.push({ content: tag, x: 0, y: 0, type: "sticky_note", color: palette[newItems.length % palette.length] }));
    if (r.suggestions) r.suggestions.forEach((s: string) => newItems.push({ content: s, x: 0, y: 0, type: "sticky_note", color: palette[newItems.length % palette.length] }));
    if (r.description && newItems.length < 2) newItems.push({ content: r.description, x: 0, y: 0, type: "sticky_note", color: palette[0] });

    if (newItems.length === 0) { toast.error("No content to import"); return; }

    const organized = layoutType === "mindmap"
      ? organizeMindmap(newItems, canvasSize.w, canvasSize.h)
      : organizeGrid(newItems, gridDensity, canvasSize.w);
    // Create new board — never merge into existing
    setActiveSessionId(null);
    setInput(entry.result.title || entry.fileName || "Imported scan");
    setItems(organized);
    setPhase("board");
    setShowScanImport(false);

    // If scan has a palette, apply it
    if (r.palette) {
      const colors = Object.values(r.palette) as string[];
      setCustomPalette(colors);
      setActiveTheme("Custom");
    }

    toast.success(`Created new board from "${entry.result.title || entry.fileName || "scan"}"`);
  };

  // Apply a color theme to all items
  const applyTheme = useCallback((colors: string[], themeName: string) => {
    setActiveTheme(themeName);
    setCustomPalette(null);
    if (items.length === 0) return;
    setItems(prev => prev.map((item, i) => ({ ...item, color: item.elementType === "frame" || item.elementType === "text_block" ? "transparent" : colors[i % colors.length] })));
    toast.success(`Applied "${themeName}" theme`);
  }, [items]);

  const applyScannedPalette = useCallback(() => {
    if (!importedPalette) return;
    const colors = Object.values(importedPalette);
    setCustomPalette(colors);
    applyTheme(colors, "Scanned Palette");
  }, [importedPalette, applyTheme]);

  const applyCustomPalette = (colors: string[]) => {
    setCustomPalette(colors);
    setActiveTheme("Custom");
    if (items.length === 0) return;
    setItems(prev => prev.map((item, i) => ({ ...item, color: item.elementType === "frame" || item.elementType === "text_block" ? "transparent" : colors[i % colors.length] })));
  };

  const updateCustomColor = (idx: number, hex: string) => {
    const palette = customPalette ? [...customPalette] : getActivePalette();
    palette[idx] = hex;
    setCustomPalette(palette);
  };

  const importPalette = () => {
    if (!importedPalette) return;
    toast.success("Palette applied to board generation");
  };

  const reorganize = useCallback(() => {
    if (items.length === 0) return;
    let organized: LayoutItem[];
    if (layoutType === "mindmap") organized = organizeMindmap(items, canvasSize.w, canvasSize.h);
    else if (layoutType === "timeline") organized = organizeTimeline(items, canvasSize.w);
    else organized = organizeGrid(items, gridDensity, canvasSize.w);
    setItems(organized);
  }, [items, layoutType, gridDensity, canvasSize]);

  const handleConnectClick = (idx: number) => {
    if (!connectMode) return;
    if (connectFrom === null) { setConnectFrom(idx); }
    else {
      if (connectFrom !== idx) {
        setItems(prev => prev.map((item, i) => {
          if (i === connectFrom) {
            const existing = item.connectedTo || [];
            if (!existing.includes(idx)) return { ...item, connectedTo: [...existing, idx] };
          }
          return item;
        }));
      }
      setConnectFrom(null);
      setConnectMode(false);
    }
  };

  const startBoardCreation = () => {
    if (!input.trim()) return;
    setPhase("type-select");
  };

  const proceedFromTypeSelect = () => {
    askFollowUps();
  };

  const toggleBoardType = (id: string) => {
    setSelectedBoardTypes(prev => {
      if (id === "auto") return ["auto"];
      const without = prev.filter(t => t !== "auto");
      if (without.includes(id)) {
        const result = without.filter(t => t !== id);
        return result.length === 0 ? ["auto"] : result;
      }
      return [...without, id];
    });
  };

  const askFollowUps = useCallback(async () => {
    if (!input.trim()) return;
    setLoadingQs(true);
    setPhase("questions");

    const boardTypeDesc = selectedBoardTypes.includes("auto") ? "the best layout type" : selectedBoardTypes.join(", ");
    const scanContext = importedPalette ? `\n\nThe user has also scanned a moodboard with these extracted colors: ${JSON.stringify(importedPalette)}. Consider these aesthetics.` : "";
    const ideaContext = importedIdeas && importedIdeas.length > 0 ? `\n\nThe user has these ideas from a previous chat: ${importedIdeas.join(", ")}. Consider these.` : "";

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({
          messages: [{ role: "user", content: `The user wants to create a ${boardTypeDesc} board with ${layoutType} arrangement from this brain dump:\n\n"${input}"${scanContext}${ideaContext}\n\nAsk 3 short, specific follow-up questions to better understand their needs before generating the board. Questions should help clarify scope, priorities, audience, or context. Return ONLY a JSON array of strings like: ["Question 1?", "Question 2?", "Question 3?"]` }],
          mode: "ideation",
        }),
      });
      if (!resp.ok || !resp.body) throw new Error("Failed");
      const full = await readStream(resp);
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
  }, [input, layoutType, importedPalette, importedIdeas, selectedBoardTypes]);

  const answerQuestion = () => {
    const updated = [...followUps];
    updated[currentQ] = { ...updated[currentQ], answer: qAnswer };
    setFollowUps(updated);
    setQAnswer("");
    if (currentQ < followUps.length - 1) setCurrentQ(currentQ + 1);
    else generate(input, updated);
  };

  const skipQuestions = () => generate(input, followUps.filter(f => f.answer));

  const tailorBoard = useCallback(async () => {
    if (!tailorPrompt.trim() || items.length === 0) return;
    setTailoring(true);
    try {
      const paletteColors = getActivePalette();
      const currentBoard = JSON.stringify(items.map(i => ({ content: i.content, type: i.type, color: i.color })));
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({
          messages: [{ role: "user", content: `Here is the current board as JSON:\n${currentBoard}\n\nThe user wants to modify it: "${tailorPrompt}"\n\nAvailable colors: ${paletteColors.join(", ")}\n\nReturn the updated board as a JSON array. Each item: {"content": "text", "x": number, "y": number, "type": "sticky_note"|"central"|"branch"|"leaf"|"milestone"|"event", "color": "#hex", "connectedTo": [indices]}\nOrganize cleanly. Return ONLY the JSON array.` }],
          mode: "layout",
        }),
      });
      if (!resp.ok || !resp.body) throw new Error("Failed");
      const full = await readStream(resp);
      const cleaned = full.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) { setItems(parsed); toast.success("Board updated!"); }
    } catch (e) { console.error(e); toast.error("Failed to tailor board"); }
    finally { setTailoring(false); setTailorPrompt(""); }
  }, [tailorPrompt, items, getActivePalette]);

  const generate = useCallback(async (braindump: string, answers: FollowUpQ[]) => {
    setPhase("generating");
    setGenerating(true);
    setStatus("Crystallizing thoughts...");

    const context = answers.filter(a => a.answer).map(a => `Q: ${a.question}\nA: ${a.answer}`).join("\n\n");
    const paletteColors = getActivePalette();

    const scanContext = importedPalette ? `\nThe user scanned a moodboard and extracted: ${JSON.stringify(importedPalette)}. Use these colors.` : "";
    const ideaContext = importedIdeas && importedIdeas.length > 0 ? `\nThe user also brainstormed these ideas in chat: ${importedIdeas.join("; ")}. Integrate relevant ones.` : "";

    // Board type instructions
    const boardTypeDesc = selectedBoardTypes.includes("auto") ? "" : `\n\nThe user specifically wants these board types: ${selectedBoardTypes.join(", ")}. ${
      selectedBoardTypes.includes("flowchart") ? "Use shape_rect for processes, shape_diamond for decisions, and connectedTo for flow arrows." : ""
    }${selectedBoardTypes.includes("kanban") ? "Create columns (use frame elements) with sticky notes inside for To-do, In Progress, Done." : ""
    }${selectedBoardTypes.includes("swot") ? "Create 4 quadrant frames: Strengths, Weaknesses, Opportunities, Threats. Place relevant sticky notes inside each." : ""
    }${selectedBoardTypes.includes("mixed") ? "Use a variety of element types: sticky_note, shape_rect, shape_circle, shape_diamond, text_block, frame." : ""
    }`;

    try {
      const colorInstructions = `Use these colors: ${paletteColors.join(", ")}`;
      const cols = gridDensity + 1;
      const spacingX = Math.floor(canvasSize.w / (cols + 0.5));

      const elementTypeInstruction = `\nEach item can have an optional "elementType" field: "sticky_note"|"shape_rect"|"shape_circle"|"shape_diamond"|"text_block"|"frame". Also optional "width" and "height" numbers.`;

      const layoutPrompts: Record<string, string> = {
        grid: `Organize into a clean ${cols}-column grid. Analyze the content deeply — identify relationships, hierarchies, and dependencies. If there are URLs, understand what they represent and label them meaningfully (don't just paste raw URLs). Use connectedTo to show logical relationships between items. Use different elementTypes to show hierarchy: text_block for headings, frame for groups, shape_diamond for decisions, shape_rect for processes, sticky_note for ideas.\n\nReturn ONLY a JSON array:\n{"content": "text", "x": number, "y": number, "type": "sticky_note", "color": "#hex", "connectedTo": [indices of related items], "elementType": "sticky_note"|"shape_rect"|"shape_diamond"|"text_block"|"frame", "width": number, "height": number}\nStart x at 40, spacing ${spacingX}px horizontally, 180px vertically. ${colorInstructions}. Max 12 items.`,
        mindmap: `Create a radial mindmap. Analyze the content deeply — the center should be the core concept, branches should be logical categories, not just random splits. If URLs are present, understand their purpose. Use connectedTo to build a proper tree structure.\n\nCenter node at x:${Math.floor(canvasSize.w / 2)}, y:${Math.floor(canvasSize.h / 2)}.\nBranches radiate outward at ~${Math.floor(Math.min(canvasSize.w, canvasSize.h) * 0.3)}px distance.\nEach: {"content": "text", "x": number, "y": number, "type": "central"|"branch"|"leaf", "color": "#hex", "connectedTo": [parent_index], "elementType": "sticky_note"|"shape_rect"|"text_block", "width": number, "height": number}\n${colorInstructions}. Max 15 items.`,
        timeline: `Create a horizontal timeline. Identify chronological or sequential order from the content. If URLs exist, place them as milestones with descriptive labels. Every item should connect to the previous.\n\nItems flow left to right, x starting at 60, increment by 250px.\ny alternates between 100 and 280.\nEach: {"content": "text", "x": number, "y": number, "type": "milestone"|"event", "color": "#hex", "connectedTo": [previous_index], "elementType": "sticky_note"|"shape_rect"|"text_block", "width": number, "height": number}\n${colorInstructions}. Max 10 items.`,
      };

      const fullPrompt = `${layoutPrompts[layoutType]}${boardTypeDesc}${scanContext}${ideaContext}\n\n${context ? `Additional context:\n${context}\n\n` : ""}Content to organize:\n${braindump}\n\nReturn ONLY a valid JSON array.`;

      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({ messages: [{ role: "user", content: fullPrompt }], mode: "layout" }),
      });

      if (!resp.ok || !resp.body) throw new Error("Failed");
      const full = await readStream(resp);
      const cleaned = full.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      const newItems = Array.isArray(parsed) ? parsed : [];
      // Always write to a fresh board context — never merge with previous
      setActiveSessionId(null);
      setItems(newItems);
      setPhase("board");
      setStatus("");
    } catch (e) {
      console.error(e);
      setStatus("Generation failed. Try again.");
      setPhase("input");
    } finally { setGenerating(false); }
  }, [layoutType, importedPalette, importedIdeas, gridDensity, canvasSize, getActivePalette, selectedBoardTypes]);

  const saveSession = () => { doAutoSave(); toast.success("Board saved!"); };

  const loadSession = (session: PreviewSession) => {
    setInput(session.input);
    setItems(session.items);
    setLayoutType(session.layoutType as any);
    setFollowUps(session.followUps || []);
    setActiveSessionId(session.id);
    setGridDensity(session.gridDensity || 3);
    setPhase(session.items.length > 0 ? "board" : "input");
    setShowSessions(false);
  };

  const newSession = () => {
    setInput(""); setItems([]); setFollowUps([]); setActiveSessionId(null); setPhase("input"); setShowSessions(false);
  };

  const deleteSession = (id: string) => {
    setSessions(prev => prev.filter(s => s.id !== id));
    if (activeSessionId === id) { setItems([]); setActiveSessionId(null); setPhase("input"); }
    toast.success("Board deleted");
  };

  const addElement = (elType?: LayoutItem["elementType"]) => {
    const type = elType || addElementType || "sticky_note";
    const palette = getActivePalette();
    const defaults: Record<string, Partial<LayoutItem>> = {
      sticky_note: { content: "New note", width: 140, height: 100 },
      shape_rect: { content: "Process", width: 160, height: 80 },
      shape_circle: { content: "Node", width: 120, height: 120 },
      shape_diamond: { content: "Decision?", width: 140, height: 140 },
      text_block: { content: "Heading text", width: 200, height: 60 },
      frame: { content: "Section", width: 300, height: 250 },
    };
    const def = defaults[type] || defaults.sticky_note;
    const newItem: LayoutItem = {
      content: def.content || "New",
      x: 50 + Math.random() * 400, y: 50 + Math.random() * 300,
      type: type, elementType: type as LayoutItem["elementType"],
      color: type === "frame" || type === "text_block" ? "transparent" : palette[Math.floor(Math.random() * palette.length)],
      width: def.width, height: def.height,
    };
    setItems(prev => [...prev, newItem]);
  };

  const updateItem = (idx: number, updates: Partial<LayoutItem>) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, ...updates } : item));
  };

  const deleteItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx).map(item => ({
      ...item, connectedTo: item.connectedTo?.filter(c => c !== idx).map(c => c > idx ? c - 1 : c),
    })));
    setEditingIdx(null);
  };

  const layoutOptions = [
    { value: "grid" as const, label: "Architect", desc: "Grid-based layout", icon: Layout },
    { value: "mindmap" as const, label: "Gardener", desc: "Mind map structure", icon: GitBranch },
    { value: "timeline" as const, label: "Pilot", desc: "Timeline arrangement", icon: Clock },
  ];

  const densityLabel = gridDensity <= 1 ? "2×2" : gridDensity === 2 ? "3×3" : gridDensity === 3 ? "4×4" : gridDensity === 4 ? "5×5" : "6×6";

  const currentPalette = customPalette || getActivePalette();

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left sidebar */}
      <div className="hidden lg:flex w-64 xl:w-72 flex-col border-r border-border/30 overflow-y-auto scrollbar-thin shrink-0">
        {/* Sessions */}
        <div className="p-4 border-b border-border/20">
          <div className="flex items-center justify-between mb-2">
            <button onClick={() => setShowSessions(!showSessions)} className="flex items-center gap-1.5 text-xs text-foreground/70 hover:text-foreground transition-colors">
              <FolderOpen className="w-3 h-3" />
              <span className="font-medium">Saved Boards</span>
              {sessions.length > 0 && <span className="text-[10px] bg-secondary rounded-full px-1.5 text-foreground/60">{sessions.length}</span>}
            </button>
            <button onClick={newSession} className="text-xs text-accent font-medium hover:text-accent/80 transition-colors">+ New</button>
          </div>
          <AnimatePresence>
            {showSessions && sessions.length > 0 && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="space-y-1 max-h-[180px] overflow-y-auto scrollbar-thin">
                  {sessions.map(s => (
                    <div key={s.id} className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs transition-colors group ${
                      activeSessionId === s.id ? "bg-accent/10 text-accent" : "bg-secondary/50 hover:bg-secondary text-foreground"
                    }`}>
                      <button onClick={() => loadSession(s)} className="flex-1 text-left min-w-0">
                        <span className="truncate block font-medium">{s.name}</span>
                        <span className="text-[10px] text-foreground/50 capitalize">{s.layoutType} · {new Date(s.date).toLocaleDateString()}</span>
                      </button>
                      <button onClick={() => deleteSession(s.id)} className="opacity-0 group-hover:opacity-100 text-foreground/30 hover:text-destructive transition-all shrink-0">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="p-4 space-y-5">
          {/* Layout DNA */}
          <div>
            <h4 className="text-serif text-sm mb-3 text-foreground">Layout DNA</h4>
            <div className="flex gap-2">
              {layoutOptions.map(({ value, label, desc, icon: Icon }) => (
                <button key={value} onClick={() => setLayoutType(value)}
                  className={`flex-1 flex flex-col items-center gap-1.5 p-3 rounded-xl text-xs transition-all ${
                    layoutType === value ? "bg-accent/10 text-accent border border-accent/20" : "bg-secondary/50 text-foreground/70 hover:bg-secondary border border-transparent"
                  }`}>
                  <Icon className="w-5 h-5" />
                  <span className="font-medium">{label}</span>
                  <span className="text-[9px] text-foreground/40 leading-tight text-center">{desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Grid Density */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-serif text-sm text-foreground">Grid Density</h4>
              <span className="text-xs text-foreground/60 font-mono">{densityLabel}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-foreground/50">Sparse</span>
              <Slider value={[gridDensity]} onValueChange={(v) => setGridDensity(v[0])} min={1} max={5} step={1} className="flex-1" />
              <span className="text-[10px] text-foreground/50">Dense</span>
            </div>
            {phase === "board" && items.length > 0 && (
              <button onClick={reorganize} className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary/50 text-xs text-foreground hover:bg-secondary transition-colors">
                <Sliders className="w-3 h-3 text-accent" />
                Reorganize Board
              </button>
            )}
          </div>

          {/* Active Palette — Editable */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-serif text-sm text-foreground">Palette</h4>
              {customPalette && (
                <button onClick={() => { setCustomPalette(null); setEditingColorIdx(null); }} className="text-[10px] text-foreground/50 hover:text-foreground transition-colors">Reset</button>
              )}
            </div>
            <div className="grid grid-cols-6 gap-1.5 mb-2">
              {currentPalette.slice(0, 6).map((hex, i) => (
                <div key={i} className="relative group/color">
                  <div
                    className={`w-full aspect-square rounded-lg border cursor-pointer hover:scale-110 transition-transform ${editingColorIdx === i ? "ring-2 ring-accent border-accent/30" : "border-border/50"}`}
                    style={{ backgroundColor: hex }}
                    onClick={() => setEditingColorIdx(editingColorIdx === i ? null : i)}
                  />
                  {editingColorIdx === i && (
                    <div className="absolute top-full left-0 z-50 mt-1">
                      <input
                        type="color"
                        value={hex}
                        onChange={(e) => updateCustomColor(i, e.target.value)}
                        className="w-8 h-6 border-none cursor-pointer rounded"
                        autoFocus
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
            {items.length > 0 && customPalette && (
              <button onClick={() => applyCustomPalette(customPalette)} className="w-full text-[10px] text-accent hover:underline">
                Apply edited palette to board
              </button>
            )}
          </div>

          {/* Import from Scan */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-serif text-sm text-foreground">Import from Scan</h4>
              <button onClick={() => { setScanHistory(loadScanHistory()); setShowScanImport(!showScanImport); }} className="text-[10px] text-accent font-medium hover:underline">
                {showScanImport ? "Hide" : `Show (${scanHistory.length})`}
              </button>
            </div>
            <AnimatePresence>
              {showScanImport && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  {scanHistory.length === 0 ? (
                    <p className="text-[11px] text-foreground/40 py-2">No scans yet. Go to Scan tab to analyze files.</p>
                  ) : (
                    <div className="space-y-1 max-h-[200px] overflow-y-auto scrollbar-thin">
                      {scanHistory.slice(0, 10).map(entry => (
                        <button
                          key={entry.id}
                          onClick={() => importScanEntry(entry)}
                          className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors text-left"
                        >
                          <Upload className="w-3 h-3 text-accent shrink-0" />
                          <div className="min-w-0 flex-1">
                            <span className="text-xs font-medium text-foreground truncate block">
                              {entry.result?.title || entry.result?.mood || entry.fileName || "Scan"}
                            </span>
                            <span className="text-[10px] text-foreground/40">{new Date(entry.date).toLocaleDateString()}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Import buttons */}
          {((importedIdeas && importedIdeas.length > 0) || importedPalette) && (
            <div>
              <h4 className="text-serif text-sm mb-2 text-foreground">Import Data</h4>
              {importedIdeas && importedIdeas.length > 0 && (
                <button onClick={importIdeas} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/50 text-xs text-foreground hover:bg-secondary transition-colors mb-1.5">
                  <Import className="w-3 h-3 text-accent" />
                  Import {importedIdeas.length} ideas from chat
                </button>
              )}
              {importedPalette && (
                <button onClick={applyScannedPalette} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/50 text-xs text-foreground hover:bg-secondary transition-colors">
                  <Palette className="w-3 h-3 text-accent" />
                  Apply scanned palette
                </button>
              )}
            </div>
          )}

          {/* Convert — in left sidebar */}
          {phase === "board" && items.length > 0 && (
            <div className="pt-2 border-t border-border/20">
              <button onClick={() => setShowConvert(true)} className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-accent/10 text-accent text-xs font-medium hover:bg-accent/15 transition-colors">
                <FileOutput className="w-3.5 h-3.5" />
                Convert to Slides / Doc
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Center — Canvas area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/30 shrink-0">
          <div className="flex items-center gap-2">
             {phase === "board" && (
              <>
                {/* Element type picker */}
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs hover:opacity-90 transition-opacity">
                      <Plus className="w-3 h-3" />
                      Add
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-2" align="start">
                    <p className="text-[10px] font-medium text-foreground/60 mb-1.5 px-2">Elements</p>
                    {ELEMENT_TYPES.map(el => {
                      const Icon = el.icon;
                      return (
                        <button key={el.id} onClick={() => addElement(el.id)} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs hover:bg-secondary transition-colors">
                          <Icon className="w-3.5 h-3.5 text-accent" />
                          <div>
                            <span className="font-medium text-foreground">{el.label}</span>
                            <span className="text-[9px] text-foreground/50 ml-1.5">{el.desc}</span>
                          </div>
                        </button>
                      );
                    })}
                  </PopoverContent>
                </Popover>

                <button onClick={() => { setConnectMode(!connectMode); setConnectFrom(null); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                    connectMode ? "bg-accent text-accent-foreground" : "bg-secondary text-foreground/70 hover:bg-secondary/80"
                  }`}>
                  <Link2 className="w-3 h-3" />
                  Connect
                </button>

                {/* Board Color Theme Picker */}
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-foreground/70 text-xs hover:bg-secondary/80 transition-colors">
                      <Palette className="w-3 h-3" />
                      Colors
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-3" align="start">
                    <p className="text-xs font-medium text-foreground mb-2">Board Theme</p>
                    <div className="space-y-1.5 max-h-52 overflow-y-auto scrollbar-thin">
                      {BOARD_THEMES.map(theme => (
                        <button key={theme.name} onClick={() => applyTheme(theme.colors, theme.name)}
                          className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs transition-colors ${
                            activeTheme === theme.name && !customPalette ? "bg-accent/10 text-accent" : "hover:bg-secondary text-foreground"
                          }`}>
                          <div className="flex gap-0.5 shrink-0">
                            {theme.colors.slice(0, 4).map((c, i) => (
                              <div key={i} className="w-3.5 h-3.5 rounded-sm border border-border/40" style={{ backgroundColor: c }} />
                            ))}
                          </div>
                          <span>{theme.name}</span>
                        </button>
                      ))}
                      {importedPalette && (
                        <>
                          <div className="h-px bg-border/50 my-1.5" />
                          <button onClick={applyScannedPalette}
                            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs transition-colors ${
                              activeTheme === "Scanned Palette" ? "bg-accent/10 text-accent" : "hover:bg-secondary text-foreground"
                            }`}>
                            <div className="flex gap-0.5 shrink-0">
                              {Object.values(importedPalette).slice(0, 4).map((c, i) => (
                                <div key={i} className="w-3.5 h-3.5 rounded-sm border border-border/40" style={{ backgroundColor: c }} />
                              ))}
                            </div>
                            <span className="text-accent">✦ From Moodboard</span>
                          </button>
                        </>
                      )}
                    </div>
                    <div className="mt-2 pt-2 border-t border-border/30">
                      <p className="text-[10px] text-foreground/60 mb-1.5">Per-note color</p>
                      <div className="flex gap-1.5 flex-wrap">
                        {STICKY_COLORS.map(c => (
                          <button key={c.hex} onClick={() => { if (editingIdx !== null) updateItem(editingIdx, { color: c.hex }); }}
                            className="w-5 h-5 rounded-full border border-border/50 hover:scale-125 transition-transform"
                            style={{ backgroundColor: c.hex }} title={`${c.name} (select a note first)`} />
                        ))}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>

                {/* Convert button moved to left sidebar */}
              </>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {lastSaved && (
              <span className="text-[10px] text-foreground/50 mr-2 hidden sm:inline">
                Saved {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button onClick={zoomOut} className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors">
              <ZoomOut className="w-3.5 h-3.5 text-foreground/50" />
            </button>
            <span className="text-xs text-foreground/60 font-mono w-10 text-center">{zoom}%</span>
            <button onClick={zoomIn} className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors">
              <ZoomIn className="w-3.5 h-3.5 text-foreground/50" />
            </button>
            <button onClick={expandCanvas} className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors ml-1" title="Expand canvas">
              <Maximize2 className="w-3.5 h-3.5 text-foreground/50" />
            </button>
            <button onClick={shrinkCanvas} className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors" title="Shrink canvas">
              <Minimize2 className="w-3.5 h-3.5 text-foreground/50" />
            </button>
          </div>
        </div>

        {/* Main canvas */}
        <div className="flex-1 overflow-hidden p-4" style={{ minHeight: 0 }}>
          <AnimatePresence mode="wait">
            {/* Phase: Input */}
            {phase === "input" && (
              <motion.div key="input" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="max-w-xl mx-auto pt-12 space-y-4">
                <div className="text-center mb-6">
                  <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-4">
                    <Sparkles className="w-6 h-6 text-accent" />
                  </div>
                  <h2 className="text-serif text-2xl mb-2 text-foreground">Create a board</h2>
                  <p className="text-sm text-foreground/60">Brain dump your ideas and AI will organize them into a visual layout</p>
                  {(importedIdeas && importedIdeas.length > 0) && (
                    <p className="text-xs text-accent mt-2">✦ {importedIdeas.length} ideas from chat ready to integrate</p>
                  )}
                  {importedPalette && (
                    <p className="text-xs text-accent mt-1">✦ Moodboard palette will be applied</p>
                  )}
                </div>
                <textarea
                  value={input} onChange={(e) => setInput(e.target.value)}
                  placeholder="Brain dump your ideas here... URLs, notes, anything."
                  rows={5}
                  className="w-full bg-transparent border border-border rounded-xl p-4 text-sm text-foreground outline-none focus:ring-1 focus:ring-accent/40 resize-none placeholder:text-foreground/30"
                />
                <button onClick={startBoardCreation} disabled={!input.trim()}
                  className="w-full px-4 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-40">
                  <Sparkles className="w-4 h-4" />Generate Board
                </button>

                {/* Import from Scan shortcut */}
                {scanHistory.length > 0 && (
                  <div className="mt-4">
                    <h5 className="text-serif text-sm text-foreground/70 mb-2">Import from Scan</h5>
                    <div className="space-y-1">
                      {scanHistory.slice(0, 3).map(entry => (
                        <button key={entry.id} onClick={() => importScanEntry(entry)} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors text-left text-xs">
                          <Upload className="w-3 h-3 text-accent shrink-0" />
                          <span className="text-foreground truncate">{entry.result?.title || entry.fileName || "Scan"}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {sessions.length > 0 && (
                  <div className="mt-6">
                    <h5 className="text-serif text-sm text-foreground/70 mb-3">Recent Boards</h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {sessions.slice(0, 6).map(s => (
                        <div key={s.id} className="flex items-center gap-1 p-3 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors text-xs group">
                          <button onClick={() => loadSession(s)} className="flex-1 text-left min-w-0">
                            <span className="text-foreground truncate block font-medium">{s.name}</span>
                            <span className="text-foreground/40 capitalize">{s.layoutType} · {new Date(s.date).toLocaleDateString()}</span>
                          </button>
                          <button onClick={() => deleteSession(s.id)} className="opacity-0 group-hover:opacity-100 text-foreground/30 hover:text-destructive transition-all shrink-0">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* Phase: Board Type Selection */}
            {phase === "type-select" && (
              <motion.div key="type-select" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="max-w-lg mx-auto pt-12 space-y-4">
                <div className="text-center mb-4">
                  <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-3">
                    <Layout className="w-5 h-5 text-accent" />
                  </div>
                  <h3 className="text-serif text-xl mb-1 text-foreground">What kind of board?</h3>
                  <p className="text-xs text-foreground/50">Pick one or more — you can combine styles</p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {BOARD_TYPES.map(bt => {
                    const isSelected = selectedBoardTypes.includes(bt.id);
                    return (
                      <button key={bt.id} onClick={() => toggleBoardType(bt.id)}
                        className={`flex items-start gap-2.5 px-3 py-3 rounded-xl text-left text-xs transition-all ${
                          isSelected ? "bg-accent/10 text-accent border border-accent/20" : "bg-secondary/50 text-foreground/70 hover:bg-secondary border border-transparent"
                        }`}>
                        <span className="text-base mt-0.5">{bt.emoji}</span>
                        <div>
                          <span className="font-medium block">{bt.label}</span>
                          <span className="text-[10px] text-foreground/40 leading-snug block">{bt.desc}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="flex gap-2 pt-2">
                  <button onClick={proceedFromTypeSelect} disabled={loadingQs}
                    className="flex-1 px-4 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-40">
                    {loadingQs ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /><span className="animate-pulse-slow">Thinking...</span></>
                    ) : (
                      <><Sparkles className="w-4 h-4" />Continue</>
                    )}
                  </button>
                  <button onClick={() => setPhase("input")} className="px-4 py-3 rounded-xl border border-border text-sm text-foreground/60 hover:bg-secondary transition-colors">Back</button>
                </div>
              </motion.div>
            )}

            {/* Phase: Follow-up Questions */}
            {phase === "questions" && !loadingQs && followUps.length > 0 && (
              <motion.div key="questions" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="max-w-lg mx-auto pt-12 space-y-4">
                <div className="text-center mb-4">
                  <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-3">
                    <MessageSquare className="w-5 h-5 text-accent" />
                  </div>
                  <h3 className="text-serif text-xl mb-1 text-foreground">Quick questions</h3>
                  <p className="text-xs text-foreground/50">To personalize your board</p>
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
                  <textarea value={qAnswer} onChange={(e) => setQAnswer(e.target.value)}
                    placeholder="Your answer..." rows={3}
                    className="w-full bg-transparent border border-border rounded-lg p-3 text-sm text-foreground outline-none focus:ring-1 focus:ring-accent/40 resize-none placeholder:text-foreground/30"
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); answerQuestion(); } }}
                    autoFocus />
                  <div className="flex gap-2 mt-3">
                    <button onClick={answerQuestion} disabled={!qAnswer.trim()} className="flex-1 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40">
                      {currentQ < followUps.length - 1 ? "Next" : "Generate Board"}
                    </button>
                    <button onClick={skipQuestions} className="px-4 py-2.5 rounded-lg border border-border text-sm text-foreground/60 hover:bg-secondary transition-colors">Skip</button>
                  </div>
                </div>

                {currentQ > 0 && (
                  <div className="space-y-2">
                    {followUps.slice(0, currentQ).filter(f => f.answer).map((f, i) => (
                      <div key={i} className="bg-secondary/50 rounded-lg px-3 py-2 text-xs">
                        <p className="text-foreground/50">{f.question}</p>
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
                <p className="text-sm text-foreground/60 animate-pulse-slow">{status || "Generating your board..."}</p>
              </motion.div>
            )}

            {/* Phase: Board */}
            {phase === "board" && items.length > 0 && (
              <motion.div key="board" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="h-full flex flex-col gap-3 min-h-0">
                <div className="flex-1 min-h-0 relative">
                <InteractiveBoard
                  items={items} layoutType={layoutType} editingIdx={editingIdx} onEditIdx={setEditingIdx}
                  onUpdateItem={updateItem} onDeleteItem={deleteItem} dragIdx={dragIdx} onDragIdx={setDragIdx}
                  zoom={zoom} onZoomChange={setZoom} canvasWidth={canvasSize.w} canvasHeight={canvasSize.h}
                  connectMode={connectMode} connectFrom={connectFrom} onConnectClick={handleConnectClick}
                />
                </div>

                {/* Tailor with AI */}
                <div className="glass rounded-xl p-3 flex gap-2 items-center shrink-0">
                  <Wand2 className="w-4 h-4 text-accent shrink-0" />
                  <input value={tailorPrompt} onChange={(e) => setTailorPrompt(e.target.value)}
                    placeholder="Tailor this board... (e.g. 'add more detail to marketing', 'regroup by priority')"
                    className="flex-1 bg-transparent border-none outline-none text-xs text-foreground placeholder:text-foreground/30"
                    onKeyDown={(e) => { if (e.key === "Enter") tailorBoard(); }} />
                  <button onClick={tailorBoard} disabled={!tailorPrompt.trim() || tailoring}
                    className="px-3 py-1.5 rounded-lg bg-accent text-accent-foreground text-xs font-medium disabled:opacity-40 hover:opacity-90 transition-opacity shrink-0">
                    {tailoring ? <Loader2 className="w-3 h-3 animate-spin" /> : "Apply"}
                  </button>
                </div>

                {/* Actions */}
                <div className="flex gap-2 flex-wrap shrink-0">
                  <button onClick={() => onPushToMiro?.(items)} className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-medium flex items-center justify-center gap-2 hover:opacity-90 transition-opacity">Push to Miro</button>
                  <button onClick={saveSession} className="px-4 py-2.5 rounded-xl border border-accent/30 text-xs text-accent hover:bg-accent/5 transition-colors flex items-center gap-1.5">
                    <Save className="w-3 h-3" />Save
                  </button>
                  <button onClick={() => setPhase("input")} className="px-4 py-2.5 rounded-xl border border-border text-xs text-foreground/60 hover:bg-secondary transition-colors flex items-center gap-1.5">
                    <RotateCcw className="w-3 h-3" />New Board
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Right sidebar */}
      <div className="hidden lg:flex w-64 xl:w-72 flex-col border-l border-border/30 p-4 gap-4 overflow-y-auto scrollbar-thin shrink-0">
        <div className="glass rounded-xl p-4">
          <h4 className="text-serif text-sm mb-3 text-foreground">Preview Statistics</h4>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Total Elements", value: items.length, icon: "✦" },
              { label: "Sticky Notes", value: items.filter(i => i.type === "sticky_note" || i.type === "leaf").length, icon: "◻" },
              { label: "Connectors", value: items.reduce((acc, i) => acc + (i.connectedTo?.length || 0), 0), icon: "↗" },
              { label: "Layout", value: layoutType, icon: "⊞" },
            ].map((s) => (
              <div key={s.label} className="bg-secondary/50 rounded-lg p-3 text-center">
                <p className="text-lg font-medium text-foreground">{s.value}</p>
                <p className="text-[10px] text-foreground/50">{s.label}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between text-xs text-foreground/50 mt-3 pt-3 border-t border-border/30">
            <span>Canvas</span>
            <span className="font-mono">{canvasSize.w} × {canvasSize.h}</span>
          </div>
        </div>

        {/* Board Colors */}
        {items.length > 0 && (
          <div className="glass rounded-xl p-4">
            <h4 className="text-serif text-sm mb-3 text-foreground">Board Colors</h4>
            <div className="flex flex-wrap gap-1.5">
              {[...new Set(items.map(i => i.color).filter(Boolean))].map(hex => (
                <div key={hex} className="w-6 h-6 rounded-lg border border-border/50" style={{ backgroundColor: hex }} title={hex} />
              ))}
            </div>
          </div>
        )}

        <div className="glass rounded-xl p-4">
          <h4 className="text-serif text-sm mb-2 text-foreground">Auto-Save</h4>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${phase === "board" && items.length > 0 ? "bg-accent animate-pulse" : "bg-border"}`} />
            <span className="text-xs text-foreground/60">
              {lastSaved ? `Last saved ${lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : "Not saved yet"}
            </span>
          </div>
          <p className="text-[10px] text-foreground/40 mt-1">Boards auto-save 3s after changes</p>
        </div>

        <div className="glass rounded-xl p-4">
          <h4 className="text-serif text-sm mb-2 text-foreground">Tips</h4>
          <div className="space-y-1.5 text-[11px] text-foreground/50">
            <p>• Double-click notes to edit</p>
            <p>• Drag to reposition</p>
            <p>• Use Connect mode to link notes</p>
            <p>• Use the AI tailor bar to refine</p>
            <p>• Edit palette colors in the sidebar</p>
          </div>
        </div>
      </div>

      {/* Convert Dialog */}
      <AnimatePresence>
        {showConvert && (
          <ConvertDialog items={items} onClose={() => setShowConvert(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}

// SSE stream reader utility
async function readStream(resp: Response): Promise<string> {
  const reader = resp.body!.getReader();
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
  return full;
}

/* ── Interactive Board with Pan & Zoom ── */

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
  onZoomChange: (z: number) => void;
  canvasWidth: number;
  canvasHeight: number;
  connectMode: boolean;
  connectFrom: number | null;
  onConnectClick: (idx: number) => void;
}

function InteractiveBoard({ items, layoutType, editingIdx, onEditIdx, onUpdateItem, onDeleteItem, dragIdx, onDragIdx, zoom, onZoomChange, canvasWidth, canvasHeight, connectMode, connectFrom, onConnectClick }: BoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const scale = zoom / 100;
  const displayW = canvasWidth * scale;
  const displayH = canvasHeight * scale;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -10 : 10;
        onZoomChange(Math.max(30, Math.min(250, zoom + delta)));
      } else {
        setPan(p => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
      }
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [zoom, onZoomChange]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.key === "=" || e.key === "+") { e.preventDefault(); onZoomChange(Math.min(250, zoom + 10)); }
      if (e.key === "-") { e.preventDefault(); onZoomChange(Math.max(30, zoom - 10)); }
      if (e.key === "0") { e.preventDefault(); onZoomChange(100); setPan({ x: 0, y: 0 }); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [zoom, onZoomChange]);

  const handleContainerPointerDown = (e: React.PointerEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey) || (e.button === 0 && !connectMode)) {
      e.preventDefault();
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }
  };

  const handleContainerPointerMove = (e: React.PointerEvent) => {
    if (isPanning) {
      setPan({ x: panStart.current.panX + (e.clientX - panStart.current.x), y: panStart.current.panY + (e.clientY - panStart.current.y) });
      return;
    }
    if (dragIdx === null) return;
    const board = boardRef.current;
    if (!board) return;
    const rect = board.getBoundingClientRect();
    const x = Math.max(0, Math.min(canvasWidth - 100, ((e.clientX - rect.left - dragOffset.x) / displayW) * canvasWidth));
    const y = Math.max(0, Math.min(canvasHeight - 50, ((e.clientY - rect.top - dragOffset.y) / displayH) * canvasHeight));
    onUpdateItem(dragIdx, { x, y });
  };

  const handleContainerPointerUp = () => { setIsPanning(false); onDragIdx(null); };

  const handleNotePointerDown = (e: React.PointerEvent, idx: number) => {
    if (connectMode) { onConnectClick(idx); return; }
    if (editingIdx === idx) return;
    const board = boardRef.current;
    if (!board) return;
    const rect = board.getBoundingClientRect();
    const item = items[idx];
    setDragOffset({ x: e.clientX - rect.left - (item.x / canvasWidth) * displayW, y: e.clientY - rect.top - (item.y / canvasHeight) * displayH });
    onDragIdx(idx);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    e.stopPropagation();
  };

  // Build connectors with hierarchy-based weight
  const connectors: { x1: number; y1: number; x2: number; y2: number; idx: number; weight: "primary" | "secondary" }[] = [];
  const connectionCounts = new Map<string, number>();
  items.forEach((item, i) => {
    if (item.connectedTo) {
      item.connectedTo.forEach(targetIdx => {
        if (targetIdx >= 0 && targetIdx < items.length && targetIdx !== i) {
          const key = `${Math.min(i, targetIdx)}-${Math.max(i, targetIdx)}`;
          if (!connectionCounts.has(key)) {
            connectionCounts.set(key, 0);
            const srcW = (item.width || 140) / 2;
            const srcH = (item.height || 100) / 2;
            const tgt = items[targetIdx];
            const tgtW = (tgt.width || 140) / 2;
            const tgtH = (tgt.height || 100) / 2;
            // Determine primary (central/branch) vs secondary
            const isPrimary = item.type === "central" || tgt.type === "central" || item.type === "branch" || tgt.type === "branch";
            connectors.push({
              x1: item.x + srcW, y1: item.y + srcH,
              x2: tgt.x + tgtW, y2: tgt.y + tgtH,
              idx: i, weight: isPrimary ? "primary" : "secondary",
            });
          }
        }
      });
    }
  });

  return (
    <div ref={containerRef}
      className={`glass rounded-xl relative overflow-hidden select-none ${connectMode ? "cursor-crosshair" : isPanning ? "cursor-grabbing" : "cursor-default"}`}
      style={{ width: "100%", height: "100%", minHeight: 400 }}
      onPointerDown={handleContainerPointerDown} onPointerMove={handleContainerPointerMove} onPointerUp={handleContainerPointerUp}
      onClick={() => { if (!connectMode) onEditIdx(null); }}>
      <div className="absolute bottom-3 left-3 z-50 text-[10px] text-foreground/25 pointer-events-none">
        Scroll to pan · Ctrl+Scroll to zoom · +/- keys · 0 to reset
      </div>

      <div ref={boardRef} className="absolute" style={{ width: displayW, height: displayH, transform: `translate(${pan.x}px, ${pan.y}px)`, transformOrigin: "0 0" }}>
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: "radial-gradient(circle, hsl(var(--foreground)) 1px, transparent 1px)",
          backgroundSize: `${24 * scale}px ${24 * scale}px`,
        }} />

        {connectMode && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 glass rounded-full px-4 py-1.5 text-xs text-accent flex items-center gap-2">
            <Link2 className="w-3 h-3" />
            {connectFrom !== null ? "Click target note to connect" : "Click first note to start connection"}
          </div>
        )}

        <svg className="absolute inset-0 pointer-events-none" width={displayW} height={displayH}>
          <defs>
            <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="hsl(var(--accent))" opacity="0.5" />
            </marker>
          </defs>
          {connectors.map((c, i) => {
            const sx = (c.x1 / canvasWidth) * displayW;
            const sy = (c.y1 / canvasHeight) * displayH;
            const ex = (c.x2 / canvasWidth) * displayW;
            const ey = (c.y2 / canvasHeight) * displayH;
            const isPrimary = c.weight === "primary";
            // Orthogonal routing: go horizontal first, then vertical
            const midX = (sx + ex) / 2;
            return (
              <g key={i}>
                <path
                  d={`M ${sx} ${sy} C ${midX} ${sy}, ${midX} ${ey}, ${ex} ${ey}`}
                  fill="none"
                  stroke="hsl(var(--accent))"
                  strokeWidth={isPrimary ? 1.8 : 1}
                  strokeDasharray={isPrimary ? "none" : "5 4"}
                  opacity={isPrimary ? 0.45 : 0.25}
                  markerEnd="url(#arrowhead)"
                />
              </g>
            );
          })}
        </svg>

        {items.map((item, i) => (
          <StickyNote key={i} item={item} index={i} isEditing={editingIdx === i} isDragging={dragIdx === i}
            isConnectTarget={connectMode && connectFrom !== null && connectFrom !== i} isConnectSource={connectFrom === i}
            onPointerDown={(e) => handleNotePointerDown(e, i)} onEdit={() => onEditIdx(i)}
            onUpdate={(updates) => onUpdateItem(i, updates)} onDelete={() => onDeleteItem(i)}
            canvasWidth={canvasWidth} canvasHeight={canvasHeight} displayWidth={displayW} displayHeight={displayH} />
        ))}
      </div>
    </div>
  );
}

interface StickyNoteProps {
  item: LayoutItem; index: number; isEditing: boolean; isDragging: boolean;
  isConnectTarget: boolean; isConnectSource: boolean;
  onPointerDown: (e: React.PointerEvent) => void; onEdit: () => void;
  onUpdate: (updates: Partial<LayoutItem>) => void; onDelete: () => void;
  canvasWidth: number; canvasHeight: number; displayWidth: number; displayHeight: number;
}

function StickyNote({ item, index, isEditing, isDragging, isConnectTarget, isConnectSource, onPointerDown, onEdit, onUpdate, onDelete, canvasWidth, canvasHeight, displayWidth, displayHeight }: StickyNoteProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [resizing, setResizing] = useState(false);
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });

  useEffect(() => {
    if (isEditing && textareaRef.current) { textareaRef.current.focus(); textareaRef.current.select(); }
  }, [isEditing]);

  const left = (item.x / canvasWidth) * displayWidth;
  const top = (item.y / canvasHeight) * displayHeight;
  const isCentral = item.type === "central";
  const elType = item.elementType || item.type;

  const typeLabels: Record<string, string> = {
    sticky_note: "STICKY NOTE", leaf: "STICKY NOTE", central: "CENTER", branch: "BRANCH",
    shape_rect: "RECTANGLE", shape_circle: "CIRCLE", shape_diamond: "DIAMOND",
    text_block: "TEXT", frame: "FRAME", milestone: "MILESTONE", event: "EVENT",
  };
  const typeLabel = typeLabels[elType] || "NOTE";

  const isCircle = elType === "shape_circle";
  const isDiamond = elType === "shape_diamond";
  const isFrame = elType === "frame";
  const isTextBlock = elType === "text_block";
  const isShape = elType === "shape_rect" || isCircle || isDiamond;

  const shapeClass = isCircle ? "rounded-full" : isDiamond ? "rotate-0" : isFrame ? "rounded-xl border-2 border-dashed" : isTextBlock ? "rounded-lg border-none shadow-none" : "rounded-xl";
  const bgColor = isFrame ? "transparent" : isTextBlock ? "transparent" : item.color || "#FFF9DB";
  const defaultWidth = isCircle ? 100 : isDiamond ? 120 : isFrame ? 300 : isTextBlock ? 200 : isCentral ? 160 : 140;
  const defaultHeight = isCircle ? 100 : isDiamond ? 120 : isFrame ? 200 : isTextBlock ? 60 : 100;
  const itemW = item.width || defaultWidth;
  const itemH = item.height || defaultHeight;

  const handleResizeStart = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setResizing(true);
    resizeStart.current = { x: e.clientX, y: e.clientY, w: itemW, h: itemH };
    const onMove = (ev: PointerEvent) => {
      const scale = displayWidth / canvasWidth;
      const dw = (ev.clientX - resizeStart.current.x) / scale;
      const dh = (ev.clientY - resizeStart.current.y) / scale;
      onUpdate({
        width: Math.max(60, resizeStart.current.w + dw),
        height: Math.max(40, resizeStart.current.h + dh),
      });
    };
    const onUp = () => {
      setResizing(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const scale = displayWidth / canvasWidth;
  const scaledW = itemW * scale;
  const scaledH = itemH * scale;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: isDragging ? 1.05 : isConnectTarget ? 1.08 : 1, zIndex: isDragging ? 50 : isEditing ? 40 : isFrame ? 1 : 10 }}
      transition={{ delay: index * 0.03, duration: 0.2 }}
      className={`absolute group ${isDragging ? "cursor-grabbing" : isConnectTarget ? "cursor-pointer" : "cursor-move"}`}
      style={{ left, top, width: scaledW, height: isDiamond ? scaledW : scaledH }}
      onPointerDown={onPointerDown}
      onDoubleClick={(e) => { e.stopPropagation(); onEdit(); }}>
      {isDiamond ? (
        <div className="relative w-full h-full">
          <div className={`absolute inset-[15%] rotate-45 shadow-sm border transition-all ${
            isEditing ? "ring-2 ring-accent/40 shadow-md" : isConnectSource ? "ring-2 ring-accent shadow-lg" : isConnectTarget ? "ring-1 ring-accent/30 shadow-md" : "hover:shadow-md"
          } border-border/30 rounded-lg`} style={{ backgroundColor: bgColor }} />
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
            <span className="text-[8px] font-medium tracking-wider text-foreground/40 uppercase mb-0.5">{typeLabel}</span>
            {isEditing ? (
              <textarea ref={textareaRef} value={item.content} onChange={(e) => onUpdate({ content: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Escape") onEdit(); }} onClick={(e) => e.stopPropagation()}
                className="w-[70%] bg-transparent border-none outline-none resize-none text-xs leading-relaxed text-center min-h-[30px] text-foreground" rows={2} />
            ) : (
              <p className="text-xs leading-relaxed text-center px-4 font-medium text-foreground">{item.content}</p>
            )}
          </div>
          {item.connectedTo && item.connectedTo.length > 0 && (
            <div className="absolute -bottom-1.5 -right-1.5 w-4 h-4 rounded-full bg-accent/20 text-accent text-[8px] flex items-center justify-center font-medium z-20">{item.connectedTo.length}</div>
          )}
          {isEditing && (
            <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 bg-background/90 backdrop-blur-sm rounded-full px-2 py-1 border border-border/50 shadow-sm" onClick={(e) => e.stopPropagation()}>
              <input type="color" value={item.color || "#FFF9DB"} onChange={(e) => onUpdate({ color: e.target.value })}
                className="w-5 h-5 border-none cursor-pointer rounded-full" title="Change color" />
              <span className="text-[8px] text-foreground/40">color</span>
            </div>
          )}
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20">
            <Trash2 className="w-2.5 h-2.5" />
          </button>
          {/* Resize handle */}
          <div onPointerDown={handleResizeStart}
            className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize z-30 opacity-0 group-hover:opacity-60 transition-opacity"
            style={{ background: "linear-gradient(135deg, transparent 50%, hsl(var(--accent)) 50%)", borderRadius: "0 0 4px 0" }} />
        </div>
      ) : (
        <div className={`relative w-full h-full ${shapeClass} shadow-sm border transition-all ${
          isEditing ? "ring-2 ring-accent/40 shadow-md" : isConnectSource ? "ring-2 ring-accent shadow-lg" : isConnectTarget ? "ring-1 ring-accent/30 shadow-md" : "hover:shadow-md"
        } ${isCentral ? "border-accent/30" : isFrame ? "border-accent/20" : isTextBlock ? "border-transparent" : "border-border/30"}`}
          style={{ backgroundColor: bgColor }}>
          <div className={`px-3 pt-2 flex items-center gap-1.5 ${isCircle ? "justify-center" : ""}`}>
            <span className="text-[9px] font-medium tracking-wider text-foreground/40 uppercase">{typeLabel}</span>
          </div>
          {!isShape && !isFrame && !isTextBlock && (
            <div className="absolute top-0 right-0 w-4 h-4 overflow-hidden">
              <div className="absolute top-0 right-0 w-6 h-6 -translate-x-1 translate-y-1 rotate-45" style={{ backgroundColor: "rgba(0,0,0,0.04)" }} />
            </div>
          )}
          <div className="absolute -left-0.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-40 transition-opacity">
            <GripVertical className="w-3 h-3 text-foreground" />
          </div>
          <div className={`p-3 pt-1 overflow-hidden ${isCircle ? "flex items-center justify-center" : ""}`}>
            {isEditing ? (
              <textarea ref={textareaRef} value={item.content} onChange={(e) => onUpdate({ content: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Escape") onEdit(); }} onClick={(e) => e.stopPropagation()}
                className={`w-full bg-transparent border-none outline-none resize-none text-xs leading-relaxed min-h-[40px] text-foreground ${isTextBlock ? "text-base font-medium" : ""}`}
                rows={isFrame ? 1 : 3} />
            ) : (
              <p className={`text-xs leading-relaxed text-foreground ${isCentral || isCircle ? "font-medium text-center" : ""} ${isTextBlock ? "text-base font-medium text-serif" : ""}`}>{item.content}</p>
            )}
          </div>
          {item.connectedTo && item.connectedTo.length > 0 && (
            <div className="absolute -bottom-1.5 -right-1.5 w-4 h-4 rounded-full bg-accent/20 text-accent text-[8px] flex items-center justify-center font-medium">{item.connectedTo.length}</div>
          )}
          {isEditing && !isFrame && !isTextBlock && (
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 bg-background/90 backdrop-blur-sm rounded-full px-2 py-1 border border-border/50 shadow-sm" onClick={(e) => e.stopPropagation()}>
              <input type="color" value={item.color || "#FFF9DB"} onChange={(e) => onUpdate({ color: e.target.value })}
                className="w-5 h-5 border-none cursor-pointer rounded-full" title="Change color" />
              <span className="text-[8px] text-foreground/40">color</span>
            </div>
          )}
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <Trash2 className="w-2.5 h-2.5" />
          </button>
          {/* Resize handle */}
          <div onPointerDown={handleResizeStart}
            className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize z-30 opacity-0 group-hover:opacity-60 transition-opacity"
            style={{ background: "linear-gradient(135deg, transparent 50%, hsl(var(--accent)) 50%)", borderRadius: "0 0 4px 0" }} />
        </div>
      )}
    </motion.div>
  );
}
