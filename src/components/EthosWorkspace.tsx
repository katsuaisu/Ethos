import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { MessageSquare, Image, Layout, ArrowRightLeft, Sparkles } from "lucide-react";
import AIChatPanel from "./AIChatPanel";
import ScanPanel from "./ScanPanel";
import InteractivePreview from "./InteractivePreview";
import MiroSyncPanel, { pushItemsToMiro } from "./MiroSyncPanel";
import { toast } from "sonner";

type Tab = "chat" | "image" | "preview" | "miro";

const tabs: { id: Tab; label: string; icon: typeof MessageSquare }[] = [
  { id: "chat", label: "Ideate", icon: MessageSquare },
  { id: "image", label: "Scan", icon: Image },
  { id: "preview", label: "Preview", icon: Layout },
  { id: "miro", label: "Sync", icon: ArrowRightLeft },
];

export default function EthosWorkspace() {
  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const [miroBoardId, setMiroBoardId] = useState<string>("");

  // Shared state for importing scan data into preview
  const [sharedPalette, setSharedPalette] = useState<Record<string, string> | null>(null);
  const [sharedIdeas, setSharedIdeas] = useState<string[]>([]);

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
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-serif text-xl leading-none">Ethos</h1>
            <p className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground mt-0.5">
              A workspace that's yours
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
          <IdeationSidebar sharedIdeas={sharedIdeas} />
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

function IdeationSidebar({ sharedIdeas }: { sharedIdeas: string[] }) {
  return (
    <div className="hidden lg:flex w-72 xl:w-80 flex-col border-l border-border/30 p-5 gap-5 overflow-y-auto scrollbar-thin">
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
