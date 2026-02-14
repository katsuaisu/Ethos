import { useState } from "react";
import { FileText, Presentation, Table2, Download, Loader2, X, Sparkles, MessageSquare } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import PptxGenJS from "pptxgenjs";
import jsPDF from "jspdf";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import { saveAs } from "file-saver";
import * as XLSX from "xlsx";

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`;

interface ConvertDialogProps {
  items: { content: string; type: string; color?: string; connectedTo?: number[] }[];
  onClose: () => void;
}

type OutputFormat = "slides" | "document" | "sheet";
type DocStyle = "flowchart" | "report" | "outline" | "memo";

const OUTPUT_FORMATS = [
  { id: "slides" as const, label: "Slides", desc: "AI-designed presentation", icon: Presentation },
  { id: "document" as const, label: "Document", desc: "Formatted document", icon: FileText },
  { id: "sheet" as const, label: "Sheet", desc: "Structured spreadsheet", icon: Table2 },
];

const DOC_STYLES: { id: DocStyle; label: string }[] = [
  { id: "flowchart", label: "Flowchart Doc" },
  { id: "report", label: "Report" },
  { id: "outline", label: "Outline" },
  { id: "memo", label: "Memo" },
];

// Parse AI-generated markdown into structured slide data
interface SlideData {
  title: string;
  bullets: string[];
  notes: string;
}

function parseSlides(md: string): SlideData[] {
  const slides: SlideData[] = [];
  const sections = md.split(/^## /gm).filter(Boolean);
  for (const section of sections) {
    const lines = section.trim().split("\n");
    const title = lines[0]?.replace(/^#+\s*/, "").replace(/Slide\s*\d+[:\s-]*/i, "").trim() || "Untitled";
    const bullets: string[] = [];
    let notes = "";
    let inNotes = false;
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (/speaker\s*notes?/i.test(line) || /^notes?:/i.test(line)) { inNotes = true; continue; }
      if (inNotes) { if (line) notes += (notes ? " " : "") + line.replace(/^[-*]\s*/, ""); continue; }
      if (line.startsWith("- ") || line.startsWith("* ") || line.startsWith("• ")) {
        bullets.push(line.replace(/^[-*•]\s*/, ""));
      } else if (line && !line.startsWith("#")) {
        bullets.push(line);
      }
    }
    if (title || bullets.length) slides.push({ title, bullets: bullets.slice(0, 8), notes });
  }
  return slides.length > 0 ? slides : [{ title: "Board Content", bullets: md.split("\n").filter(l => l.trim()).slice(0, 8), notes: "" }];
}

// Parse markdown into document sections
interface DocSection {
  heading: string;
  level: number;
  paragraphs: string[];
}

function parseDocument(md: string): DocSection[] {
  const sections: DocSection[] = [];
  let current: DocSection = { heading: "", level: 0, paragraphs: [] };
  for (const line of md.split("\n")) {
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      if (current.heading || current.paragraphs.length) sections.push(current);
      current = { heading: headingMatch[2], level: headingMatch[1].length, paragraphs: [] };
    } else if (line.trim()) {
      current.paragraphs.push(line.replace(/^[-*•]\s*/, "").trim());
    }
  }
  if (current.heading || current.paragraphs.length) sections.push(current);
  return sections;
}

// Parse markdown table into rows
function parseTable(md: string): string[][] {
  const rows: string[][] = [];
  for (const line of md.split("\n")) {
    if (line.includes("|") && !line.match(/^[\s|:-]+$/)) {
      const cells = line.split("|").map(c => c.trim()).filter(Boolean);
      if (cells.length > 0) rows.push(cells);
    }
  }
  return rows;
}

async function readStream(resp: Response): Promise<string> {
  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let full = "", buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n")) !== -1) {
      let line = buf.slice(0, idx); buf = buf.slice(idx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line.startsWith("data: ")) continue;
      const jsonStr = line.slice(6).trim();
      if (jsonStr === "[DONE]") break;
      try { const p = JSON.parse(jsonStr); const c = p.choices?.[0]?.delta?.content; if (c) full += c; } catch {}
    }
  }
  return full;
}

// ── Export functions ──

function exportPPTX(content: string) {
  const slides = parseSlides(content);
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Ethos";

  // Title slide
  const titleSlide = pptx.addSlide();
  titleSlide.background = { color: "1a1a2e" };
  titleSlide.addText(slides[0]?.title || "Presentation", {
    x: 0.8, y: 1.5, w: 11, h: 1.5,
    fontSize: 36, fontFace: "Helvetica", color: "ffffff", bold: true, align: "left",
  });
  titleSlide.addText("Generated by Ethos", {
    x: 0.8, y: 3.2, w: 11, h: 0.5,
    fontSize: 14, fontFace: "Helvetica", color: "888899", align: "left",
  });

  // Content slides
  for (let i = 0; i < slides.length; i++) {
    const s = slides[i];
    const slide = i === 0 ? titleSlide : pptx.addSlide();
    if (i > 0) {
      slide.background = { color: "ffffff" };
      slide.addText(s.title, {
        x: 0.8, y: 0.4, w: 11, h: 0.8,
        fontSize: 28, fontFace: "Helvetica", color: "1a1a2e", bold: true,
      });
      // Bullets
      if (s.bullets.length > 0) {
        slide.addText(
          s.bullets.map(b => ({ text: b, options: { bullet: true, fontSize: 16, color: "333344", paraSpaceBefore: 6 } })),
          { x: 0.8, y: 1.5, w: 11, h: 4, fontFace: "Helvetica", valign: "top" }
        );
      }
      // Speaker notes
      if (s.notes) {
        slide.addNotes(s.notes);
      }
    }
  }

  pptx.writeFile({ fileName: "board-export.pptx" });
  toast.success("Downloaded PPTX presentation!");
}

function exportPDF(content: string, format: OutputFormat) {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 20;
  const maxWidth = pageWidth - margin * 2;
  let y = 25;

  const addPageIfNeeded = () => {
    if (y > 260) { pdf.addPage(); y = 25; }
  };

  // Title
  pdf.setFontSize(22);
  pdf.setFont("helvetica", "bold");
  pdf.text("Board Export", margin, y);
  y += 12;

  // Subtitle line
  pdf.setDrawColor(100, 100, 120);
  pdf.setLineWidth(0.5);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 10;

  // Content
  const lines = content.split("\n");
  for (const line of lines) {
    addPageIfNeeded();
    const trimmed = line.trim();
    if (!trimmed) { y += 4; continue; }

    if (trimmed.startsWith("## ")) {
      y += 6;
      pdf.setFontSize(16);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(26, 26, 46);
      const wrapped = pdf.splitTextToSize(trimmed.replace(/^##\s*/, ""), maxWidth);
      pdf.text(wrapped, margin, y);
      y += wrapped.length * 7 + 3;
    } else if (trimmed.startsWith("### ")) {
      y += 4;
      pdf.setFontSize(13);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(50, 50, 70);
      const wrapped = pdf.splitTextToSize(trimmed.replace(/^###\s*/, ""), maxWidth);
      pdf.text(wrapped, margin, y);
      y += wrapped.length * 6 + 2;
    } else if (trimmed.startsWith("# ")) {
      y += 6;
      pdf.setFontSize(20);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(26, 26, 46);
      const wrapped = pdf.splitTextToSize(trimmed.replace(/^#\s*/, ""), maxWidth);
      pdf.text(wrapped, margin, y);
      y += wrapped.length * 8 + 4;
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ") || trimmed.startsWith("• ")) {
      pdf.setFontSize(11);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(60, 60, 80);
      const bullet = "•  " + trimmed.replace(/^[-*•]\s*/, "");
      const wrapped = pdf.splitTextToSize(bullet, maxWidth - 5);
      pdf.text(wrapped, margin + 5, y);
      y += wrapped.length * 5 + 2;
    } else if (trimmed.includes("|")) {
      // Table row
      pdf.setFontSize(9);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(50, 50, 70);
      pdf.text(trimmed, margin, y);
      y += 5;
    } else {
      pdf.setFontSize(11);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(60, 60, 80);
      const wrapped = pdf.splitTextToSize(trimmed, maxWidth);
      pdf.text(wrapped, margin, y);
      y += wrapped.length * 5 + 2;
    }
  }

  // Footer
  const pageCount = pdf.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.setTextColor(150, 150, 170);
    pdf.text(`Generated by Ethos · Page ${i}/${pageCount}`, margin, 287);
  }

  pdf.save("board-export.pdf");
  toast.success("Downloaded PDF document!");
}

function exportDOCX(content: string, docStyle: DocStyle) {
  const sections = parseDocument(content);
  const children: Paragraph[] = [];

  // Title
  children.push(new Paragraph({
    text: `Board Export — ${docStyle.charAt(0).toUpperCase() + docStyle.slice(1)}`,
    heading: HeadingLevel.TITLE,
    alignment: AlignmentType.LEFT,
    spacing: { after: 300 },
  }));

  for (const section of sections) {
    if (section.heading) {
      children.push(new Paragraph({
        text: section.heading,
        heading: section.level === 1 ? HeadingLevel.HEADING_1 : section.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
        spacing: { before: 240, after: 120 },
      }));
    }
    for (const para of section.paragraphs) {
      const isBullet = para !== para.replace(/^[-*•]\s*/, "");
      children.push(new Paragraph({
        children: [new TextRun({ text: para.replace(/^[-*•]\s*/, ""), size: 22, font: "Calibri" })],
        bullet: isBullet ? { level: 0 } : undefined,
        spacing: { after: 80 },
      }));
    }
  }

  // Footer
  children.push(new Paragraph({
    children: [new TextRun({ text: "Generated by Ethos", size: 16, color: "999999", italics: true })],
    spacing: { before: 400 },
  }));

  const doc = new Document({
    sections: [{ children }],
    creator: "Ethos",
  });

  Packer.toBlob(doc).then(blob => {
    saveAs(blob, "board-export.docx");
    toast.success("Downloaded DOCX document!");
  });
}

function exportXLSX(content: string) {
  const rows = parseTable(content);
  if (rows.length === 0) {
    // Fallback: create simple sheet from content lines
    const lines = content.split("\n").filter(l => l.trim());
    const ws = XLSX.utils.aoa_to_sheet([["Content"], ...lines.map(l => [l.replace(/^[-*•#|]\s*/, "").trim()])]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Board Export");
    XLSX.writeFile(wb, "board-export.xlsx");
  } else {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Board Export");
    XLSX.writeFile(wb, "board-export.xlsx");
  }
  toast.success("Downloaded XLSX spreadsheet!");
}

export default function ConvertDialog({ items, onClose }: ConvertDialogProps) {
  const [format, setFormat] = useState<OutputFormat>("slides");
  const [docStyle, setDocStyle] = useState<DocStyle>("report");
  const [customPrompt, setCustomPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<string | null>(null);

  // Ask-the-user flow
  const [askMode, setAskMode] = useState(false);
  const [aiQuestion, setAiQuestion] = useState("");
  const [userAnswer, setUserAnswer] = useState("");
  const [loadingQ, setLoadingQ] = useState(false);
  const [answers, setAnswers] = useState<{ q: string; a: string }[]>([]);

  const boardData = items.map(i => i.content).join("\n- ");

  const askAiQuestion = async () => {
    setLoadingQ(true);
    try {
      const context = answers.map(a => `Q: ${a.q}\nA: ${a.a}`).join("\n");
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({
          messages: [{ role: "user", content: `You are helping convert board content into a ${format}. Board items:\n- ${boardData}\n\n${context ? `Previous answers:\n${context}\n\n` : ""}Ask ONE clarifying question to help produce a better ${format}. Be specific and short. Return ONLY the question text, nothing else.` }],
          mode: "ideation",
        }),
      });
      if (!resp.ok || !resp.body) throw new Error("Failed");
      const full = await readStream(resp);
      setAiQuestion(full.trim());
    } catch { toast.error("Failed to generate question"); }
    finally { setLoadingQ(false); }
  };

  const submitAnswer = () => {
    if (!userAnswer.trim()) return;
    setAnswers(prev => [...prev, { q: aiQuestion, a: userAnswer }]);
    setAiQuestion("");
    setUserAnswer("");
  };

  const generate = async () => {
    setGenerating(true);
    const answersContext = answers.length > 0 ? `\n\nUser preferences:\n${answers.map(a => `Q: ${a.q}\nA: ${a.a}`).join("\n")}` : "";

    const formatPrompts: Record<OutputFormat, string> = {
      slides: `Convert this board content into a beautifully structured slide presentation. For each slide, provide: slide number, title, bullet points, and speaker notes. Make it professional.\n\nBoard content:\n- ${boardData}${answersContext}\n\n${customPrompt ? `Additional instructions: ${customPrompt}\n\n` : ""}Format as clean markdown with ## for each slide title, - for bullet points, and "Speaker Notes:" followed by notes text.`,
      document: `Convert this board content into a well-formatted ${docStyle} document. ${
        docStyle === "flowchart" ? "Include a text-based flowchart using arrows (→) and boxes." :
        docStyle === "report" ? "Structure with executive summary, sections, and conclusion." :
        docStyle === "outline" ? "Create a hierarchical outline with clear nesting." :
        "Write as a concise business memo."
      }\n\nBoard content:\n- ${boardData}${answersContext}\n\n${customPrompt ? `Additional instructions: ${customPrompt}\n\n` : ""}Format as clean markdown with # for title, ## for sections, ### for subsections.`,
      sheet: `Convert this board content into a structured table/spreadsheet format. Create columns for: Item, Category, Priority, Status, Notes, Connections.\n\nBoard content:\n- ${boardData}${answersContext}\n\n${customPrompt ? `Additional instructions: ${customPrompt}\n\n` : ""}Format as a markdown table with | separators. Include header row.`,
    };

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({ messages: [{ role: "user", content: formatPrompts[format] }], mode: "ideation" }),
      });
      if (!resp.ok || !resp.body) throw new Error("Failed");
      const full = await readStream(resp);
      setGeneratedContent(full);
    } catch (e) {
      console.error(e);
      toast.error("Failed to convert");
    } finally { setGenerating(false); }
  };

  const downloadAsText = (ext: string) => {
    if (!generatedContent) return;
    const blob = new Blob([generatedContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `board-export.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded as .${ext}`);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-foreground/10 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}>
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="glass rounded-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/30">
          <div>
            <h3 className="text-serif text-lg text-foreground">Convert Board</h3>
            <p className="text-xs text-foreground/50">{items.length} elements to convert</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors">
            <X className="w-4 h-4 text-foreground/50" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {!generatedContent ? (
            <>
              {/* Format selection */}
              <div>
                <p className="text-xs font-medium text-foreground mb-2">Output Format</p>
                <div className="grid grid-cols-3 gap-2">
                  {OUTPUT_FORMATS.map(f => {
                    const Icon = f.icon;
                    return (
                      <button key={f.id} onClick={() => setFormat(f.id)}
                        className={`flex flex-col items-center gap-2 p-3 rounded-xl text-xs transition-all ${
                          format === f.id ? "bg-accent/10 text-accent border border-accent/20" : "bg-secondary/50 text-foreground/70 hover:bg-secondary border border-transparent"
                        }`}>
                        <Icon className="w-5 h-5" />
                        <span className="font-medium">{f.label}</span>
                        <span className="text-[9px] text-foreground/40">{f.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Doc style */}
              {format === "document" && (
                <div>
                  <p className="text-xs font-medium text-foreground mb-2">Document Style</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {DOC_STYLES.map(s => (
                      <button key={s.id} onClick={() => setDocStyle(s.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs transition-all ${
                          docStyle === s.id ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground/70 hover:bg-secondary/80"
                        }`}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Ask AI for guidance */}
              <div>
                <button onClick={() => { setAskMode(!askMode); if (!askMode && !aiQuestion) askAiQuestion(); }}
                  className="flex items-center gap-1.5 text-xs text-accent font-medium hover:underline mb-2">
                  <MessageSquare className="w-3 h-3" />
                  {askMode ? "Hide AI guidance" : "Let AI ask you questions first"}
                </button>
                {askMode && (
                  <div className="space-y-2">
                    {answers.map((a, i) => (
                      <div key={i} className="bg-secondary/50 rounded-lg px-3 py-2 text-xs">
                        <p className="text-foreground/50">{a.q}</p>
                        <p className="text-foreground mt-0.5">{a.a}</p>
                      </div>
                    ))}
                    {loadingQ ? (
                      <div className="flex items-center gap-2 text-xs text-foreground/50">
                        <Loader2 className="w-3 h-3 animate-spin" />Thinking...
                      </div>
                    ) : aiQuestion ? (
                      <div className="glass rounded-lg p-3 space-y-2">
                        <p className="text-xs text-foreground font-medium">{aiQuestion}</p>
                        <div className="flex gap-2">
                          <input value={userAnswer} onChange={(e) => setUserAnswer(e.target.value)}
                            placeholder="Your answer..."
                            className="flex-1 bg-transparent border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-accent/40 placeholder:text-foreground/30"
                            onKeyDown={(e) => { if (e.key === "Enter") { submitAnswer(); askAiQuestion(); } }} />
                          <button onClick={() => { submitAnswer(); askAiQuestion(); }} disabled={!userAnswer.trim()}
                            className="px-3 py-1.5 rounded-lg bg-accent text-accent-foreground text-xs font-medium disabled:opacity-40">
                            Next
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              {/* Custom instructions */}
              <div>
                <p className="text-xs font-medium text-foreground mb-2">Additional Instructions (optional)</p>
                <textarea value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="e.g. 'Make it more formal', 'Add metrics section', 'Focus on Q1 goals'"
                  rows={2}
                  className="w-full bg-transparent border border-border rounded-lg p-3 text-sm text-foreground outline-none focus:ring-1 focus:ring-accent/40 resize-none placeholder:text-foreground/30" />
              </div>

              <button onClick={generate} disabled={generating}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50">
                {generating ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /><span className="animate-pulse-slow">Converting...</span></>
                ) : (
                  <><Sparkles className="w-4 h-4" />Convert</>
                )}
              </button>
            </>
          ) : (
            <>
              {/* Generated content preview */}
              <div className="glass rounded-xl p-4 max-h-[250px] overflow-y-auto scrollbar-thin">
                <pre className="text-xs text-foreground whitespace-pre-wrap leading-relaxed font-sans">{generatedContent}</pre>
              </div>

              {/* Real file downloads */}
              <div>
                <p className="text-xs font-medium text-foreground mb-2">Download as Real File</p>
                <div className="flex gap-2 flex-wrap">
                  {format === "slides" && (
                    <>
                      <button onClick={() => exportPPTX(generatedContent!)} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity">
                        <Presentation className="w-3.5 h-3.5" />PowerPoint (.pptx)
                      </button>
                      <button onClick={() => exportPDF(generatedContent!, format)} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-accent/30 text-xs text-accent hover:bg-accent/5 transition-colors">
                        <Download className="w-3.5 h-3.5" />PDF
                      </button>
                    </>
                  )}
                  {format === "document" && (
                    <>
                      <button onClick={() => exportDOCX(generatedContent!, docStyle)} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity">
                        <FileText className="w-3.5 h-3.5" />Word (.docx)
                      </button>
                      <button onClick={() => exportPDF(generatedContent!, format)} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-accent/30 text-xs text-accent hover:bg-accent/5 transition-colors">
                        <Download className="w-3.5 h-3.5" />PDF
                      </button>
                    </>
                  )}
                  {format === "sheet" && (
                    <>
                      <button onClick={() => exportXLSX(generatedContent!)} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity">
                        <Table2 className="w-3.5 h-3.5" />Excel (.xlsx)
                      </button>
                      <button onClick={() => exportPDF(generatedContent!, format)} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-accent/30 text-xs text-accent hover:bg-accent/5 transition-colors">
                        <Download className="w-3.5 h-3.5" />PDF
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Markdown/text fallback */}
              <div>
                <p className="text-xs font-medium text-foreground/50 mb-2">Also available as</p>
                <div className="flex gap-2">
                  <button onClick={() => downloadAsText("md")} className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-border text-xs text-foreground/50 hover:bg-secondary transition-colors">
                    <Download className="w-3 h-3" />Markdown
                  </button>
                  <button onClick={() => downloadAsText("txt")} className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-border text-xs text-foreground/50 hover:bg-secondary transition-colors">
                    <Download className="w-3 h-3" />Text
                  </button>
                </div>
              </div>

              <button onClick={() => { setGeneratedContent(null); setAnswers([]); }}
                className="w-full py-2 rounded-xl border border-border text-sm text-foreground/60 hover:bg-secondary transition-colors">
                Convert Again
              </button>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
