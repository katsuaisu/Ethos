import { useState } from "react";
import { FileText, Presentation, Table2, Download, Loader2, X, Sparkles, MessageSquare, Palette, Image } from "lucide-react";
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

// ── Slide design themes ──
interface SlideTheme {
  name: string;
  titleBg: string;
  contentBg: string;
  accentColor: string;
  accent2Color: string;
  titleColor: string;
  textColor: string;
  subtitleColor: string;
  bulletColor: string;
  titleFont: string;
  bodyFont: string;
  style: "elegant" | "bold" | "playful" | "minimal" | "dark" | "warm" | "retro" | "nature";
}

const SLIDE_THEMES: SlideTheme[] = [
  {
    name: "Soft Blush",
    titleBg: "FFF0ED", contentBg: "FFFAF8", accentColor: "E8788A", accent2Color: "F4B8C1",
    titleColor: "2D1519", textColor: "4A2830", subtitleColor: "C4636F", bulletColor: "E8788A",
    titleFont: "Georgia", bodyFont: "Calibri", style: "elegant",
  },
  {
    name: "Lavender Dream",
    titleBg: "F3EDFA", contentBg: "FAF8FF", accentColor: "9B72CF", accent2Color: "C9B1E8",
    titleColor: "1E1333", textColor: "352450", subtitleColor: "8E6AC0", bulletColor: "9B72CF",
    titleFont: "Georgia", bodyFont: "Calibri", style: "playful",
  },
  {
    name: "Mint Fresh",
    titleBg: "E8F7F1", contentBg: "F5FDF9", accentColor: "4ECBA0", accent2Color: "A3E4CC",
    titleColor: "0D2B20", textColor: "1A4030", subtitleColor: "3DB88E", bulletColor: "4ECBA0",
    titleFont: "Calibri Light", bodyFont: "Calibri", style: "minimal",
  },
  {
    name: "Peach Sunset",
    titleBg: "FFF0E5", contentBg: "FFFAF5", accentColor: "FF8C5A", accent2Color: "FFB899",
    titleColor: "2D1508", textColor: "4A2810", subtitleColor: "E07540", bulletColor: "FF8C5A",
    titleFont: "Georgia", bodyFont: "Calibri", style: "bold",
  },
  {
    name: "Sky Blue",
    titleBg: "E8F3FF", contentBg: "F5FAFF", accentColor: "4A9FD9", accent2Color: "96C8EE",
    titleColor: "0C1E2E", textColor: "1A3650", subtitleColor: "3A8DC0", bulletColor: "4A9FD9",
    titleFont: "Calibri Light", bodyFont: "Calibri", style: "minimal",
  },
  {
    name: "Dark Elegance",
    titleBg: "111118", contentBg: "18182A", accentColor: "E94560", accent2Color: "FF7B93",
    titleColor: "FFFFFF", textColor: "C0C0D0", subtitleColor: "707088", bulletColor: "E94560",
    titleFont: "Georgia", bodyFont: "Calibri", style: "dark",
  },
  {
    name: "Warm Cream",
    titleBg: "FDF5E6", contentBg: "FFFCF5", accentColor: "D4A574", accent2Color: "E8C9A4",
    titleColor: "2A1E12", textColor: "4A3620", subtitleColor: "B8956A", bulletColor: "D4A574",
    titleFont: "Georgia", bodyFont: "Calibri", style: "elegant",
  },
  {
    name: "Rose Gold",
    titleBg: "FFF5F5", contentBg: "FFFAFA", accentColor: "C9787C", accent2Color: "E8B4B8",
    titleColor: "3D1A1D", textColor: "5A2D30", subtitleColor: "B06B6F", bulletColor: "C9787C",
    titleFont: "Georgia", bodyFont: "Calibri", style: "warm",
  },
  {
    name: "Midnight Navy",
    titleBg: "0F1729", contentBg: "151E33", accentColor: "5B8DEF", accent2Color: "8FB5F5",
    titleColor: "E8EDF5", textColor: "B0BDD4", subtitleColor: "6B7FA0", bulletColor: "5B8DEF",
    titleFont: "Georgia", bodyFont: "Calibri", style: "dark",
  },
  {
    name: "Sage Garden",
    titleBg: "EFF3EC", contentBg: "F7F9F5", accentColor: "7DA47A", accent2Color: "A8C9A5",
    titleColor: "1C2B1A", textColor: "344032", subtitleColor: "6B8F68", bulletColor: "7DA47A",
    titleFont: "Georgia", bodyFont: "Calibri", style: "nature",
  },
  {
    name: "Coral Reef",
    titleBg: "FFF2EE", contentBg: "FFF9F7", accentColor: "FF6B6B", accent2Color: "FFA0A0",
    titleColor: "2D1111", textColor: "4A2020", subtitleColor: "D45555", bulletColor: "FF6B6B",
    titleFont: "Georgia", bodyFont: "Calibri", style: "bold",
  },
  {
    name: "Mauve Noir",
    titleBg: "1A141F", contentBg: "221B28", accentColor: "B07CC5", accent2Color: "D4A8E2",
    titleColor: "F0E5F5", textColor: "C5B0D0", subtitleColor: "8A6FA0", bulletColor: "B07CC5",
    titleFont: "Georgia", bodyFont: "Calibri", style: "dark",
  },
  {
    name: "Honey Butter",
    titleBg: "FFF8E7", contentBg: "FFFCF0", accentColor: "E6A817", accent2Color: "F0CB60",
    titleColor: "2A2008", textColor: "4A3D15", subtitleColor: "C49210", bulletColor: "E6A817",
    titleFont: "Georgia", bodyFont: "Calibri", style: "warm",
  },
  {
    name: "Arctic Ice",
    titleBg: "F0F5FA", contentBg: "F7FAFC", accentColor: "5AA3C7", accent2Color: "8FC5DD",
    titleColor: "0E2030", textColor: "1E3A50", subtitleColor: "4A8EB0", bulletColor: "5AA3C7",
    titleFont: "Calibri Light", bodyFont: "Calibri", style: "minimal",
  },
];

