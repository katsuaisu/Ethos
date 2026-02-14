import { useState, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { MessageSquare, Image, Layout, ArrowRightLeft } from "lucide-react";
import AIChatPanel from "./AIChatPanel";
import ScanPanel from "./ScanPanel";
import InteractivePreview from "./InteractivePreview";
import MiroSyncPanel, { pushItemsToMiro } from "./MiroSyncPanel";
import { toast } from "sonner";

const ACCENT_KEY = "ethos-accent-color";
const DEFAULT_ACCENT = "24 80% 55%"; // orange

function hexToHsl(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function hslToHex(hsl: string): string {
  const [h, s, l] = hsl.split(/\s+/).map((v, i) => i === 0 ? parseInt(v) : parseInt(v) / 100);
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

type Tab = "chat" | "image" | "preview" | "miro";

const tabs: { id: Tab; label: string; icon: typeof MessageSquare }[] = [
  { id: "chat", label: "Ideate", icon: MessageSquare },
  { id: "image", label: "Scan", icon: Image },
  { id: "preview", label: "Preview", icon: Layout },
  { id: "miro", label: "Sync", icon: ArrowRightLeft },
];

const ACCENT_PRESETS = [
  { name: "Orange", hsl: "24 80% 55%" },
  { name: "Rose", hsl: "340 65% 55%" },
  { name: "Violet", hsl: "270 60% 55%" },
  { name: "Blue", hsl: "210 70% 50%" },
  { name: "Teal", hsl: "175 60% 42%" },
  { name: "Green", hsl: "145 55% 42%" },
  { name: "Amber", hsl: "38 90% 50%" },
  { name: "Red", hsl: "0 70% 52%" },
];

export default function EthosWorkspace() {
  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const [miroBoardId, setMiroBoardId] = useState<string>("");
  const [accentHsl, setAccentHsl] = useState<string>(() => {
    try { return localStorage.getItem(ACCENT_KEY) || DEFAULT_ACCENT; } catch { return DEFAULT_ACCENT; }
  });

  // Shared state for importing scan data into preview
  const [sharedPalette, setSharedPalette] = useState<Record<string, string> | null>(null);
  const [sharedIdeas, setSharedIdeas] = useState<string[]>([]);

  // Apply accent color to CSS
  useEffect(() => {
    document.documentElement.style.setProperty("--accent", accentHsl);
    document.documentElement.style.setProperty("--ring", accentHsl);
    localStorage.setItem(ACCENT_KEY, accentHsl);
  }, [accentHsl]);

  const handlePushToMiro = useCallback(async (items: any[]) => {
    if (!miroBoardId) {
      toast.error("Select a Miro board first", { description: "Go to the Sync tab and select a board" });
      setActiveTab("miro");
      return;
    }
    try {
      toast.loading("Pushing to Miro...");
      await pushItemsToMiro(miroBoardId, items);
      toast.dismiss();
      toast.success("Pushed to Miro!", { description: `${items.length} items added to your board` });
    } catch {
      toast.dismiss();
      toast.error("Failed to push to Miro");
    }
  }, [miroBoardId]);

  const handleExtractPalette = useCallback((palette: Record<string, string>) => {
    setSharedPalette(palette);
  }, []);

  const handleShareIdeas = useCallback((ideas: string[]) => {
    setSharedIdeas(ideas);
  }, []);

  return (
    <div className="h-screen w-full bg-ambient flex flex-col overflow-hidden">
      {/* Top nav bar */}
      <header className="px-6 py-3 flex items-center justify-between border-b border-border/30 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg border border-border flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-foreground">
              <path d="M12 2L14.09 8.26L20.18 8.63L15.54 12.74L17.09 19.37L12 15.77L6.91 19.37L8.46 12.74L3.82 8.63L9.91 8.26L12 2Z" fill="currentColor" opacity="0.9"/>
              <circle cx="12" cy="12" r="3" fill="hsl(var(--background))" />
            </svg>
          </div>
          <div>
            <h1 className="text-serif text-xl leading-none">Ethos</h1>
            <p className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground mt-0.5">
              workspace
            </p>
          </div>
        </div>

        {/* Center nav */}
        <nav className="flex items-center gap-1 bg-secondary/50 rounded-xl p-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          {miroBoardId && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              Miro connected
            </div>
          )}
        </div>
      </header>

      {/* Full-page content — all tabs stay mounted, hidden with CSS */}
      <div className="flex-1 overflow-hidden relative">
        {/* Ideate — full page with chat left + sidebar right */}
        <div className={`absolute inset-0 flex ${activeTab === "chat" ? "" : "hidden"}`}>
          <div className="flex-1 max-w-3xl mx-auto">
            <AIChatPanel onShareIdeas={handleShareIdeas} />
          </div>
          <IdeationSidebar sharedIdeas={sharedIdeas} accentHsl={accentHsl} onAccentChange={setAccentHsl} />
        </div>

        {/* Scan — full page */}
        <div className={`absolute inset-0 flex ${activeTab === "image" ? "" : "hidden"}`}>
          <div className="flex-1 max-w-2xl mx-auto">
            <ScanPanel onPaletteExtracted={handleExtractPalette} />
          </div>
          <ScanSidebar palette={sharedPalette} />
        </div>

        {/* Preview — full page canvas */}
        <div className={`absolute inset-0 ${activeTab === "preview" ? "" : "hidden"}`}>
          <InteractivePreview
            onPushToMiro={handlePushToMiro}
            importedPalette={sharedPalette}
            importedIdeas={sharedIdeas}
          />
        </div>

        {/* Sync — full page */}
        <div className={`absolute inset-0 ${activeTab === "miro" ? "" : "hidden"}`}>
          <MiroSyncPanel selectedBoardId={miroBoardId} onBoardSelected={setMiroBoardId} />
        </div>
      </div>
    </div>
  );
}

/* ── Sidebars ── */

function IdeationSidebar({ sharedIdeas, accentHsl, onAccentChange }: { sharedIdeas: string[]; accentHsl: string; onAccentChange: (hsl: string) => void }) {
  return (
    <div className="hidden lg:flex w-72 xl:w-80 flex-col border-l border-border/30 p-5 gap-5 overflow-y-auto scrollbar-thin">
      {/* Accent Color Picker */}
      <div className="glass rounded-xl p-4">
        <h4 className="text-serif text-sm mb-3">Accent Color</h4>
        <div className="grid grid-cols-4 gap-2 mb-3">
          {ACCENT_PRESETS.map((preset) => (
            <button
              key={preset.name}
              onClick={() => onAccentChange(preset.hsl)}
              className={`group flex flex-col items-center gap-1`}
              title={preset.name}
            >
              <div
                className={`w-7 h-7 rounded-full border-2 transition-all ${accentHsl === preset.hsl ? "border-foreground scale-110" : "border-transparent hover:scale-105"}`}
                style={{ backgroundColor: `hsl(${preset.hsl})` }}
              />
              <span className="text-[9px] text-muted-foreground">{preset.name}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-muted-foreground">Custom</label>
          <input
            type="color"
            value={hslToHex(accentHsl)}
            onChange={(e) => onAccentChange(hexToHsl(e.target.value))}
            className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
          />
        </div>
      </div>

      <div className="glass rounded-xl p-4">
        <h4 className="text-serif text-sm mb-3">Layout DNA</h4>
        <div className="flex items-center gap-3 p-2 rounded-lg bg-secondary/50">
          <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
            <Layout className="w-4 h-4 text-accent" />
          </div>
          <div>
            <p className="text-xs font-medium text-foreground">Gardener / MindMap</p>
            <p className="text-[10px] text-muted-foreground">Organic mindmap for connected ideas</p>
          </div>
        </div>
      </div>

      <div className="glass rounded-xl p-4">
        <h4 className="text-serif text-sm mb-3">Quick Stats</h4>
        <div className="space-y-2.5">
          {[
            { label: "Active Ideas", value: sharedIdeas.length || "—" },
            { label: "Saved Boards", value: "—" },
            { label: "AI Suggestions", value: "—" },
          ].map((s) => (
            <div key={s.label} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{s.label}</span>
              <span className="font-medium text-foreground">{s.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ScanSidebar({ palette }: { palette: Record<string, string> | null }) {
  return (
    <div className="hidden lg:flex w-72 xl:w-80 flex-col border-l border-border/30 p-5 gap-5 overflow-y-auto scrollbar-thin">
      {palette && (
        <div className="glass rounded-xl p-4">
          <h4 className="text-serif text-sm mb-3">Extracted Palette</h4>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(palette).map(([name, hex]) => (
              <div key={name} className="text-center">
                <div className="w-full aspect-square rounded-lg border border-border/50 mb-1" style={{ backgroundColor: hex }} />
                <p className="text-[10px] text-muted-foreground capitalize">{name}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="glass rounded-xl p-4">
        <h4 className="text-serif text-sm mb-3">Scan Tips</h4>
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>• Upload moodboards to extract colors & fonts</p>
          <p>• Analyze images for AI-generated mindmaps</p>
          <p>• Extracted palettes auto-sync to Preview</p>
        </div>
      </div>
    </div>
  );
}
