import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Send, Loader2, Sparkles, Trash2, Plus, FolderOpen } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type Msg = { role: "user" | "assistant"; content: string };

interface ChatSession {
  id: string;
  name: string;
  messages: Msg[];
  date: string;
}

const SESSIONS_KEY = "ethos-chat-sessions";
const ACTIVE_KEY = "ethos-chat-active";
const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`;

function loadSessions(): ChatSession[] {
  try { return JSON.parse(localStorage.getItem(SESSIONS_KEY) || "[]"); } catch { return []; }
}

function loadActiveId(): string | null {
  try { return localStorage.getItem(ACTIVE_KEY); } catch { return null; }
}

interface AIChatPanelProps {
  onShareIdeas?: (ideas: string[]) => void;
}

export default function AIChatPanel({ onShareIdeas }: AIChatPanelProps = {}) {
  const [sessions, setSessions] = useState<ChatSession[]>(loadSessions);
  const [activeId, setActiveId] = useState<string | null>(loadActiveId);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load active session messages
  useEffect(() => {
    if (activeId) {
      const session = sessions.find(s => s.id === activeId);
      if (session) setMessages(session.messages);
    }
  }, [activeId]);

  // Persist sessions
  useEffect(() => {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions.slice(0, 30)));
  }, [sessions]);

  useEffect(() => {
    if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
  }, [activeId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // Auto-save current messages to active session
  useEffect(() => {
    if (activeId && messages.length > 0) {
      setSessions(prev => prev.map(s => s.id === activeId ? { ...s, messages, date: new Date().toISOString() } : s));
    }
    if (onShareIdeas) {
      const userIdeas = messages.filter(m => m.role === "user").map(m => m.content);
      onShareIdeas(userIdeas);
    }
  }, [messages, activeId, onShareIdeas]);

  const saveCurrentChat = () => {
    const name = messages.find(m => m.role === "user")?.content.slice(0, 40) || "Untitled";
    if (activeId) {
      setSessions(prev => prev.map(s => s.id === activeId ? { ...s, name, messages, date: new Date().toISOString() } : s));
    } else {
      const id = Date.now().toString();
      const session: ChatSession = { id, name, messages, date: new Date().toISOString() };
      setSessions(prev => [session, ...prev]);
      setActiveId(id);
    }
  };

  const newChat = () => {
    if (messages.length > 0 && !activeId) saveCurrentChat();
    setMessages([]);
    setActiveId(null);
    setShowSessions(false);
  };

  const loadChat = (session: ChatSession) => {
    if (messages.length > 0 && !activeId) saveCurrentChat();
    setMessages(session.messages);
    setActiveId(session.id);
    setShowSessions(false);
  };

  const deleteSession = (id: string) => {
    setSessions(prev => prev.filter(s => s.id !== id));
    if (activeId === id) { setMessages([]); setActiveId(null); }
  };

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    const userMsg: Msg = { role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    if (!activeId && messages.length === 0) {
      const id = Date.now().toString();
      const session: ChatSession = { id, name: text.slice(0, 40), messages: [userMsg], date: new Date().toISOString() };
      setSessions(prev => [session, ...prev]);
      setActiveId(id);
    }

    let assistantSoFar = "";
    const allMessages = [...messages, userMsg];

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: allMessages, mode: "ideation" }),
      });

      if (!resp.ok || !resp.body) throw new Error("Stream failed");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantSoFar += content;
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") {
                  return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
                }
                return [...prev, { role: "assistant", content: assistantSoFar }];
              });
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }
    } catch (e) {
      console.error(e);
      setMessages(prev => [...prev, { role: "assistant", content: "Sorry, something went wrong. Please try again." }]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages, activeId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Session bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border/50 shrink-0">
        <button onClick={() => setShowSessions(!showSessions)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <FolderOpen className="w-3 h-3" />
          Chats
          {sessions.length > 0 && <span className="text-[10px] bg-secondary rounded-full px-1.5">{sessions.length}</span>}
        </button>
        <button onClick={newChat} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors ml-auto">
          <Plus className="w-3 h-3" />
          New
        </button>
      </div>

      {/* Session list */}
      <AnimatePresence>
        {showSessions && sessions.length > 0 && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-b border-border/50">
            <div className="px-4 py-2 space-y-1 max-h-[150px] overflow-y-auto scrollbar-thin">
              {sessions.map(s => (
                <div key={s.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors ${activeId === s.id ? "bg-accent/10" : "bg-secondary/50 hover:bg-secondary"}`}>
                  <button onClick={() => loadChat(s)} className="flex-1 text-left min-w-0">
                    <span className="truncate block text-foreground">{s.name}</span>
                    <span className="text-[10px] text-muted-foreground/60">{new Date(s.date).toLocaleDateString()}</span>
                  </button>
                  <button onClick={() => deleteSession(s.id)} className="text-muted-foreground/40 hover:text-destructive transition-colors shrink-0">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain scrollbar-thin px-4 py-3 space-y-4" style={{ minHeight: 0, WebkitOverflowScrolling: "touch" }}>
        {messages.length === 0 && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center justify-center h-full text-center py-16">
            <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center mb-5">
              <Sparkles className="w-6 h-6 text-accent" />
            </div>
            <h3 className="text-2xl text-serif mb-3">Welcome to Ethos</h3>
            <p className="text-sm text-muted-foreground max-w-[320px] leading-relaxed mb-6">
              Your AI-powered creative workspace for brainstorming, organizing ideas, and turning thoughts into visual boards, presentations, and documents.
            </p>
            <div className="grid grid-cols-1 gap-2 text-left max-w-[300px] w-full">
              {[
                { emoji: "💡", title: "Ideate", desc: "Brainstorm and structure your ideas with AI" },
                { emoji: "📸", title: "Scan", desc: "Analyze images, PDFs, and docs for insights" },
                { emoji: "🎨", title: "Preview", desc: "Generate visual boards — mindmaps, flowcharts, grids" },
                { emoji: "🔄", title: "Sync", desc: "Push your boards directly to Miro" },
              ].map(item => (
                <div key={item.title} className="flex items-start gap-3 bg-secondary/30 rounded-xl px-3 py-2.5">
                  <span className="text-lg">{item.emoji}</span>
                  <div>
                    <p className="text-xs font-medium text-foreground">{item.title}</p>
                    <p className="text-[11px] text-muted-foreground leading-snug">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground/60 mt-6">Start by typing anything below ↓</p>
          </motion.div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${msg.role === "user" ? "bg-primary text-primary-foreground rounded-br-md" : "glass rounded-bl-md"}`}>
                {msg.role === "assistant" ? (
                  <div className="prose-ethos"><ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown></div>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
            <div className="glass rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span className="animate-pulse-slow">Thinking...</span>
            </div>
          </motion.div>
        )}
      </div>

      {/* Input */}
      <div className="px-4 pb-4 pt-2 shrink-0">
        {messages.length > 0 && (
          <button onClick={newChat} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2">
            <Plus className="w-3 h-3" />
            New chat
          </button>
        )}
        <div className="glass rounded-xl flex items-end gap-2 p-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="What's on your mind?"
            rows={1}
            className="flex-1 bg-transparent border-none outline-none resize-none text-sm py-1.5 px-2 placeholder:text-muted-foreground/60 min-h-[36px] max-h-[120px]"
          />
          <button
            onClick={send}
            disabled={!input.trim() || isLoading}
            className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shrink-0 disabled:opacity-30 hover:opacity-90 transition-opacity"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
