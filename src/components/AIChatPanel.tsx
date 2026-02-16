import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Send, Loader2, Sparkles, Trash2, Plus, FolderOpen, Paperclip, Link, X, FileText } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

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
const URL_EXTRACT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/url-extract`;
const FILE_EXTRACT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/file-extract`;

const ACCEPTED_FILES = ".pdf,.pptx,.ppt,.docx,.doc,.txt,.md,.csv,.json,.xml";

function loadSessions(): ChatSession[] {
  try { return JSON.parse(localStorage.getItem(SESSIONS_KEY) || "[]"); } catch { return []; }
}

function loadActiveId(): string | null {
  try { return localStorage.getItem(ACTIVE_KEY); } catch { return null; }
}

interface AIChatPanelProps {
  onShareIdeas?: (ideas: string[]) => void;
  onTransformToBoard?: (content: string) => void;
}

export default function AIChatPanel({ onShareIdeas, onTransformToBoard }: AIChatPanelProps = {}) {
  const [sessions, setSessions] = useState<ChatSession[]>(loadSessions);
  const [activeId, setActiveId] = useState<string | null>(loadActiveId);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // File/URL upload state
  const [attachedFile, setAttachedFile] = useState<{ name: string; content: string; extractedText?: string; dataUrl?: string; mimeType?: string } | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [fetchingUrl, setFetchingUrl] = useState(false);
  const [extractingFile, setExtractingFile] = useState(false);
  const [attachedUrl, setAttachedUrl] = useState<{ title: string; content: string; structured?: any } | null>(null);

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
    setAttachedFile(null);
    setAttachedUrl(null);
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

  // Handle file attachment
  const handleFileSelect = useCallback(async (file: File) => {
    const isTextFile = file.type.startsWith("text/") || /\.(txt|md|csv|json|xml|log|yaml|yml|toml|ini|cfg)$/i.test(file.name);
    const isBinaryDoc = /\.(pdf|pptx?|docx?)$/i.test(file.name);
    
    if (isTextFile) {
      // Read text files directly
      const textReader = new FileReader();
      textReader.onload = (te) => {
        const text = te.target?.result as string;
        setAttachedFile({ name: file.name, content: text, extractedText: text });
        toast.success(`Attached: ${file.name}`);
      };
      textReader.readAsText(file);
    } else if (isBinaryDoc) {
      // Binary docs (PDF, DOCX, PPTX): send as multimodal to AI directly
      // Gemini can natively read PDFs and other document formats
      setExtractingFile(true);
      toast.info(`Processing ${file.name}...`);
      
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const mimeType = file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 
          file.name.endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' :
          file.name.endsWith('.pptx') ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation' :
          'application/octet-stream');
        
        setAttachedFile({ 
          name: file.name, 
          content: `[${file.name} — will be sent directly to AI for analysis]`,
          extractedText: `📄 File "${file.name}" attached as a document. The AI will read it directly.`,
          dataUrl,
          mimeType,
        });
        setExtractingFile(false);
        toast.success(`Attached: ${file.name} (will be analyzed by AI directly)`);
      };
      reader.readAsDataURL(file);
    } else {
      // Other binary files: try extraction backend
      setExtractingFile(true);
      toast.info(`Processing ${file.name}...`);
      
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target?.result as string;
        try {
          const res = await fetch(FILE_EXTRACT, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({ fileData: dataUrl, fileName: file.name }),
          });
          const data = await res.json();
          if (data.error) throw new Error(data.error);
          
          let extractedText = "";
          if (data.sections && data.sections.length > 0) {
            extractedText = data.sections.map((s: any) => `## ${s.heading}\n${s.content}`).join("\n\n");
          } else {
            extractedText = data.fullText || data.summary || "";
          }
          
          setAttachedFile({ 
            name: file.name, 
            content: `[${data.wordCount || 0} words extracted]`,
            extractedText 
          });
          toast.success(`Extracted content from: ${file.name} (${data.wordCount || 0} words)`);
        } catch (err: any) {
          console.error("File extraction failed:", err);
          toast.error(`Failed to extract text from ${file.name}`);
          setAttachedFile({ 
            name: file.name, 
            content: dataUrl,
            extractedText: `[File extraction failed for ${file.name}. The file may be in an unsupported format.]`
          });
        } finally {
          setExtractingFile(false);
        }
      };
      reader.readAsDataURL(file);
    }
  }, []);

  // Fetch URL content with type detection and validation
  const fetchUrl = async () => {
    if (!urlInput.trim()) return;
    setFetchingUrl(true);
    try {
      let formattedUrl = urlInput.trim();
      if (!formattedUrl.startsWith("http")) formattedUrl = `https://${formattedUrl}`;

      const res = await fetch(URL_EXTRACT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ url: formattedUrl }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      // Validate: backend now returns urlType and validated content
      const urlType = data.urlType || "webpage";
      
      // Build structured content string from extraction
      let structuredContent = "";
      if (data.structured?.sections && data.structured.sections.length > 0) {
        structuredContent = data.structured.sections.map((s: any) => `## ${s.heading}\n${s.content}`).join("\n\n");
        if (data.structured.keyConcepts?.length > 0) {
          structuredContent += "\n\n## Key Concepts\n" + data.structured.keyConcepts.map((c: string) => `- ${c}`).join("\n");
        }
      } else {
        structuredContent = data.content || "";
      }

      // Guard: if content is empty after extraction, warn user
      if (!structuredContent || structuredContent.trim().length < 20) {
        if (urlType === "youtube") {
          throw new Error("Transcript unavailable for this video. Only title and metadata were extracted. Please upload the transcript manually if needed.");
        }
        throw new Error("Unable to extract meaningful content from this page. The page may be dynamic or require JavaScript.");
      }
      
      setAttachedUrl({ 
        title: data.title || formattedUrl, 
        content: structuredContent,
        structured: data.structured 
      });
      setShowUrlInput(false);
      setUrlInput("");
      toast.success(`Fetched: ${data.title || formattedUrl}${urlType === "youtube" ? " (YouTube)" : ""}`);
    } catch (e: any) {
      toast.error(e.message || "Unable to retrieve page content. Please check the link.");
    } finally {
      setFetchingUrl(false);
    }
  };

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");

    // Build the message with extracted context — NEVER send raw binary
    let fullMessage = text;
    const fileAttachments: { dataUrl: string; mimeType: string }[] = [];
    
    if (attachedFile) {
      if (attachedFile.dataUrl && attachedFile.mimeType) {
        // Multimodal: send file directly to AI
        fullMessage += `\n\n---\n📄 ATTACHED FILE: ${attachedFile.name}\nPlease analyze this document thoroughly.`;
        fileAttachments.push({ dataUrl: attachedFile.dataUrl, mimeType: attachedFile.mimeType });
      } else {
        // Text-extracted content
        const extractedContent = attachedFile.extractedText || attachedFile.content;
        fullMessage += `\n\n---\n📄 EXTRACTED DOCUMENT: ${attachedFile.name}\n${extractedContent.slice(0, 8000)}`;
      }
    }
    if (attachedUrl) {
      fullMessage += `\n\n---\n🔗 EXTRACTED URL: ${attachedUrl.title}\n${attachedUrl.content.slice(0, 8000)}`;
    }

    const userMsg: Msg = { role: "user", content: fullMessage };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);
    setAttachedFile(null);
    setAttachedUrl(null);

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
        body: JSON.stringify({ 
          messages: allMessages, 
          mode: "ideation",
          fileAttachments: fileAttachments.length > 0 ? fileAttachments : undefined,
        }),
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
  }, [input, isLoading, messages, activeId, attachedFile, attachedUrl]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  // Quick actions for content transformation
  const transformActions = messages.length > 0 ? [
    { label: "→ Board", action: () => { if (onTransformToBoard) { const lastAssistant = messages.filter(m => m.role === "assistant").pop(); if (lastAssistant) onTransformToBoard(lastAssistant.content); } } },
  ] : [];

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
            <div className="w-14 h-14 rounded-2xl border border-border flex items-center justify-center mb-5">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-foreground">
                <path d="M12 2L14.09 8.26L20.18 8.63L15.54 12.74L17.09 19.37L12 15.77L6.91 19.37L8.46 12.74L3.82 8.63L9.91 8.26L12 2Z" fill="currentColor" opacity="0.9"/>
                <circle cx="12" cy="12" r="3" fill="hsl(var(--background))" />
              </svg>
            </div>
            <h3 className="text-2xl text-serif mb-3">Ethos</h3>
            <p className="text-sm text-muted-foreground max-w-[320px] leading-relaxed mb-6">
              Your creative workspace for brainstorming, organizing ideas, and turning thoughts into visual boards, presentations, and documents.
            </p>
            <div className="grid grid-cols-1 gap-2 text-left max-w-[300px] w-full">
              {[
                { title: "Ideate", desc: "Brainstorm and structure your ideas with AI" },
                { title: "Upload", desc: "Attach PDFs, docs, or paste URLs for AI analysis" },
                { title: "Transform", desc: "Turn conversations into boards, slides, or docs" },
                { title: "Sync", desc: "Push your boards directly to Miro" },
              ].map(item => (
                <div key={item.title} className="flex items-start gap-3 bg-secondary/30 rounded-xl px-3 py-2.5">
                  <div className="w-6 h-6 rounded-md border border-border/60 flex items-center justify-center shrink-0 mt-0.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-foreground">{item.title}</p>
                    <p className="text-[11px] text-muted-foreground leading-snug">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground/60 mt-6">Start by typing, uploading a file, or pasting a URL</p>
          </motion.div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${msg.role === "user" ? "bg-primary text-primary-foreground rounded-br-md" : "glass rounded-bl-md"}`}>
                {msg.role === "assistant" ? (
                  <div className="prose-ethos"><ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown></div>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content.length > 500 ? msg.content.slice(0, 500) + "..." : msg.content}</p>
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

      {/* Input area */}
      <div className="px-4 pb-4 pt-2 shrink-0">
        {/* Transform actions */}
        {transformActions.length > 0 && (
          <div className="flex gap-1.5 mb-2">
            {transformActions.map((ta, i) => (
              <button key={i} onClick={ta.action} className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-accent/10 text-accent hover:bg-accent/15 transition-colors">
                {ta.label}
              </button>
            ))}
          </div>
        )}

        {/* Attached file/URL previews */}
        {(attachedFile || attachedUrl || extractingFile) && (
          <div className="flex gap-2 mb-2 flex-wrap">
            {extractingFile && (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-accent/10 text-xs">
                <Loader2 className="w-3 h-3 text-accent animate-spin" />
                <span className="text-accent">Extracting text...</span>
              </div>
            )}
            {attachedFile && (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-secondary/60 text-xs">
                <FileText className="w-3 h-3 text-accent" />
                <span className="text-foreground truncate max-w-[120px]">{attachedFile.name}</span>
                {attachedFile.extractedText && <span className="text-[10px] text-accent">✓</span>}
                <button onClick={() => setAttachedFile(null)} className="text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /></button>
              </div>
            )}
            {attachedUrl && (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-secondary/60 text-xs">
                <Link className="w-3 h-3 text-accent" />
                <span className="text-foreground truncate max-w-[120px]">{attachedUrl.title}</span>
                <button onClick={() => setAttachedUrl(null)} className="text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /></button>
              </div>
            )}
          </div>
        )}

        {/* URL input */}
        <AnimatePresence>
          {showUrlInput && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mb-2">
              <div className="flex gap-2 items-center">
                <input
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://example.com"
                  className="flex-1 bg-secondary/50 border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-accent/40 placeholder:text-muted-foreground/50"
                  onKeyDown={(e) => { if (e.key === "Enter") fetchUrl(); }}
                  autoFocus
                />
                <button onClick={fetchUrl} disabled={!urlInput.trim() || fetchingUrl}
                  className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium disabled:opacity-40">
                  {fetchingUrl ? <Loader2 className="w-3 h-3 animate-spin" /> : "Fetch"}
                </button>
                <button onClick={() => { setShowUrlInput(false); setUrlInput(""); }} className="text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {messages.length > 0 && (
          <button onClick={newChat} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2">
            <Plus className="w-3 h-3" />
            New chat
          </button>
        )}

        <input ref={fileRef} type="file" accept={ACCEPTED_FILES} className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]); e.target.value = ""; }} />

        <div className="glass rounded-xl flex items-end gap-2 p-2">
          {/* Attachment buttons */}
          <div className="flex gap-1 shrink-0 pb-1">
            <button onClick={() => fileRef.current?.click()} className="w-7 h-7 rounded-lg hover:bg-secondary flex items-center justify-center transition-colors" title="Attach file">
              <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            <button onClick={() => setShowUrlInput(!showUrlInput)} className="w-7 h-7 rounded-lg hover:bg-secondary flex items-center justify-center transition-colors" title="Paste URL">
              <Link className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>
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
