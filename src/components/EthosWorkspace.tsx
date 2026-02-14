import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, Image, Layout, ArrowRightLeft, Sparkles } from "lucide-react";
import AIChatPanel from "./AIChatPanel";
import ImageAnalyzer from "./ImageAnalyzer";
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

  const handlePushToMiro = async (items: any[]) => {
    if (!miroBoardId) {
      toast.error("Select a Miro board first", {
        description: "Go to the Sync tab and select a board",
      });
      setActiveTab("miro");
      return;
    }
    try {
      toast.loading("Pushing to Miro...");
      await pushItemsToMiro(miroBoardId, items);
      toast.dismiss();
      toast.success("Pushed to Miro!", {
        description: `${items.length} items added to your board`,
      });
    } catch {
      toast.dismiss();
      toast.error("Failed to push to Miro");
    }
  };

  return (
    <div className="h-screen w-full bg-ambient flex flex-col overflow-hidden">
      {/* Header */}
      <header className="px-6 py-4 flex items-center justify-between shrink-0">
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

        {miroBoardId && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            Connected to Miro
          </div>
        )}
      </header>

      {/* Main content area */}
      <div className="flex-1 flex flex-col lg:flex-row gap-0 overflow-hidden px-4 pb-4">
        {/* Sidebar/Tabs area */}
        <div className="w-full lg:w-[420px] xl:w-[480px] flex flex-col glass rounded-2xl overflow-hidden shrink-0 min-h-0 max-h-[calc(100vh-120px)] lg:max-h-none">
          {/* Tab navigation */}
          <div className="flex border-b border-border/50 px-2 pt-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors rounded-t-lg ${
                    activeTab === tab.id
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground/70"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  {activeTab === tab.id && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute inset-x-0 bottom-0 h-[2px] bg-accent rounded-full"
                      transition={{ type: "spring", stiffness: 500, damping: 35 }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.2 }}
                className="h-full"
              >
                {activeTab === "chat" && <AIChatPanel />}
                {activeTab === "image" && <ImageAnalyzer />}
                {activeTab === "preview" && <InteractivePreview onPushToMiro={handlePushToMiro} />}
                {activeTab === "miro" && (
                  <MiroSyncPanel
                    selectedBoardId={miroBoardId}
                    onBoardSelected={setMiroBoardId}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Canvas / Info area */}
        <div className="flex-1 flex items-center justify-center p-8 min-h-[300px]">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="text-center max-w-md"
          >
            <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-6">
              <Sparkles className="w-7 h-7 text-accent" />
            </div>
            <h2 className="text-serif text-3xl lg:text-4xl mb-3">
              Think freely.
            </h2>
            <p className="text-muted-foreground text-sm leading-relaxed mb-6 max-w-sm mx-auto">
              Brain dump ideas, scan images for inspiration, preview layouts — then push it all to Miro with one click.
            </p>
            <div className="flex flex-wrap gap-2 justify-center text-xs text-muted-foreground/70">
              {["AI Ideation", "Image Analysis", "Mindmap Generation", "Layout Preview", "Miro Sync"].map((f) => (
                <span key={f} className="bg-secondary/60 px-3 py-1.5 rounded-full">{f}</span>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
