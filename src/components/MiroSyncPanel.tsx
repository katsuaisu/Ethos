import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Loader2, ArrowDownLeft, CheckCircle2, AlertCircle, ArrowUpRight, Folder, Clock, LogIn, LogOut, ExternalLink } from "lucide-react";
import { convertToMiroItems } from "@/lib/miroCompat";
import { motion, AnimatePresence } from "framer-motion";

const MIRO_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/miro-sync`;
const MIRO_TOKEN_KEY = "ethos-miro-token";

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

interface MiroSyncProps {
  onBoardSelected?: (boardId: string) => void;
  selectedBoardId?: string;
}

function getSavedToken(): string | null {
  try { return localStorage.getItem(MIRO_TOKEN_KEY); } catch { return null; }
}

export default function MiroSyncPanel({ onBoardSelected, selectedBoardId }: MiroSyncProps) {
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pulledItems, setPulledItems] = useState<MiroItem[]>([]);
  const [status, setStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [userToken, setUserToken] = useState<string | null>(getSavedToken);
  const [connecting, setConnecting] = useState(false);

  // Handle OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code && !userToken) {
      exchangeCode(code);
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const exchangeCode = async (code: string) => {
    setConnecting(true);
    try {
      const res = await fetch(MIRO_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          action: "oauth-exchange",
          code,
          redirectUri: window.location.origin + window.location.pathname,
        }),
      });
      const data = await res.json();
      if (data.access_token) {
        localStorage.setItem(MIRO_TOKEN_KEY, data.access_token);
        setUserToken(data.access_token);
        setStatus({ type: "success", msg: "Connected to your Miro account!" });
      } else {
        throw new Error(data.error || "Failed to connect");
      }
    } catch (e: any) {
      console.error(e);
      setStatus({ type: "error", msg: e.message || "Connection failed" });
    } finally {
      setConnecting(false);
    }
  };

  const connectMiro = async () => {
    setConnecting(true);
    try {
      const res = await fetch(MIRO_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
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
    const h: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    };
    if (userToken) h["x-miro-token"] = userToken;
    return h;
  };

  const fetchBoards = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(MIRO_URL, {
        method: "POST",
        headers: miroHeaders(),
        body: JSON.stringify({ action: "get-boards" }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (data.boards) setBoards(data.boards);
    } catch (e: any) {
      console.error(e);
      setStatus({ type: "error", msg: e.message || "Failed to fetch boards" });
    } finally {
      setLoading(false);
    }
  }, [userToken]);

  useEffect(() => {
    if (userToken) fetchBoards();
  }, [userToken, fetchBoards]);

  const pullFromMiro = async () => {
    if (!selectedBoardId) return;
    setSyncing(true);
    setStatus(null);
    try {
      const res = await fetch(MIRO_URL, {
        method: "POST",
        headers: miroHeaders(),
        body: JSON.stringify({ action: "get-items", boardId: selectedBoardId }),
      });
      const data = await res.json();
      const items = data.items || [];
      setPulledItems(items);
      setStatus({ type: "success", msg: `Pulled ${items.length} items` });
    } catch {
      setStatus({ type: "error", msg: "Pull failed" });
    } finally {
      setSyncing(false);
    }
  };

  const selectedBoard = boards.find(b => b.id === selectedBoardId);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto overscroll-contain scrollbar-thin px-4 py-3" style={{ minHeight: 0, WebkitOverflowScrolling: "touch" }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-serif text-lg">Board Sync</h4>
          {userToken && (
            <button
              onClick={fetchBoards}
              disabled={loading}
              className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${loading ? "animate-spin" : ""}`} />
            </button>
          )}
        </div>

        {/* Connection state */}
        {!userToken ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center text-center py-8"
          >
            <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
              <ExternalLink className="w-6 h-6 text-accent" />
            </div>
            <h3 className="text-serif text-lg mb-1">Connect your Miro</h3>
            <p className="text-xs text-muted-foreground max-w-[240px] leading-relaxed mb-5">
              Link your own Miro account to sync boards, push layouts, and pull items directly.
            </p>
            <button
              onClick={connectMiro}
              disabled={connecting}
              className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {connecting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              {connecting ? "Connecting..." : "Connect to Miro"}
            </button>
          </motion.div>
        ) : (
          <>
            {/* Connected badge */}
            <div className="flex items-center justify-between bg-accent/5 border border-accent/15 rounded-xl px-3 py-2 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                <span className="text-xs text-foreground font-medium">Your Miro connected</span>
              </div>
              <button
                onClick={disconnectMiro}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              >
                <LogOut className="w-3 h-3" />
                Disconnect
              </button>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="bg-secondary/50 rounded-xl p-3 text-center">
                <p className="text-lg font-medium text-foreground">{boards.length}</p>
                <p className="text-[10px] text-muted-foreground">Boards</p>
              </div>
              <div className="bg-secondary/50 rounded-xl p-3 text-center">
                <p className="text-lg font-medium text-accent">{selectedBoardId ? 1 : 0}</p>
                <p className="text-[10px] text-muted-foreground">Selected</p>
              </div>
              <div className="bg-secondary/50 rounded-xl p-3 text-center">
                <p className="text-lg font-medium text-foreground">{pulledItems.length}</p>
                <p className="text-[10px] text-muted-foreground">Items</p>
              </div>
            </div>

            {/* Status */}
            <AnimatePresence>
              {status && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg mb-3 ${
                    status.type === "success" ? "bg-accent/10 text-accent" : "bg-destructive/10 text-destructive"
                  }`}
                >
                  {status.type === "success" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                  {status.msg}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Board list */}
            <h5 className="text-serif text-sm text-muted-foreground mb-2">Your Boards</h5>
            {loading && boards.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : boards.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No boards found</p>
            ) : (
              <div className="space-y-2 mb-4">
                {boards.map((board) => (
                  <motion.button
                    key={board.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={() => onBoardSelected?.(board.id)}
                    className={`w-full text-left p-3 rounded-xl text-sm transition-all ${
                      selectedBoardId === board.id
                        ? "glass border-accent/30 shadow-sm"
                        : "bg-secondary/50 hover:bg-secondary"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Folder className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground truncate text-xs">{board.name}</p>
                        {board.description && (
                          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{board.description}</p>
                        )}
                      </div>
                      {selectedBoardId === board.id && (
                        <div className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                      )}
                    </div>
                  </motion.button>
                ))}
              </div>
            )}

            {/* Sync actions */}
            {selectedBoardId && (
              <div className="space-y-2 mb-4">
                <div className="glass rounded-xl p-3">
                  <p className="text-xs text-muted-foreground mb-2">
                    Selected: <span className="text-foreground font-medium">{selectedBoard?.name}</span>
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={pullFromMiro}
                      disabled={syncing}
                      className="flex-1 py-2 rounded-lg border border-border text-xs flex items-center justify-center gap-1.5 hover:bg-secondary transition-colors disabled:opacity-50"
                    >
                      {syncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowDownLeft className="w-3 h-3" />}
                      Pull
                    </button>
                    <button
                      onClick={() => setStatus({ type: "success", msg: "Use Preview tab to push items" })}
                      className="flex-1 py-2 rounded-lg border border-border text-xs flex items-center justify-center gap-1.5 hover:bg-secondary transition-colors"
                    >
                      <ArrowUpRight className="w-3 h-3" />
                      Push
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Pulled items preview */}
            {pulledItems.length > 0 && (
              <div>
                <h5 className="text-serif text-sm text-muted-foreground mb-2">Board Items</h5>
                <div className="space-y-1.5">
                  {pulledItems.slice(0, 15).map((item) => (
                    <div key={item.id} className="bg-secondary/40 rounded-lg px-3 py-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground/60 capitalize text-[10px]">{item.type}</span>
                        <span className="text-foreground truncate">{item.data?.content?.replace(/<[^>]*>/g, "") || "—"}</span>
                      </div>
                    </div>
                  ))}
                  {pulledItems.length > 15 && (
                    <p className="text-[11px] text-muted-foreground/60 text-center py-1">
                      +{pulledItems.length - 15} more items
                    </p>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function _getSavedToken(): string | null {
  try { return localStorage.getItem("ethos-miro-token"); } catch { return null; }
}

export async function pushItemsToMiro(boardId: string, items: any[]) {
  const token = _getSavedToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
  };
  if (token) headers["x-miro-token"] = token;

  // Use Miro compatibility layer: normalize layout, simplify connectors, resolve collisions
  const miroItems = convertToMiroItems(items);

  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/miro-sync`, {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "push-items", boardId, items: miroItems }),
  });
  return res.json();
}

