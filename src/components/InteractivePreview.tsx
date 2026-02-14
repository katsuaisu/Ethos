import { useState, useCallback, useEffect, useRef } from "react";
import { Loader2, Sparkles, Layout, GitBranch, Clock, RotateCcw, GripVertical, Plus, Trash2, Type } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`;
const STORAGE_KEY = "ethos-preview-history";

interface LayoutItem {
  content: string;
  x: number;
  y: number;
  type: string;
  color?: string;
  width?: number;
  height?: number;
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

const STICKY_COLORS = [
  { name: "Cream", hex: "#FFF9DB" },
  { name: "Mint", hex: "#D4EDDA" },
  { name: "Rose", hex: "#FDE8E8" },
  { name: "Sky", hex: "#E3F2FD" },
  { name: "Lavender", hex: "#F3E5F5" },
  { name: "Peach", hex: "#FFE8D6" },
];

export default function InteractivePreview({ onPushToMiro }: PreviewProps) {
  const [input, setInput] = useState("");
  const [items, setItems] = useState<LayoutItem[]>([]);
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState("");
  const [layoutType, setLayoutType] = useState<"grid" | "mindmap" | "timeline">("grid");
  const [history, setHistory] = useState<PreviewEntry[]>(loadHistory);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

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
Use 300px spacing. Use soft warm pastels (#FFF9DB, #D4EDDA, #FDE8E8, #E3F2FD, #F3E5F5, #FFE8D6). Max 12 items. Group related ideas together.`,
        mindmap: `Create a mindmap layout from these ideas. Return ONLY a JSON array where:
- The central topic is at x:500, y:250 with type "central"
- Main branches radiate outward
- Sub-items are near their parent branches
Each: {"content": "text", "x": number, "y": number, "type": "branch"|"central"|"leaf", "color": "#hex"}
Use: central=#FFF9DB, branches=#FFE8D6, leaves=#E3F2FD. Max 15 items.`,
        timeline: `Organize these ideas into a horizontal timeline. Return ONLY a JSON array where:
- Items flow left to right with x starting at 50 and incrementing by 280
- y values alternate between 80 and 220 for visual interest
Each: {"content": "text", "x": number, "y": number, "type": "milestone"|"event", "color": "#hex"}
Use soft pastels. Max 10 items.`,
      };

      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: `${layoutPrompts[layoutType]}\n\nContent to organize:\n\n${input}` }],
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
        setHistory(prev => [{ id: Date.now().toString(), input: input.slice(0, 100), items: newItems, layoutType, date: new Date().toISOString() }, ...prev]);
      }
      setStatus("");
    } catch (e) {
      console.error(e);
      setStatus("Generation failed. Try again.");
    } finally {
      setGenerating(false);
    }
  }, [input, layoutType]);

  const addStickyNote = () => {
    const newItem: LayoutItem = {
      content: "New note",
      x: 50 + Math.random() * 200,
      y: 50 + Math.random() * 200,
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

      {/* Interactive canvas */}
      <div className="flex-1 overflow-auto p-4" style={{ minHeight: 0 }}>
        <AnimatePresence mode="wait">
          {items.length > 0 ? (
            <motion.div
              key="preview"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-3"
            >
              {/* Toolbar */}
              <div className="flex items-center gap-2">
                <button
                  onClick={addStickyNote}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground text-xs hover:bg-secondary/80 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  Add Note
                </button>
                <div className="flex gap-1 ml-auto">
                  {STICKY_COLORS.map((c) => (
                    <button
                      key={c.hex}
                      onClick={() => {
                        if (editingIdx !== null) updateItem(editingIdx, { color: c.hex });
                      }}
                      className="w-4 h-4 rounded-full border border-border/50 hover:scale-125 transition-transform"
                      style={{ backgroundColor: c.hex }}
                      title={c.name}
                    />
                  ))}
                </div>
              </div>

              {/* Interactive board */}
              <InteractiveBoard
                items={items}
                layoutType={layoutType}
                editingIdx={editingIdx}
                onEditIdx={setEditingIdx}
                onUpdateItem={updateItem}
                onDeleteItem={deleteItem}
                dragIdx={dragIdx}
                onDragIdx={setDragIdx}
              />

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

/* ── Interactive Board ── */

interface BoardProps {
  items: LayoutItem[];
  layoutType: string;
  editingIdx: number | null;
  onEditIdx: (idx: number | null) => void;
  onUpdateItem: (idx: number, updates: Partial<LayoutItem>) => void;
  onDeleteItem: (idx: number) => void;
  dragIdx: number | null;
  onDragIdx: (idx: number | null) => void;
}

function InteractiveBoard({ items, layoutType, editingIdx, onEditIdx, onUpdateItem, onDeleteItem, dragIdx, onDragIdx }: BoardProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent, idx: number) => {
    if (editingIdx === idx) return; // don't drag while editing
    const board = boardRef.current;
    if (!board) return;
    const rect = board.getBoundingClientRect();
    const item = items[idx];
    setDragOffset({
      x: e.clientX - rect.left - (item.x / 1200) * rect.width,
      y: e.clientY - rect.top - (item.y / 600) * rect.height,
    });
    onDragIdx(idx);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (dragIdx === null) return;
    const board = boardRef.current;
    if (!board) return;
    const rect = board.getBoundingClientRect();
    const x = Math.max(0, Math.min(1100, ((e.clientX - rect.left - dragOffset.x) / rect.width) * 1200));
    const y = Math.max(0, Math.min(500, ((e.clientY - rect.top - dragOffset.y) / rect.height) * 600));
    onUpdateItem(dragIdx, { x, y });
  };

  const handlePointerUp = () => {
    onDragIdx(null);
  };

  return (
    <div
      ref={boardRef}
      className="glass rounded-xl p-2 relative overflow-hidden cursor-crosshair select-none"
      style={{ minHeight: 380 }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={() => onEditIdx(null)}
    >
      {/* Grid dots background */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: "radial-gradient(circle, hsl(var(--foreground)) 1px, transparent 1px)",
        backgroundSize: "24px 24px",
      }} />

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
          boardWidth={boardRef.current?.clientWidth || 400}
          boardHeight={boardRef.current?.clientHeight || 380}
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
  boardWidth: number;
  boardHeight: number;
}

function StickyNote({ item, index, isEditing, isDragging, onPointerDown, onEdit, onUpdate, onDelete, boardWidth, boardHeight }: StickyNoteProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [isEditing]);

  const left = (item.x / 1200) * 100;
  const top = (item.y / 600) * 100;

  const isCentral = item.type === "central";
  const isBranch = item.type === "branch";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{
        opacity: 1,
        scale: isDragging ? 1.05 : 1,
        zIndex: isDragging ? 50 : isEditing ? 40 : 10,
      }}
      transition={{ delay: index * 0.04, duration: 0.2 }}
      className={`absolute group ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
      style={{
        left: `${left}%`,
        top: `${top}%`,
        transform: "translate(-50%, -50%)",
      }}
      onPointerDown={onPointerDown}
      onDoubleClick={(e) => { e.stopPropagation(); onEdit(); }}
    >
      <div
        className={`relative rounded-xl shadow-sm border transition-shadow ${
          isEditing ? "ring-2 ring-accent/40 shadow-md" : "hover:shadow-md"
        } ${isCentral ? "border-primary/20" : "border-border/30"}`}
        style={{
          backgroundColor: item.color || "#FFF9DB",
          minWidth: isCentral ? 140 : 120,
          maxWidth: 180,
        }}
      >
        {/* Fold effect */}
        <div className="absolute top-0 right-0 w-4 h-4 overflow-hidden">
          <div
            className="absolute top-0 right-0 w-6 h-6 -translate-x-1 translate-y-1 rotate-45"
            style={{ backgroundColor: "rgba(0,0,0,0.04)" }}
          />
        </div>

        {/* Drag handle */}
        <div className="absolute -left-0.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-40 transition-opacity">
          <GripVertical className="w-3 h-3 text-foreground" />
        </div>

        {/* Content */}
        <div className="p-3">
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
            <p className={`text-xs leading-relaxed ${isCentral ? "font-medium text-center" : ""}`}>
              {item.content}
            </p>
          )}
        </div>

        {/* Delete button on hover */}
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