// ── Slide type detection ──
type SlideType = "title" | "section-divider" | "content" | "comparison" | "data-heavy" | "visual-heavy" | "quote" | "big-statement";

interface SlideData {
  title: string;
  subtitle?: string;
  bullets: string[];
  notes: string;
  slideType: SlideType;
  leftCol?: string[];
  rightCol?: string[];
}

// Strip ALL markdown formatting — aggressive
function stripMd(text: string): string {
  return text
    .replace(/\*\*\*(.+?)\*\*\*/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/`{1,3}(.+?)`{1,3}/g, "$1")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#+\s*/, "")
    .replace(/\*{1,3}/g, "")
    .replace(/_{1,3}/g, "")
    .replace(/`/g, "")
    .replace(/\[/g, "").replace(/\]/g, "")
    .replace(/\(/g, "(").replace(/\)/g, ")")
    .trim();
}

// Compress text: max words per bullet, split long paragraphs
function compressBullet(text: string, maxWords = 18): string {
  const clean = stripMd(text);
  const words = clean.split(/\s+/);
  if (words.length <= maxWords) return clean;
  return words.slice(0, maxWords).join(" ") + "...";
}

// Detect slide type from content
function detectSlideType(title: string, bullets: string[], index: number, total: number): SlideType {
  if (index === 0) return "title";
  if (index === total - 1) return "big-statement";
  
  const titleLower = title.toLowerCase();
  
  // Section divider: short title, 0-1 bullets
  if (bullets.length <= 1 && title.length < 40) return "section-divider";
  
  // Comparison: title suggests comparison, or "vs", "versus", "compared"
  if (/vs\.?|versus|compar|differ|contrast/i.test(titleLower) || bullets.length >= 4 && bullets.length % 2 === 0) {
    return "comparison";
  }
  
  // Data-heavy: numbers, percentages, stats
  const numericBullets = bullets.filter(b => /\d+[%$€£]|\d{2,}/.test(b)).length;
  if (numericBullets >= 2 || /data|metric|stat|number|kpi|result/i.test(titleLower)) return "data-heavy";
  
  // Quote: starts with quote marks or is very short
  if (/^["'""]/.test(title) || /quote|said|words/i.test(titleLower)) return "quote";
  
  // Visual-heavy: few bullets, strong title
  if (bullets.length <= 2 && title.length > 15) return "visual-heavy";
  
  return "content";
}

function parseSlides(md: string): SlideData[] {
  const slides: SlideData[] = [];
  const sections = md.split(/^## /gm).filter(Boolean);
  
  for (const section of sections) {
    const lines = section.trim().split("\n");
    const rawTitle = lines[0]?.replace(/^#+\s*/, "").replace(/Slide\s*\d+[:\s-]*/i, "").trim() || "Untitled";
    const title = stripMd(rawTitle);
    const bullets: string[] = [];
    let notes = "";
    let subtitle = "";
    let inNotes = false;
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (/speaker\s*notes?/i.test(line) || /^notes?:/i.test(line)) { inNotes = true; continue; }
      if (/^layout:\s*/i.test(line)) continue; // ignore old layout hints
      if (/^subtitle:\s*/i.test(line)) { subtitle = stripMd(line.replace(/^subtitle:\s*/i, "").trim()); continue; }
      if (inNotes) { if (line) notes += (notes ? " " : "") + stripMd(line.replace(/^[-*]\s*/, "")); continue; }
      if (line.startsWith("- ") || line.startsWith("* ") || line.startsWith("• ") || /^\d+[.)]\s/.test(line)) {
        bullets.push(compressBullet(line.replace(/^[-*•]\s*/, "").replace(/^\d+[.)]\s*/, "")));
      } else if (line && !line.startsWith("#") && !line.startsWith("---")) {
        if (!subtitle && bullets.length === 0) subtitle = stripMd(line);
        else bullets.push(compressBullet(line));
      }
    }
    
    if (title || bullets.length) {
      // Auto-split dense slides (max 5 bullets per slide)
      if (bullets.length > 5) {
        const firstBatch = bullets.slice(0, 5);
        const secondBatch = bullets.slice(5);
        slides.push({ title, subtitle, bullets: firstBatch, notes, slideType: "content" });
        if (secondBatch.length > 0) {
          slides.push({ title: title + " (cont.)", subtitle: "", bullets: secondBatch.slice(0, 5), notes: "", slideType: "content" });
        }
      } else {
        slides.push({ title, subtitle, bullets, notes, slideType: "content" });
      }
    }
  }
  
  // Apply slide type detection
  const total = slides.length;
  slides.forEach((s, i) => {
    s.slideType = detectSlideType(s.title, s.bullets, i, total);
    // For comparison, split into left/right columns
    if (s.slideType === "comparison" && s.bullets.length >= 2) {
      const half = Math.ceil(s.bullets.length / 2);
      s.leftCol = s.bullets.slice(0, half);
      s.rightCol = s.bullets.slice(half);
    }
  });
  
  return slides.length > 0 ? slides : [{ title: "Board Content", subtitle: "", bullets: md.split("\n").filter(l => l.trim()).slice(0, 5).map(l => compressBullet(l)), notes: "", slideType: "title" as SlideType }];
}

// Parse markdown into document sections
interface DocSection { heading: string; level: number; paragraphs: string[]; }

function parseDocument(md: string): DocSection[] {
  const sections: DocSection[] = [];
  let current: DocSection = { heading: "", level: 0, paragraphs: [] };
  for (const line of md.split("\n")) {
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      if (current.heading || current.paragraphs.length) sections.push(current);
      current = { heading: stripMd(headingMatch[2]), level: headingMatch[1].length, paragraphs: [] };
    } else if (line.trim()) {
      current.paragraphs.push(stripMd(line.replace(/^[-*•]\s*/, "").trim()));
    }
  }
  if (current.heading || current.paragraphs.length) sections.push(current);
  return sections;
}

function parseTable(md: string): string[][] {
  const rows: string[][] = [];
  for (const line of md.split("\n")) {
    if (line.includes("|") && !line.match(/^[\s|:-]+$/)) {
      const cells = line.split("|").map(c => stripMd(c.trim())).filter(Boolean);
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

// ── Helper: add shape to slide ──
function addShape(slide: any, type: "rect" | "ellipse" | "roundRect" | "triangle", opts: any) {
  slide.addText("", { ...opts, shape: type as any });
}

// ══════════════════════════════════════════════════════════════
// DESIGNER-GRADE PPTX ENGINE
// Role: Senior Graphic Designer specializing in high-impact decks
// ══════════════════════════════════════════════════════════════

function exportPPTX(content: string, theme: SlideTheme) {
  const slides = parseSlides(content);
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Ethos";

  const isDark = theme.style === "dark";
  const W = 13.33;
  const H = 7.5;

  // ── Typography scale ──
  const TYPE = {
    heroTitle: 52,
    slideTitle: 32,
    sectionTitle: 44,
    subtitle: 16,
    body: 14,
    caption: 10,
    stat: 36,
    quote: 28,
    label: 9,
  };

  // ── Spacing system ──
  const MARGIN = { left: 1.0, right: 1.0, top: 0.7, contentTop: 2.0, bulletSpacing: 0.58 };
  const CONTENT_W = W - MARGIN.left - MARGIN.right;

  // ── Decorative layer helpers ──
  function addAccentStrip(slide: any, pos: "top" | "bottom" | "left") {
    if (pos === "left") addShape(slide, "rect", { x: 0, y: 0, w: 0.05, h: H, fill: { color: theme.accentColor } });
    if (pos === "top") addShape(slide, "rect", { x: 0, y: 0, w: W, h: 0.04, fill: { color: theme.accentColor } });
    if (pos === "bottom") addShape(slide, "rect", { x: 0, y: H - 0.04, w: W, h: 0.04, fill: { color: theme.accentColor } });
  }

  function addCornerBlob(slide: any, corner: "tr" | "bl" | "br", size = 3, transparency = 88) {
    const pos = corner === "tr" ? { x: W - size * 0.6, y: -size * 0.4 }
      : corner === "bl" ? { x: -size * 0.3, y: H - size * 0.6 }
      : { x: W - size * 0.5, y: H - size * 0.5 };
    addShape(slide, "ellipse", { ...pos, w: size, h: size, fill: { color: theme.accentColor, transparency } });
  }

  function addSecondaryBlob(slide: any, x: number, y: number, size = 2, transparency = 92) {
    addShape(slide, "ellipse", { x, y, w: size, h: size, fill: { color: theme.accent2Color, transparency } });
  }

  function addDotGrid(slide: any, startX: number, startY: number, cols: number, rows: number) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        addShape(slide, "ellipse", {
          x: startX + c * 0.22, y: startY + r * 0.22, w: 0.05, h: 0.05,
          fill: { color: theme.accentColor, transparency: 82 },
        });
      }
    }
  }

  function addLineAccent(slide: any, x: number, y: number, w: number, h = 0.035) {
    addShape(slide, "rect", { x, y, w, h, fill: { color: theme.accentColor } });
  }

  function addDiamondCluster(slide: any, x: number, y: number, transparency = 85) {
    addShape(slide, "rect", { x, y, w: 0.28, h: 0.28, fill: { color: theme.accentColor, transparency }, rotate: 45 });
    addShape(slide, "rect", { x: x + 0.35, y: y + 0.12, w: 0.18, h: 0.18, fill: { color: theme.accent2Color, transparency: transparency - 5 }, rotate: 45 });
  }

  function addSlideNumber(slide: any, num: number, total: number) {
    slide.addText(`${num} / ${total}`, {
      x: W - 1.5, y: H - 0.45, w: 1.2, h: 0.25,
      fontSize: TYPE.label, fontFace: theme.bodyFont, color: theme.subtitleColor, align: "right",
    });
  }

  function addFooter(slide: any) {
    slide.addText("Ethos", {
      x: MARGIN.left, y: H - 0.45, w: 2, h: 0.25,
      fontSize: TYPE.label, fontFace: theme.bodyFont, color: theme.subtitleColor,
    });
  }

  // ── Theme-specific decorations ──
  function addThemeDecor(slide: any, slideType: SlideType, idx: number) {
    if (theme.style === "elegant" || theme.style === "warm") {
      if (idx % 3 === 0) addDiamondCluster(slide, W - 2.5, H - 1.5);
      if (idx % 4 === 0) addDotGrid(slide, 0.5, H - 0.8, 5, 2);
    } else if (theme.style === "bold" || theme.style === "retro") {
      if (idx % 2 === 0) addCornerBlob(slide, "br", 2, 93);
    } else if (theme.style === "playful" || theme.style === "nature") {
      if (idx % 3 === 0) addSecondaryBlob(slide, W - 1.5, 0.5, 1.2, 93);
    } else if (theme.style === "dark") {
      addCornerBlob(slide, "tr", 3, 95);
    }
  }

  const totalSlides = slides.length + 1; // +1 for end slide

  // ══════════════════════════════════════════════
  // Render each slide by type
  // ══════════════════════════════════════════════

  slides.forEach((sd, i) => {
    const slide = pptx.addSlide();
    slide.background = { color: i === 0 ? theme.titleBg : theme.contentBg };
    addAccentStrip(slide, "left");
    addSlideNumber(slide, i + 1, totalSlides);
    addFooter(slide);
    addThemeDecor(slide, sd.slideType, i);

    switch (sd.slideType) {
      case "title":
        renderTitleSlide(slide, sd);
        break;
      case "section-divider":
        renderSectionDivider(slide, sd);
        break;
      case "comparison":
        renderComparisonSlide(slide, sd);
        break;
      case "data-heavy":
        renderDataSlide(slide, sd);
        break;
      case "quote":
        renderQuoteSlide(slide, sd);
        break;
      case "big-statement":
        renderBigStatement(slide, sd);
        break;
      case "visual-heavy":
        renderVisualHeavy(slide, sd);
        break;
      default:
        renderContentSlide(slide, sd, i);
        break;
    }

    if (sd.notes) slide.addNotes(sd.notes);
  });

  // ── TITLE SLIDE ──
  function renderTitleSlide(slide: any, sd: SlideData) {
    addCornerBlob(slide, "tr", 5, 85);
    addSecondaryBlob(slide, -1, H - 2.5, 3, 93);
    addAccentStrip(slide, "bottom");

    // Large hero title
    slide.addText(sd.title, {
      x: MARGIN.left, y: 1.4, w: 8.5, h: 2.5,
      fontSize: TYPE.heroTitle, fontFace: theme.titleFont, color: theme.titleColor, bold: true,
      lineSpacingMultiple: 0.9,
    });

    addLineAccent(slide, MARGIN.left, 4.1, 2.8, 0.05);

    if (sd.subtitle) {
      slide.addText(sd.subtitle, {
        x: MARGIN.left, y: 4.4, w: 8, h: 0.7,
        fontSize: TYPE.subtitle + 2, fontFace: theme.bodyFont, color: theme.subtitleColor,
        lineSpacingMultiple: 1.4,
      });
    }

    // Decorative visual block on right
    addShape(slide, "roundRect", {
      x: 9.5, y: 1.5, w: 3, h: 4, fill: { color: theme.accentColor, transparency: 92 }, rectRadius: 0.12,
    });
    addShape(slide, "ellipse", { x: 10, y: 2, w: 2, h: 2, fill: { color: theme.accentColor, transparency: 85 } });
    addShape(slide, "ellipse", { x: 10.5, y: 2.5, w: 1, h: 1, fill: { color: theme.accent2Color, transparency: 78 } });
    addDotGrid(slide, 9.8, 4.5, 6, 3);
  }

  // ── SECTION DIVIDER ──
  function renderSectionDivider(slide: any, sd: SlideData) {
    slide.background = { color: theme.titleBg };
    addCornerBlob(slide, "tr", 4, 88);
    addSecondaryBlob(slide, -0.5, H - 2, 2.5, 92);

    slide.addText(sd.title, {
      x: 1.5, y: 2, w: W - 3, h: 2,
      fontSize: TYPE.sectionTitle, fontFace: theme.titleFont, color: theme.titleColor, bold: true,
      align: "center", lineSpacingMultiple: 1.0,
    });

    addLineAccent(slide, W / 2 - 1.2, 4.3, 2.4, 0.05);

    if (sd.subtitle || sd.bullets.length > 0) {
      const subText = sd.subtitle || sd.bullets[0] || "";
      slide.addText(subText, {
        x: 2.5, y: 4.7, w: W - 5, h: 0.6,
        fontSize: TYPE.subtitle, fontFace: theme.bodyFont, color: theme.subtitleColor,
        align: "center",
      });
    }
  }

  // ── CONTENT SLIDE — varied layouts ──
  function renderContentSlide(slide: any, sd: SlideData, idx: number) {
    const variation = idx % 3;

    if (variation === 0) {
      // Standard: title top, numbered bullets below
      slide.addText(sd.title, {
        x: MARGIN.left, y: MARGIN.top, w: CONTENT_W, h: 0.9,
        fontSize: TYPE.slideTitle, fontFace: theme.titleFont, color: theme.titleColor, bold: true,
      });
      addLineAccent(slide, MARGIN.left, 1.65, 2.0);

      if (sd.subtitle) {
        slide.addText(sd.subtitle, {
          x: MARGIN.left, y: 1.85, w: CONTENT_W, h: 0.4,
          fontSize: TYPE.subtitle - 2, fontFace: theme.bodyFont, color: theme.subtitleColor, italic: true,
        });
      }

      sd.bullets.forEach((b, bi) => {
        const yPos = MARGIN.contentTop + 0.3 + bi * MARGIN.bulletSpacing;
        if (yPos < 6.5) {
          // Accent marker
          addShape(slide, "ellipse", {
            x: MARGIN.left, y: yPos + 0.04, w: 0.28, h: 0.28,
            fill: { color: theme.accentColor, transparency: 15 },
          });
          slide.addText(`${bi + 1}`, {
            x: MARGIN.left, y: yPos + 0.04, w: 0.28, h: 0.28,
            fontSize: TYPE.label, fontFace: theme.bodyFont, color: isDark ? "FFFFFF" : theme.accentColor,
            align: "center", valign: "middle", bold: true,
          });
          slide.addText(b, {
            x: MARGIN.left + 0.5, y: yPos, w: CONTENT_W - 0.5, h: 0.4,
            fontSize: TYPE.body, fontFace: theme.bodyFont, color: theme.textColor, valign: "middle",
          });
        }
      });
    } else if (variation === 1) {
      // Left accent panel + content right
      addShape(slide, "rect", { x: 0, y: 0, w: 4.0, h: H, fill: { color: theme.accentColor, transparency: 6 } });
      addShape(slide, "rect", { x: 4.0, y: 0, w: 0.03, h: H, fill: { color: theme.accentColor, transparency: 40 } });

      slide.addText(sd.title, {
        x: 0.6, y: 1.2, w: 3.2, h: 2,
        fontSize: TYPE.slideTitle - 4, fontFace: theme.titleFont, color: theme.titleColor, bold: true,
        lineSpacingMultiple: 0.95,
      });
      addLineAccent(slide, 0.6, 3.3, 1.2);

      if (sd.subtitle) {
        slide.addText(sd.subtitle, {
          x: 0.6, y: 3.6, w: 3.2, h: 0.6,
          fontSize: TYPE.subtitle - 3, fontFace: theme.bodyFont, color: theme.subtitleColor, italic: true,
        });
      }

      sd.bullets.forEach((b, bi) => {
        const yPos = 1.2 + bi * 0.65;
        if (yPos < 6.5) {
          addShape(slide, "rect", { x: 4.7, y: yPos + 0.12, w: 0.18, h: 0.03, fill: { color: theme.accentColor } });
          slide.addText(b, {
            x: 5.1, y: yPos, w: 7.5, h: 0.5,
            fontSize: TYPE.body, fontFace: theme.bodyFont, color: theme.textColor,
          });
        }
      });
    } else {
      // Centered minimal
      addSecondaryBlob(slide, 1, 0.5, 1.5, 95);
      addCornerBlob(slide, "br", 2, 94);

      slide.addText(sd.title, {
        x: 1.5, y: MARGIN.top, w: W - 3, h: 1,
        fontSize: TYPE.slideTitle + 2, fontFace: theme.titleFont, color: theme.titleColor, bold: true,
        align: "center",
      });
      addLineAccent(slide, W / 2 - 0.8, 1.9, 1.6);

      sd.bullets.forEach((b, bi) => {
        const yPos = 2.4 + bi * MARGIN.bulletSpacing;
        if (yPos < 6.5) {
          slide.addText(b, {
            x: 2, y: yPos, w: W - 4, h: 0.42,
            fontSize: TYPE.body, fontFace: theme.bodyFont, color: theme.textColor,
            align: "center",
          });
        }
      });
    }
  }

  // ── COMPARISON SLIDE ──
  function renderComparisonSlide(slide: any, sd: SlideData) {
    slide.addText(sd.title, {
      x: MARGIN.left, y: MARGIN.top, w: CONTENT_W, h: 0.9,
      fontSize: TYPE.slideTitle, fontFace: theme.titleFont, color: theme.titleColor, bold: true,
    });
    addLineAccent(slide, MARGIN.left, 1.65, 2.0);

    // Divider
    addShape(slide, "rect", { x: W / 2 - 0.015, y: 2.0, w: 0.03, h: 4.5, fill: { color: theme.accentColor, transparency: 50 } });

    const left = sd.leftCol || sd.bullets.slice(0, Math.ceil(sd.bullets.length / 2));
    const right = sd.rightCol || sd.bullets.slice(Math.ceil(sd.bullets.length / 2));

    left.forEach((b, bi) => {
      const yPos = 2.2 + bi * 0.6;
      addShape(slide, "rect", { x: MARGIN.left, y: yPos + 0.06, w: 0.1, h: 0.1, fill: { color: theme.accentColor } });
      slide.addText(b, {
        x: MARGIN.left + 0.3, y: yPos, w: 5.2, h: 0.45,
        fontSize: TYPE.body - 1, fontFace: theme.bodyFont, color: theme.textColor,
      });
    });

    right.forEach((b, bi) => {
      const yPos = 2.2 + bi * 0.6;
      addShape(slide, "rect", { x: W / 2 + 0.4, y: yPos + 0.06, w: 0.1, h: 0.1, fill: { color: theme.accent2Color } });
      slide.addText(b, {
        x: W / 2 + 0.7, y: yPos, w: 5.2, h: 0.45,
        fontSize: TYPE.body - 1, fontFace: theme.bodyFont, color: theme.textColor,
      });
    });
  }

  // ── DATA-HEAVY SLIDE — stat cards ──
  function renderDataSlide(slide: any, sd: SlideData) {
    slide.addText(sd.title, {
      x: MARGIN.left, y: MARGIN.top, w: CONTENT_W, h: 0.9,
      fontSize: TYPE.slideTitle, fontFace: theme.titleFont, color: theme.titleColor, bold: true,
    });
    addLineAccent(slide, MARGIN.left, 1.65, 1.5);

    const cols = Math.min(sd.bullets.length, 3);
    const cardW = 3.4;
    const startX = (W - cols * cardW - (cols - 1) * 0.4) / 2;

    sd.bullets.slice(0, 6).forEach((b, bi) => {
      const col = bi % 3;
      const row = Math.floor(bi / 3);
      const cx = startX + col * (cardW + 0.4);
      const cy = 2.2 + row * 2.5;

      addShape(slide, "roundRect", {
        x: cx, y: cy, w: cardW, h: 2,
        fill: { color: theme.accentColor, transparency: 93 }, rectRadius: 0.1,
      });
      addShape(slide, "rect", { x: cx, y: cy, w: cardW, h: 0.05, fill: { color: theme.accentColor } });
      
      // Try to extract a number from the bullet
      const numMatch = b.match(/(\d[\d,.%$€£]*)/);
      if (numMatch) {
        slide.addText(numMatch[0], {
          x: cx + 0.3, y: cy + 0.3, w: cardW - 0.6, h: 0.7,
          fontSize: TYPE.stat, fontFace: theme.titleFont, color: theme.accentColor,
          align: "center", bold: true,
        });
        const label = b.replace(numMatch[0], "").replace(/^[:\s-]+/, "").trim();
        slide.addText(label || b, {
          x: cx + 0.3, y: cy + 1.1, w: cardW - 0.6, h: 0.6,
          fontSize: TYPE.body - 2, fontFace: theme.bodyFont, color: theme.textColor,
          align: "center", lineSpacingMultiple: 1.2,
        });
      } else {
        slide.addText(b, {
          x: cx + 0.3, y: cy + 0.4, w: cardW - 0.6, h: 1.2,
          fontSize: TYPE.body, fontFace: theme.bodyFont, color: theme.textColor,
          align: "center", valign: "middle",
        });
      }
    });
  }

  // ── QUOTE SLIDE ──
  function renderQuoteSlide(slide: any, sd: SlideData) {
    slide.background = { color: theme.titleBg };
    addCornerBlob(slide, "tr", 4, 90);
    addSecondaryBlob(slide, 0.5, H - 2, 2, 93);

    slide.addText("\u201C", {
      x: 1, y: 0.5, w: 2, h: 2,
      fontSize: 120, fontFace: theme.titleFont, color: theme.accentColor, bold: true, transparency: 30,
    });

    const quoteText = sd.title.replace(/^["'""]+|["'""]+$/g, "");
    slide.addText(quoteText, {
      x: 1.5, y: 2, w: 10, h: 2.5,
      fontSize: TYPE.quote, fontFace: theme.titleFont, color: theme.titleColor, italic: true,
      lineSpacingMultiple: 1.3, align: "center",
    });

    if (sd.subtitle || sd.bullets.length > 0) {
      addLineAccent(slide, W / 2 - 0.5, 4.8, 1);
      slide.addText(sd.subtitle || sd.bullets[0] || "", {
        x: 2, y: 5.1, w: W - 4, h: 0.5,
        fontSize: TYPE.subtitle, fontFace: theme.bodyFont, color: theme.subtitleColor, align: "center",
      });
    }
  }

  // ── BIG STATEMENT / CLOSING ──
  function renderBigStatement(slide: any, sd: SlideData) {
    slide.background = { color: theme.titleBg };
    addCornerBlob(slide, "tr", 5, 88);
    addSecondaryBlob(slide, -1, H - 3, 3, 92);
    addAccentStrip(slide, "bottom");

    slide.addText(sd.title, {
      x: 1, y: 1.5, w: W - 2, h: 3,
      fontSize: TYPE.sectionTitle, fontFace: theme.titleFont, color: theme.titleColor, bold: true,
      align: "center", lineSpacingMultiple: 1.1,
    });
    addLineAccent(slide, W / 2 - 1, 4.8, 2);

    if (sd.bullets.length > 0) {
      slide.addText(sd.bullets[0], {
        x: 2, y: 5.2, w: W - 4, h: 0.6,
        fontSize: TYPE.subtitle, fontFace: theme.bodyFont, color: theme.subtitleColor, align: "center",
      });
    }
  }

  // ── VISUAL-HEAVY SLIDE ──
  function renderVisualHeavy(slide: any, sd: SlideData) {
    // Content left, large visual block right
    slide.addText(sd.title, {
      x: MARGIN.left, y: MARGIN.top, w: 7, h: 1,
      fontSize: TYPE.slideTitle, fontFace: theme.titleFont, color: theme.titleColor, bold: true,
    });
    addLineAccent(slide, MARGIN.left, 1.8, 1.5);

    if (sd.subtitle) {
      slide.addText(sd.subtitle, {
        x: MARGIN.left, y: 2.1, w: 7, h: 0.5,
        fontSize: TYPE.subtitle - 2, fontFace: theme.bodyFont, color: theme.subtitleColor,
      });
    }

    sd.bullets.forEach((b, bi) => {
      const yPos = 2.8 + bi * 0.55;
      if (yPos < 6) {
        slide.addText("\u2014  " + b, {
          x: MARGIN.left, y: yPos, w: 7, h: 0.4,
          fontSize: TYPE.body, fontFace: theme.bodyFont, color: theme.textColor,
        });
      }
    });

    // Visual placeholder
    addShape(slide, "roundRect", {
      x: 8.8, y: 0.8, w: 3.8, h: 5.5,
      fill: { color: theme.accentColor, transparency: 90 }, rectRadius: 0.15,
    });
    addShape(slide, "ellipse", { x: 9.5, y: 1.8, w: 2.4, h: 2.4, fill: { color: theme.accentColor, transparency: 82 } });
    addShape(slide, "ellipse", { x: 10, y: 2.3, w: 1.4, h: 1.4, fill: { color: theme.accent2Color, transparency: 75 } });
    addDotGrid(slide, 9.2, 5, 8, 3);
  }

  // ── END SLIDE ──
  const endSlide = pptx.addSlide();
  endSlide.background = { color: theme.titleBg };
  addAccentStrip(endSlide, "left");
  addAccentStrip(endSlide, "bottom");
  addCornerBlob(endSlide, "tr", 4, 87);
  addSecondaryBlob(endSlide, 1, H - 3, 3, 92);

  endSlide.addText("Thank You", {
    x: 1, y: 2, w: W - 2, h: 1.5,
    fontSize: TYPE.sectionTitle, fontFace: theme.titleFont, color: theme.titleColor, bold: true, align: "center",
  });
  addLineAccent(endSlide, W / 2 - 1, 3.7, 2);
  endSlide.addText("Made with Ethos", {
    x: 1, y: 4.2, w: W - 2, h: 0.5,
    fontSize: TYPE.body - 1, fontFace: theme.bodyFont, color: theme.subtitleColor, align: "center",
  });
  addSlideNumber(endSlide, totalSlides, totalSlides);
  addFooter(endSlide);

  pptx.writeFile({ fileName: "ethos-presentation.pptx" });
  toast.success("Downloaded presentation");
}

// ── PDF export ──

function exportPDF(content: string, _format: OutputFormat) {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 20;
  const maxWidth = pageWidth - margin * 2;
  let y = 25;

  const addPageIfNeeded = () => { if (y > 260) { pdf.addPage(); y = 25; } };

  pdf.setFontSize(22);
  pdf.setFont("helvetica", "bold");
  pdf.text("Board Export", margin, y);
  y += 12;

  pdf.setDrawColor(100, 100, 120);
  pdf.setLineWidth(0.5);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 10;

  const lines = content.split("\n");
  for (const line of lines) {
    addPageIfNeeded();
    const trimmed = stripMd(line.trim());
    if (!trimmed) { y += 4; continue; }
    if (line.trim().startsWith("## ")) {
      y += 6; pdf.setFontSize(16); pdf.setFont("helvetica", "bold"); pdf.setTextColor(26, 26, 46);
      const wrapped = pdf.splitTextToSize(trimmed, maxWidth);
      pdf.text(wrapped, margin, y); y += wrapped.length * 7 + 3;
    } else if (line.trim().startsWith("### ")) {
      y += 4; pdf.setFontSize(13); pdf.setFont("helvetica", "bold"); pdf.setTextColor(50, 50, 70);
      const wrapped = pdf.splitTextToSize(trimmed, maxWidth);
      pdf.text(wrapped, margin, y); y += wrapped.length * 6 + 2;
    } else if (line.trim().startsWith("# ")) {
      y += 6; pdf.setFontSize(20); pdf.setFont("helvetica", "bold"); pdf.setTextColor(26, 26, 46);
      const wrapped = pdf.splitTextToSize(trimmed, maxWidth);
      pdf.text(wrapped, margin, y); y += wrapped.length * 8 + 4;
    } else if (/^[-*•]/.test(line.trim())) {
      pdf.setFontSize(11); pdf.setFont("helvetica", "normal"); pdf.setTextColor(60, 60, 80);
      const bullet = "\u2022  " + trimmed;
      const wrapped = pdf.splitTextToSize(bullet, maxWidth - 5);
      pdf.text(wrapped, margin + 5, y); y += wrapped.length * 5 + 2;
    } else {
      pdf.setFontSize(11); pdf.setFont("helvetica", "normal"); pdf.setTextColor(60, 60, 80);
      const wrapped = pdf.splitTextToSize(trimmed, maxWidth);
      pdf.text(wrapped, margin, y); y += wrapped.length * 5 + 2;
    }
  }

  const pageCount = pdf.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i); pdf.setFontSize(8); pdf.setTextColor(150, 150, 170);
    pdf.text(`Generated by Ethos \u00B7 Page ${i}/${pageCount}`, margin, 287);
  }
  pdf.save("ethos-export.pdf");
  toast.success("Downloaded PDF");
}

// ── DOCX export — structured document with heading hierarchy ──

function exportDOCX(content: string, docStyle: DocStyle) {
  const sections = parseDocument(content);
  const children: Paragraph[] = [];
  children.push(new Paragraph({
    text: `Board Export \u2014 ${docStyle.charAt(0).toUpperCase() + docStyle.slice(1)}`,
    heading: HeadingLevel.TITLE, alignment: AlignmentType.LEFT, spacing: { after: 300 },
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
      children.push(new Paragraph({
        children: [new TextRun({ text: para, size: 22, font: "Calibri" })],
        spacing: { after: 80 },
      }));
    }
  }
  children.push(new Paragraph({
    children: [new TextRun({ text: "Generated by Ethos", size: 16, color: "999999", italics: true })],
    spacing: { before: 400 },
  }));
  const doc = new Document({ sections: [{ children }], creator: "Ethos" });
  Packer.toBlob(doc).then(blob => { saveAs(blob, "ethos-export.docx"); toast.success("Downloaded DOCX"); });
}

function exportXLSX(content: string) {
  const rows = parseTable(content);
  if (rows.length === 0) {
    const lines = content.split("\n").filter(l => l.trim());
    const ws = XLSX.utils.aoa_to_sheet([["Content"], ...lines.map(l => [stripMd(l.replace(/^[-*•#|]\s*/, "").trim())])]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Board Export");
    XLSX.writeFile(wb, "ethos-export.xlsx");
  } else {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Board Export");
    XLSX.writeFile(wb, "ethos-export.xlsx");
  }
  toast.success("Downloaded XLSX");
}

export default function ConvertDialog({ items, onClose }: ConvertDialogProps) {
  const [format, setFormat] = useState<OutputFormat>("slides");
  const [docStyle, setDocStyle] = useState<DocStyle>("report");
  const [customPrompt, setCustomPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<string | null>(null);
  const [selectedTheme, setSelectedTheme] = useState<SlideTheme>(SLIDE_THEMES[0]);
  const [moodboardDesc, setMoodboardDesc] = useState("");

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
          messages: [{ role: "user", content: `You are helping convert board content into a ${format}. Board items:\n- ${boardData}\n\n${context ? `Previous answers:\n${context}\n\n` : ""}Ask ONE clarifying question to help produce a better ${format}. Be specific and short. Consider asking about: target audience, visual style preferences, key message to emphasize, tone (formal/casual/playful), or what they want the audience to feel. Return ONLY the question text, nothing else.` }],
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
    const moodContext = moodboardDesc ? `\n\nMoodboard/Inspiration: ${moodboardDesc}` : "";

    const formatPrompts: Record<OutputFormat, string> = {
      slides: `Act as a Senior Graphic Designer and Presentation Expert. Convert this board content into a beautifully structured slide presentation.

CRITICAL FORMATTING RULES:
- Do NOT use markdown formatting: no **bold**, *italic*, __underline__, or \`code\`
- Do NOT use asterisks, underscores, backticks, or square brackets
- Write PLAIN TEXT ONLY — every word must be ready to display directly on a slide
- No raw syntax of any kind

SLIDE STRUCTURE — use ## for each slide:
## Slide Title
subtitle: A concise subtitle
- Bullet point (max 18 words, punchy and memorable)
- Another key insight
Speaker Notes: detailed talking points

SLIDE TYPES — vary these for visual interest:
- Title slide (first): powerful hook with subtitle
- Section dividers: single bold statement, 0-1 bullets  
- Content slides: 3-5 concise bullets
- Comparison: use "vs" or "compared" in title for side-by-side layout
- Data slides: include numbers/percentages for stat-card layout
- Quote slides: wrap in quotation marks for large-text treatment
- Big statement (last): bold closing takeaway

TEXT COMPRESSION RULES:
- Max 5 bullets per slide (system will auto-split if more)
- Max 18 words per bullet
- Convert paragraphs into concise bullets
- No filler words — every word must earn its place

STORYTELLING FLOW: Hook > Context > Problem > Solution > Impact > Call to Action
Create 8-12 slides total. Write like a world-class copywriter.

Board content:
- ${boardData}${answersContext}${moodContext}

${customPrompt ? `Additional instructions: ${customPrompt}\n\n` : ""}Format as clean markdown with ## for each slide.`,
      document: `Convert this board content into a well-formatted ${docStyle} document. Do NOT use raw markdown formatting in the output — text should be clean and readable. ${
        docStyle === "flowchart" ? "Include a text-based flowchart using arrows and boxes." :
        docStyle === "report" ? "Structure with executive summary, sections with clear headings hierarchy, and conclusion." :
        docStyle === "outline" ? "Create a hierarchical outline with clear nesting using heading levels." :
        "Write as a concise business memo with clear sections."
      }\n\nBoard content:\n- ${boardData}${answersContext}${moodContext}\n\n${customPrompt ? `Additional instructions: ${customPrompt}\n\n` : ""}Format with # for main headings, ## for subheadings, ### for sub-subheadings. Use - for bullet points.`,
      sheet: `Convert this board content into a structured table/spreadsheet format. Create columns for: Item, Category, Priority, Status, Notes, Connections.\n\nBoard content:\n- ${boardData}${answersContext}${moodContext}\n\n${customPrompt ? `Additional instructions: ${customPrompt}\n\n` : ""}Format as a markdown table.`,
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
    const a = document.createElement("a"); a.href = url; a.download = `ethos-export.${ext}`; a.click();
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
            <p className="text-xs text-muted-foreground">{items.length} elements to convert</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
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
                          format === f.id ? "bg-accent/10 text-accent border border-accent/20" : "bg-secondary/50 text-muted-foreground hover:bg-secondary border border-transparent"
                        }`}>
                        <Icon className="w-5 h-5" />
                        <span className="font-medium">{f.label}</span>
                        <span className="text-[9px] text-muted-foreground">{f.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Slide Theme Picker */}
              {format === "slides" && (
                <div>
                  <p className="text-xs font-medium text-foreground mb-2">Slide Theme</p>
                  <div className="grid grid-cols-2 gap-1.5 max-h-[140px] overflow-y-auto scrollbar-thin pr-1">
                    {SLIDE_THEMES.map(theme => (
                      <button key={theme.name} onClick={() => setSelectedTheme(theme)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all ${
                          selectedTheme.name === theme.name ? "bg-accent/10 text-accent border border-accent/20" : "bg-secondary/50 text-muted-foreground hover:bg-secondary border border-transparent"
                        }`}>
                        <div className="flex gap-0.5 shrink-0">
                          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: `#${theme.titleBg}` }} />
                          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: `#${theme.accentColor}` }} />
                          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: `#${theme.contentBg}` }} />
                        </div>
                        <span className="truncate">{theme.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Moodboard / Inspiration */}
              {format === "slides" && (
                <div>
                  <p className="text-xs font-medium text-foreground mb-1.5 flex items-center gap-1.5">
                    <Image className="w-3 h-3 text-accent" />
                    Moodboard / Inspiration (optional)
                  </p>
                  <textarea value={moodboardDesc} onChange={(e) => setMoodboardDesc(e.target.value)}
                    placeholder="Describe your inspiration... e.g. 'Clean Apple-style, lots of white space, bold titles' or 'Colorful Gen-Z aesthetic with rounded shapes'"
                    rows={2}
                    className="w-full bg-transparent border border-border rounded-lg p-3 text-xs text-foreground outline-none focus:ring-1 focus:ring-accent/40 resize-none placeholder:text-muted-foreground" />
                </div>
              )}

              {/* Doc style */}
              {format === "document" && (
                <div>
                  <p className="text-xs font-medium text-foreground mb-2">Document Style</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {DOC_STYLES.map(s => (
                      <button key={s.id} onClick={() => setDocStyle(s.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs transition-all ${
                          docStyle === s.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                        }`}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Ask AI guidance */}
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
                        <p className="text-muted-foreground">{a.q}</p>
                        <p className="text-foreground mt-0.5">{a.a}</p>
                      </div>
                    ))}
                    {loadingQ ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="w-3 h-3 animate-spin" />Thinking...
                      </div>
                    ) : aiQuestion ? (
                      <div className="glass rounded-lg p-3 space-y-2">
                        <p className="text-xs text-foreground font-medium">{aiQuestion}</p>
                        <div className="flex gap-2">
                          <input value={userAnswer} onChange={(e) => setUserAnswer(e.target.value)}
                            placeholder="Your answer..."
                            className="flex-1 bg-transparent border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-accent/40 placeholder:text-muted-foreground"
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
                  className="w-full bg-transparent border border-border rounded-lg p-3 text-sm text-foreground outline-none focus:ring-1 focus:ring-accent/40 resize-none placeholder:text-muted-foreground" />
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
                      <button onClick={() => exportPPTX(generatedContent!, selectedTheme)} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity">
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
                <p className="text-xs font-medium text-muted-foreground mb-2">Also available as</p>
                <div className="flex gap-2">
                  <button onClick={() => downloadAsText("md")} className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-border text-xs text-muted-foreground hover:bg-secondary transition-colors">
                    <Download className="w-3 h-3" />Markdown
                  </button>
                  <button onClick={() => downloadAsText("txt")} className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-border text-xs text-muted-foreground hover:bg-secondary transition-colors">
                    <Download className="w-3 h-3" />Text
                  </button>
                </div>
              </div>

              <button onClick={() => { setGeneratedContent(null); setAnswers([]); }}
                className="w-full py-2 rounded-xl border border-border text-sm text-muted-foreground hover:bg-secondary transition-colors">
                Convert Again
              </button>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
