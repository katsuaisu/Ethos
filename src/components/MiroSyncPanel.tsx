import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Loader2, ArrowUpRight, ArrowDownLeft, CheckCircle2, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const MIRO_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/miro-sync`;

interface Board {
  id: string;
  name: string;
  description?: string;
}

interface MiroSyncProps {
  onBoardSelected?: (boardId: string) => void;
  selectedBoardId?: string;
}

export default function MiroSyncPanel({ onBoardSelected, selectedBoardId }: MiroSyncProps) {
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const fetchBoards = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(MIRO_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ action: "get-boards" }),
      });
      const data = await res.json();
      if (data.boards) setBoards(data.boards);
    } catch (e) {
      console.error(e);
      setStatus({ type: "error", msg: "Failed to fetch boards" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBoards(); }, [fetchBoards]);

  const pullFromMiro = async () => {
    if (!selectedBoardId) return;
    setSyncing(true);
    setStatus(null);
    try {
      const res = await fetch(MIRO_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ action: "get-items", boardId: selectedBoardId }),
      });
      const data = await res.json();
      setStatus({ type: "success", msg: `Pulled ${data.items?.length || 0} items from Miro` });
    } catch {
      setStatus({ type: "error", msg: "Pull failed" });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex flex-col h-full px-4 py-3 overflow-y-auto scrollbar-thin">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-serif text-lg">Miro Boards</h4>
        <button
          onClick={fetchBoards}
          disabled={loading}
          className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Status */}
      <AnimatePresence>
        {status && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg mb-3 ${
              status.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
            }`}
          >
            {status.type === "success" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
            {status.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Board list */}
      {loading && boards.length === 0 ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : boards.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No boards found</p>
      ) : (
        <div className="space-y-2">
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
              <p className="font-medium text-foreground truncate">{board.name}</p>
              {board.description && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{board.description}</p>
              )}
            </motion.button>
          ))}
        </div>
      )}

      {/* Sync actions */}
      {selectedBoardId && (
        <div className="mt-4 space-y-2">
          <button
            onClick={pullFromMiro}
            disabled={syncing}
            className="w-full py-2.5 rounded-xl border border-border text-sm flex items-center justify-center gap-2 hover:bg-secondary transition-colors disabled:opacity-50"
          >
            {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowDownLeft className="w-3.5 h-3.5" />}
            Pull from Miro
          </button>
        </div>
      )}
    </div>
  );
}

export async function pushItemsToMiro(boardId: string, items: any[]) {
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/miro-sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ action: "push-items", boardId, items }),
  });
  return res.json();
}
