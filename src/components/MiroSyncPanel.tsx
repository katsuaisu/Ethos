import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Loader2, ArrowDownLeft, CheckCircle2, AlertCircle, ArrowUpRight, Folder, LogIn, LogOut, ExternalLink, Layout } from "lucide-react";
import { convertToMiroItems, snapshotAndValidate, getMiroConnections } from "@/lib/miroCompat";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

const MIRO_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/miro-sync`;
const MIRO_TOKEN_KEY = "ethos-miro-token";
const PREVIEW_STORAGE_KEY = "ethos-preview-sessions";

interface Board {
  id: string;
  name: string;
  description?: string;
}

interface MiroItem {
  id: string;
  type: string;
  data?: { content?: string };
  position?: { x: number; y: number };
}

interface PreviewSession {
  id: string;
  name: string;
  items: any[];
  layoutType: string;
  date: string;
}

interface MiroSyncProps {
  onBoardSelected?: (boardId: string) => void;
  selectedBoardId?: string;
  previewSessions?: PreviewSession[];
}

function getSavedToken(): string | null {
  try { return localStorage.getItem(MIRO_TOKEN_KEY); } catch { return null; }
}

function loadPreviewSessions(): PreviewSession[] {
  try { return JSON.parse(localStorage.getItem(PREVIEW_STORAGE_KEY) || "[]"); } catch { return []; }
}

export default function MiroSyncPanel({ onBoardSelected, selectedBoardId, previewSessions }: MiroSyncProps) {
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pulledItems, setPulledItems] = useState<MiroItem[]>([]);
  const [status, setStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [userToken, setUserToken] = useState<string | null>(getSavedToken);
  const [connecting, setConnecting] = useState(false);
  const [selectedPreviewId, setSelectedPreviewId] = useState<string | null>(null);
  const [localPreviewSessions, setLocalPreviewSessions] = useState<PreviewSession[]>(previewSessions || loadPreviewSessions);

  // Refresh preview sessions
  useEffect(() => {
    if (previewSessions) setLocalPreviewSessions(previewSessions);
  }, [previewSessions]);

  useEffect(() => {
    const refresh = () => setLocalPreviewSessions(loadPreviewSessions());
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  // Handle OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code && !userToken) {
      exchangeCode(code);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const exchangeCode = async (code: string) => {
    setConnecting(true);
    try {
      const res = await fetch(MIRO_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({ action: "oauth-exchange", code, redirectUri: window.location.origin + window.location.pathname }),
      });
      const data = await res.json();
      if (data.access_token) {
        localStorage.setItem(MIRO_TOKEN_KEY, data.access_token);
        setUserToken(data.access_token);
        setStatus({ type: "success", msg: "Connected to your Miro account!" });
      } else { throw new Error(data.error || "Failed to connect"); }
    } catch (e: any) {
      console.error(e);
      setStatus({ type: "error", msg: e.message || "Connection failed" });
    } finally { setConnecting(false); }
  };

  const connectMiro = async () => {
    setConnecting(true);
    try {
      const res = await fetch(MIRO_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({ action: "get-client-id" }),
      });
      const data = await res.json();
      if (data.clientId) {
        const redirectUri = encodeURIComponent(window.location.origin + window.location.pathname);
        window.location.href = `https://miro.com/oauth/authorize?response_type=code&client_id=${data.clientId}&redirect_uri=${redirectUri}`;
      }
    } catch (e) {
      console.error(e);
      setStatus({ type: "error", msg: "Failed to start connection" });
      setConnecting(false);
    }
  };

  const disconnectMiro = () => {
    localStorage.removeItem(MIRO_TOKEN_KEY);
    setUserToken(null);
    setBoards([]);
    setPulledItems([]);
    setStatus({ type: "success", msg: "Disconnected from Miro" });
  };

  const miroHeaders = (): Record<string, string> => {
    const h: Record<string, string> = { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` };
    if (userToken) h["x-miro-token"] = userToken;
    return h;
  };

  const fetchBoards = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(MIRO_URL, { method: "POST", headers: miroHeaders(), body: JSON.stringify({ action: "get-boards" }) });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (data.boards) setBoards(data.boards);
    } catch (e: any) {
      console.error(e);
      setStatus({ type: "error", msg: e.message || "Failed to fetch boards" });
    } finally { setLoading(false); }
  }, [userToken]);

  useEffect(() => { if (userToken) fetchBoards(); }, [userToken, fetchBoards]);

  const pullFromMiro = async () => {
    if (!selectedBoardId) return;
    setSyncing(true);
    setStatus(null);
    try {
      const res = await fetch(MIRO_URL, { method: "POST", headers: miroHeaders(), body: JSON.stringify({ action: "get-items", boardId: selectedBoardId }) });
      const data = await res.json();
      const items = data.items || [];
      setPulledItems(items);
      setStatus({ type: "success", msg: `Pulled ${items.length} items` });
    } catch { setStatus({ type: "error", msg: "Pull failed" }); }
    finally { setSyncing(false); }
  };

  const pushPreviewBoard = async () => {
    if (!selectedBoardId || !selectedPreviewId) {
      toast.error("Select both a Miro board and a Preview board");
      return;
    }
    const session = localPreviewSessions.find(s => s.id === selectedPreviewId);
    if (!session || session.items.length === 0) {
      toast.error("Selected preview board has no items");
      return;
    }
    setSyncing(true);
    setStatus(null);
    try {
      const result = await pushItemsToMiro(selectedBoardId, session.items);
      if (result.success) {
        setStatus({ type: "success", msg: `Pushed ${result.created} items to Miro!` });
      } else if (result.created > 0) {
        setStatus({ type: "success", msg: `Partial: ${result.created}/${result.expected} items pushed` });
      } else {
        setStatus({ type: "error", msg: result.errors[0] || "Push failed" });
      }
    } catch {
      setStatus({ type: "error", msg: "Push failed" });
    } finally { setSyncing(false); }
  };

  const selectedBoard = boards.find(b => b.id === selectedBoardId);
  const selectedPreview = localPreviewSessions.find(s => s.id === selectedPreviewId);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: Miro boards gallery */}
      <div className="flex-1 flex flex-col overflow-hidden border-r border-border/30">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/30 shrink-0">
          <h3 className="text-serif text-lg">Miro Boards</h3>
          <div className="flex items-center gap-2">
            {userToken && (
              <button onClick={fetchBoards} disabled={loading} className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors">
                <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${loading ? "animate-spin" : ""}`} />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain scrollbar-thin px-5 py-4" style={{ minHeight: 0, WebkitOverflowScrolling: "touch" }}>
          {!userToken ? (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center text-center py-16">
              <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
                <ExternalLink className="w-6 h-6 text-accent" />
              </div>
              <h3 className="text-serif text-lg mb-1">Connect your Miro</h3>
              <p className="text-xs text-muted-foreground max-w-[240px] leading-relaxed mb-5">Link your Miro account to sync boards and push layouts.</p>
              <button onClick={connectMiro} disabled={connecting} className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50">
                {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                {connecting ? "Connecting..." : "Connect to Miro"}
              </button>
            </motion.div>
          ) : (
            <>
              {/* Connection status */}
              <div className="flex items-center justify-between bg-accent/5 border border-accent/15 rounded-xl px-3 py-2 mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                  <span className="text-xs text-foreground font-medium">Miro connected</span>
                </div>
                <button onClick={disconnectMiro} className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                  <LogOut className="w-3 h-3" /> Disconnect
                </button>
              </div>

              <AnimatePresence>
                {status && (
                  <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg mb-4 ${status.type === "success" ? "bg-accent/10 text-accent" : "bg-destructive/10 text-destructive"}`}>
                    {status.type === "success" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                    {status.msg}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Miro boards gallery */}
              {loading && boards.length === 0 ? (
                <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : boards.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-16">No boards found</p>
              ) : (
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                  {boards.map((board) => (
                    <motion.button key={board.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                      onClick={() => onBoardSelected?.(board.id)}
                      className={`text-left p-4 rounded-xl transition-all ${selectedBoardId === board.id ? "glass border-accent/30 shadow-md ring-1 ring-accent/20" : "bg-secondary/50 hover:bg-secondary border border-transparent"}`}>
                      <div className="w-full aspect-video rounded-lg bg-background/50 border border-border/30 flex items-center justify-center mb-3">
                        <Folder className="w-6 h-6 text-muted-foreground/40" />
                      </div>
                      <p className="font-medium text-foreground truncate text-xs">{board.name}</p>
                      {board.description && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{board.description}</p>}
                      {selectedBoardId === board.id && <div className="w-1.5 h-1.5 rounded-full bg-accent mt-2" />}
                    </motion.button>
                  ))}
                </div>
              )}

              {/* Actions for selected Miro board */}
              {selectedBoardId && (
                <div className="mt-4 glass rounded-xl p-4">
                  <p className="text-xs text-muted-foreground mb-3">Selected: <span className="text-foreground font-medium">{selectedBoard?.name}</span></p>
                  <div className="flex gap-2">
                    <button onClick={pullFromMiro} disabled={syncing} className="flex-1 py-2 rounded-lg border border-border text-xs flex items-center justify-center gap-1.5 hover:bg-secondary transition-colors disabled:opacity-50">
                      {syncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowDownLeft className="w-3 h-3" />} Pull Items
                    </button>
                    <button onClick={pushPreviewBoard} disabled={syncing || !selectedPreviewId} className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-xs flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity disabled:opacity-50">
                      {syncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowUpRight className="w-3 h-3" />} Push Board
                    </button>
                  </div>
                </div>
              )}

              {/* Pulled items */}
              {pulledItems.length > 0 && (
                <div className="mt-4">
                  <h5 className="text-serif text-sm text-muted-foreground mb-2">Pulled Items ({pulledItems.length})</h5>
                  <div className="space-y-1.5">
                    {pulledItems.slice(0, 10).map((item) => (
                      <div key={item.id} className="bg-secondary/40 rounded-lg px-3 py-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground/60 capitalize text-[10px]">{item.type}</span>
                          <span className="text-foreground truncate">{item.data?.content?.replace(/<[^>]*>/g, "") || "—"}</span>
                        </div>
                      </div>
                    ))}
                    {pulledItems.length > 10 && <p className="text-[11px] text-muted-foreground/60 text-center py-1">+{pulledItems.length - 10} more</p>}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Right: Preview boards to push */}
      <div className="w-72 xl:w-80 flex flex-col overflow-hidden shrink-0">
        <div className="px-5 py-3 border-b border-border/30 shrink-0">
          <h3 className="text-serif text-lg">Preview Boards</h3>
          <p className="text-[10px] text-muted-foreground mt-0.5">Select a board to push to Miro</p>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain scrollbar-thin px-4 py-3" style={{ minHeight: 0, WebkitOverflowScrolling: "touch" }}>
          {localPreviewSessions.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-12">No preview boards yet. Create one in the Preview tab.</p>
          ) : (
            <div className="space-y-2">
              {localPreviewSessions.map(session => (
                <motion.button key={session.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  onClick={() => setSelectedPreviewId(session.id === selectedPreviewId ? null : session.id)}
                  className={`w-full text-left p-3 rounded-xl transition-all ${selectedPreviewId === session.id ? "glass border-accent/30 shadow-sm ring-1 ring-accent/20" : "bg-secondary/50 hover:bg-secondary border border-transparent"}`}>
                  <div className="flex items-center gap-2">
                    <Layout className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate text-xs">{session.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-muted-foreground">{session.items.length} items</span>
                        <span className="text-[10px] text-muted-foreground">·</span>
                        <span className="text-[10px] text-muted-foreground capitalize">{session.layoutType}</span>
                        <span className="text-[10px] text-muted-foreground">·</span>
                        <span className="text-[10px] text-muted-foreground">{new Date(session.date).toLocaleDateString()}</span>
                      </div>
                    </div>
                    {selectedPreviewId === session.id && <div className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />}
                  </div>
                </motion.button>
              ))}
            </div>
          )}

          {selectedPreview && selectedBoardId && (
            <div className="mt-4 glass rounded-xl p-3">
              <p className="text-[10px] text-muted-foreground mb-2">
                Push <span className="text-foreground font-medium">"{selectedPreview.name}"</span> → <span className="text-foreground font-medium">"{selectedBoard?.name}"</span>
              </p>
              <button onClick={pushPreviewBoard} disabled={syncing} className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-xs flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity disabled:opacity-50">
                {syncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowUpRight className="w-3 h-3" />}
                Push to Miro
              </button>
            </div>
          )}

          {selectedPreview && !selectedBoardId && (
            <div className="mt-4 bg-accent/5 border border-accent/15 rounded-xl px-3 py-2">
              <p className="text-[10px] text-muted-foreground">Select a Miro board on the left to push this board to.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function _getSavedToken(): string | null {
  try { return localStorage.getItem("ethos-miro-token"); } catch { return null; }
}

/**
 * Push items to Miro with snapshot validation and verification.
 */
export async function pushItemsToMiro(boardId: string, items: any[]): Promise<{ success: boolean; created: number; expected: number; errors: string[] }> {
  const token = _getSavedToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
  };
  if (token) headers["x-miro-token"] = token;

  const snapshot = snapshotAndValidate(items);
  if (!snapshot) {
    toast.error("Export failed: no items to export");
    return { success: false, created: 0, expected: 0, errors: ["No items to export"] };
  }

  if (snapshot.errors.length > 0) {
    console.warn("Miro export validation warnings:", snapshot.errors);
  }

  const miroItems = convertToMiroItems(snapshot.items);
  const connections = getMiroConnections(snapshot.items);

  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/miro-sync`, {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "push-items", boardId, items: miroItems, connections }),
  });
  const data = await res.json();

  const results = data.results || [];
  const connectorResults = data.connectorResults || [];
  const successCount = results.filter((r: any) => !r.error).length;
  const failedCount = results.filter((r: any) => r.error).length;
  const connectorSuccess = connectorResults.filter((r: any) => !r.error).length;
  const connectorFailed = connectorResults.filter((r: any) => r.error).length;
  const errors = [
    ...results.filter((r: any) => r.error).map((r: any) => r.error as string),
    ...connectorResults.filter((r: any) => r.error).map((r: any) => r.error as string),
  ];

  const totalExpected = miroItems.length + connections.length;
  const totalCreated = successCount + connectorSuccess;

  if (failedCount > 0 || connectorFailed > 0) {
    toast.warning(`Miro export: ${successCount}/${miroItems.length} nodes, ${connectorSuccess}/${connections.length} connectors.`);
  }

  return {
    success: failedCount === 0 && connectorFailed === 0,
    created: totalCreated,
    expected: totalExpected,
    errors,
  };
}
