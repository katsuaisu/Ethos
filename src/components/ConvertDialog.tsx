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
  style: "elegant" | "bold" | "playful" | "minimal" | "dark";
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
];

// Parse AI-generated markdown into structured slide data
interface SlideData {
  title: string;
  subtitle?: string;
  bullets: string[];
  notes: string;
  layout?: "title" | "content" | "two-column" | "quote" | "stats" | "big-statement";
}

function parseSlides(md: string): SlideData[] {
  const slides: SlideData[] = [];
  const sections = md.split(/^## /gm).filter(Boolean);
  for (const section of sections) {
    const lines = section.trim().split("\n");
    const title = lines[0]?.replace(/^#+\s*/, "").replace(/Slide\s*\d+[:\s-]*/i, "").trim() || "Untitled";
    const bullets: string[] = [];
    let notes = "";
    let subtitle = "";
    let layout: SlideData["layout"] = "content";
    let inNotes = false;
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (/speaker\s*notes?/i.test(line) || /^notes?:/i.test(line)) { inNotes = true; continue; }
      if (/^layout:\s*/i.test(line)) { layout = line.replace(/^layout:\s*/i, "").trim() as SlideData["layout"]; continue; }
      if (/^subtitle:\s*/i.test(line)) { subtitle = line.replace(/^subtitle:\s*/i, "").trim(); continue; }
      if (inNotes) { if (line) notes += (notes ? " " : "") + line.replace(/^[-*]\s*/, ""); continue; }
      if (line.startsWith("- ") || line.startsWith("* ") || line.startsWith("• ")) {
        bullets.push(line.replace(/^[-*•]\s*/, ""));
      } else if (line && !line.startsWith("#") && !line.startsWith("---")) {
        if (!subtitle && bullets.length === 0) subtitle = line;
        else bullets.push(line);
      }
    }
    if (title || bullets.length) slides.push({ title, subtitle, bullets: bullets.slice(0, 8), notes, layout });
  }
  return slides.length > 0 ? slides : [{ title: "Board Content", bullets: md.split("\n").filter(l => l.trim()).slice(0, 8), notes: "" }];
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
      current = { heading: headingMatch[2], level: headingMatch[1].length, paragraphs: [] };
    } else if (line.trim()) {
      current.paragraphs.push(line.replace(/^[-*•]\s*/, "").trim());
    }
  }
  if (current.heading || current.paragraphs.length) sections.push(current);
  return sections;
}

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

// ── Helper: add shape to slide ──
function addShape(slide: any, type: "rect" | "ellipse" | "roundRect" | "triangle", opts: any) {
  slide.addText("", { ...opts, shape: type as any });
}

// ── Creative PPTX Export Engine ──

function exportPPTX(content: string, theme: SlideTheme) {
  const slides = parseSlides(content);
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Ethos";

  const isDark = theme.style === "dark";
  const W = 13.33; // slide width in inches
  const H = 7.5;   // slide height

  // ── Decorative layer helpers ──
  function addAccentStrip(slide: any, position: "top" | "bottom" | "left") {
    if (position === "left") addShape(slide, "rect", { x: 0, y: 0, w: 0.06, h: H, fill: { color: theme.accentColor } });
    if (position === "top") addShape(slide, "rect", { x: 0, y: 0, w: W, h: 0.04, fill: { color: theme.accentColor } });
    if (position === "bottom") addShape(slide, "rect", { x: 0, y: H - 0.04, w: W, h: 0.04, fill: { color: theme.accentColor } });
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
          x: startX + c * 0.25, y: startY + r * 0.25, w: 0.06, h: 0.06,
          fill: { color: theme.accentColor, transparency: 80 },
        });
      }
    }
  }

  function addLineAccent(slide: any, x: number, y: number, w: number, h = 0.03) {
    addShape(slide, "rect", { x, y, w, h, fill: { color: theme.accentColor } });
  }

  function addSlideNumber(slide: any, num: number, total: number) {
    slide.addText(`${num} / ${total}`, {
      x: W - 1.5, y: H - 0.5, w: 1.2, h: 0.3,
      fontSize: 8, fontFace: theme.bodyFont, color: theme.subtitleColor, align: "right",
    });
  }

  const totalSlides = slides.length + 1; // +1 for end slide

  // ══════════════════════════════════
  // SLIDE 1: TITLE — Full-bleed hero
  // ══════════════════════════════════
  const s1 = pptx.addSlide();
  s1.background = { color: theme.titleBg };

  // Large decorative blob top-right
  addCornerBlob(s1, "tr", 5, 85);
  addSecondaryBlob(s1, W - 2.5, 0.5, 2.5, 90);

  // Bottom-left subtle blob
  addSecondaryBlob(s1, -1, H - 2.5, 3, 93);

  // Dot grid decoration
  if (theme.style !== "minimal") addDotGrid(s1, 1, 5.5, 6, 3);

  // Accent strip
  addAccentStrip(s1, "left");
  addAccentStrip(s1, "bottom");

  // Title text — large and commanding
  s1.addText(slides[0]?.title || "Presentation", {
    x: 0.9, y: 1.5, w: 8, h: 2.2,
    fontSize: 48, fontFace: theme.titleFont, color: theme.titleColor, bold: true,
    lineSpacingMultiple: 0.9,
  });

  // Accent line under title
  addLineAccent(s1, 0.9, 3.8, 2.5, 0.05);

  // Subtitle
  if (slides[0]?.subtitle) {
    s1.addText(slides[0].subtitle, {
      x: 0.9, y: 4.1, w: 8, h: 0.7,
      fontSize: 18, fontFace: theme.bodyFont, color: theme.subtitleColor,
      lineSpacingMultiple: 1.3,
    });
  }

  // Footer
  s1.addText("Ethos", {
    x: 0.9, y: H - 0.7, w: 3, h: 0.35,
    fontSize: 10, fontFace: theme.bodyFont, color: theme.subtitleColor,
  });

  addSlideNumber(s1, 1, totalSlides);

  // ══════════════════════════════════
  // CONTENT SLIDES — Varied layouts
  // ══════════════════════════════════
  for (let i = 1; i < slides.length; i++) {
    const sd = slides[i];
    const slide = pptx.addSlide();
    slide.background = { color: theme.contentBg };

    // Decide layout variation based on slide index
    const layoutType = sd.layout === "quote" ? "quote"
      : sd.layout === "two-column" ? "two-column"
      : sd.layout === "stats" ? "stats"
      : sd.layout === "big-statement" ? "big-statement"
      : i % 5 === 1 ? "left-accent"
      : i % 5 === 2 ? "right-visual"
      : i % 5 === 3 ? "split"
      : i % 5 === 4 ? "centered"
      : "standard";

    // ── Always add subtle decorations ──
    addAccentStrip(slide, "left");
    if (i % 2 === 0) addCornerBlob(slide, "br", 2.5, 93);
    if (i % 3 === 0) addSecondaryBlob(slide, W - 1.5, 0.3, 1.5, 94);

    addSlideNumber(slide, i + 1, totalSlides);

    // ── Layout: STANDARD ──
    if (layoutType === "standard") {
      // Title with accent underline
      slide.addText(sd.title, {
        x: 0.9, y: 0.5, w: 10, h: 0.8,
        fontSize: 30, fontFace: theme.titleFont, color: theme.titleColor, bold: true,
      });
      addLineAccent(slide, 0.9, 1.35, 1.8);

      if (sd.subtitle) {
        slide.addText(sd.subtitle, {
          x: 0.9, y: 1.55, w: 10, h: 0.5,
          fontSize: 14, fontFace: theme.bodyFont, color: theme.subtitleColor, italic: true,
        });
      }

      // Bullets with numbered markers
      if (sd.bullets.length > 0) {
        const bulletTexts = sd.bullets.map((b, idx) => ({
          text: `  ${b}`,
          options: {
            fontSize: 14, color: theme.textColor, paraSpaceBefore: 10, lineSpacing: 24,
            bullet: false,
          },
        }));

        // Custom numbered circles
        sd.bullets.forEach((b, idx) => {
          const yPos = 2.2 + idx * 0.6;
          if (yPos < 6.5) {
            // Number circle
            addShape(slide, "ellipse", {
              x: 0.9, y: yPos, w: 0.35, h: 0.35,
              fill: { color: theme.accentColor, transparency: 15 },
            });
            slide.addText(`${idx + 1}`, {
              x: 0.9, y: yPos, w: 0.35, h: 0.35,
              fontSize: 10, fontFace: theme.bodyFont, color: isDark ? "FFFFFF" : theme.accentColor,
              align: "center", valign: "middle", bold: true,
            });
            // Bullet text
            slide.addText(b, {
              x: 1.45, y: yPos, w: 9.5, h: 0.35,
              fontSize: 14, fontFace: theme.bodyFont, color: theme.textColor,
              valign: "middle",
            });
          }
        });
      }
    }

    // ── Layout: LEFT-ACCENT (large accent panel on left) ──
    else if (layoutType === "left-accent") {
      // Colored panel on left third
      addShape(slide, "rect", { x: 0, y: 0, w: 4.2, h: H, fill: { color: theme.accentColor, transparency: 8 } });
      addShape(slide, "rect", { x: 4.2, y: 0, w: 0.03, h: H, fill: { color: theme.accentColor, transparency: 40 } });

      // Title on left panel
      slide.addText(sd.title, {
        x: 0.6, y: 1.2, w: 3.3, h: 2,
        fontSize: 28, fontFace: theme.titleFont, color: theme.titleColor, bold: true,
        lineSpacingMultiple: 0.95,
      });
      addLineAccent(slide, 0.6, 3.3, 1.2);

      if (sd.subtitle) {
        slide.addText(sd.subtitle, {
          x: 0.6, y: 3.6, w: 3.3, h: 0.8,
          fontSize: 12, fontFace: theme.bodyFont, color: theme.subtitleColor, italic: true,
          lineSpacingMultiple: 1.3,
        });
      }

      // Content on right
      sd.bullets.forEach((b, idx) => {
        const yPos = 1.2 + idx * 0.7;
        if (yPos < 6.5) {
          // Dash accent
          addShape(slide, "rect", { x: 4.8, y: yPos + 0.12, w: 0.2, h: 0.03, fill: { color: theme.accentColor } });
          slide.addText(b, {
            x: 5.2, y: yPos, w: 7.5, h: 0.5,
            fontSize: 14, fontFace: theme.bodyFont, color: theme.textColor,
            lineSpacingMultiple: 1.2,
          });
        }
      });
    }

    // ── Layout: RIGHT-VISUAL (content left, visual placeholder right) ──
    else if (layoutType === "right-visual") {
      slide.addText(sd.title, {
        x: 0.9, y: 0.5, w: 7, h: 0.8,
        fontSize: 30, fontFace: theme.titleFont, color: theme.titleColor, bold: true,
      });
      addLineAccent(slide, 0.9, 1.35, 1.5);

      sd.bullets.forEach((b, idx) => {
        const yPos = 1.8 + idx * 0.55;
        if (yPos < 6) {
          slide.addText(`\u2014  ${b}`, {
            x: 0.9, y: yPos, w: 7, h: 0.4,
            fontSize: 13, fontFace: theme.bodyFont, color: theme.textColor,
          });
        }
      });

      // Visual placeholder block on right
      addShape(slide, "roundRect", {
        x: 8.8, y: 0.8, w: 3.8, h: 5.5,
        fill: { color: theme.accentColor, transparency: 90 },
        rectRadius: 0.15,
      });
      // Inner decorative elements
      addShape(slide, "ellipse", { x: 9.5, y: 1.8, w: 2.4, h: 2.4, fill: { color: theme.accentColor, transparency: 82 } });
      addShape(slide, "ellipse", { x: 10, y: 2.3, w: 1.4, h: 1.4, fill: { color: theme.accent2Color, transparency: 75 } });
      addDotGrid(slide, 9.2, 5, 8, 3);
    }

    // ── Layout: SPLIT (50/50 horizontal) ──
    else if (layoutType === "split") {
      // Top half — title area with accent bg
      addShape(slide, "rect", { x: 0, y: 0, w: W, h: 3.2, fill: { color: theme.accentColor, transparency: 6 } });
      addShape(slide, "rect", { x: 0, y: 3.2, w: W, h: 0.03, fill: { color: theme.accentColor, transparency: 50 } });

      slide.addText(sd.title, {
        x: 0.9, y: 0.6, w: 11, h: 1,
        fontSize: 32, fontFace: theme.titleFont, color: theme.titleColor, bold: true,
      });

      if (sd.subtitle) {
        slide.addText(sd.subtitle, {
          x: 0.9, y: 1.7, w: 11, h: 0.6,
          fontSize: 14, fontFace: theme.bodyFont, color: theme.subtitleColor,
        });
      }

      // Accent dot cluster top-right
      addShape(slide, "ellipse", { x: W - 2, y: 0.3, w: 0.8, h: 0.8, fill: { color: theme.accentColor, transparency: 85 } });
      addShape(slide, "ellipse", { x: W - 1.5, y: 0.8, w: 0.5, h: 0.5, fill: { color: theme.accent2Color, transparency: 80 } });

      // Bottom half — content in two columns
      const half = Math.ceil(sd.bullets.length / 2);
      const col1 = sd.bullets.slice(0, half);
      const col2 = sd.bullets.slice(half);

      col1.forEach((b, idx) => {
        const yPos = 3.7 + idx * 0.6;
        addShape(slide, "rect", { x: 0.9, y: yPos + 0.06, w: 0.12, h: 0.12, fill: { color: theme.accentColor } });
        slide.addText(b, {
          x: 1.25, y: yPos - 0.05, w: 5, h: 0.45,
          fontSize: 13, fontFace: theme.bodyFont, color: theme.textColor,
        });
      });

      col2.forEach((b, idx) => {
        const yPos = 3.7 + idx * 0.6;
        addShape(slide, "rect", { x: 7, y: yPos + 0.06, w: 0.12, h: 0.12, fill: { color: theme.accentColor } });
        slide.addText(b, {
          x: 7.35, y: yPos - 0.05, w: 5, h: 0.45,
          fontSize: 13, fontFace: theme.bodyFont, color: theme.textColor,
        });
      });
    }

    // ── Layout: CENTERED (minimal, big text) ──
    else if (layoutType === "centered") {
      // Center everything
      addSecondaryBlob(slide, 1, 1, 2, 95);
      addCornerBlob(slide, "br", 2, 94);

      slide.addText(sd.title, {
        x: 1.5, y: 0.8, w: W - 3, h: 1.2,
        fontSize: 34, fontFace: theme.titleFont, color: theme.titleColor, bold: true,
        align: "center",
      });
      addLineAccent(slide, W / 2 - 0.75, 2.1, 1.5);

      sd.bullets.forEach((b, idx) => {
        const yPos = 2.6 + idx * 0.6;
        if (yPos < 6.5) {
          slide.addText(b, {
            x: 2, y: yPos, w: W - 4, h: 0.45,
            fontSize: 14, fontFace: theme.bodyFont, color: theme.textColor,
            align: "center",
          });
        }
      });
    }

    // ── Layout: QUOTE ──
    else if (layoutType === "quote") {
      addCornerBlob(slide, "tr", 4, 90);
      addSecondaryBlob(slide, 0.5, H - 2, 2, 93);

      // Big quotation mark
      slide.addText("\u201C", {
        x: 1, y: 0.5, w: 2, h: 2,
        fontSize: 120, fontFace: theme.titleFont, color: theme.accentColor, bold: true,
        transparency: 30,
      });

      slide.addText(sd.title, {
        x: 1.5, y: 2, w: 10, h: 2,
        fontSize: 26, fontFace: theme.titleFont, color: theme.titleColor, italic: true,
        lineSpacingMultiple: 1.3, align: "center",
      });

      if (sd.subtitle) {
        addLineAccent(slide, W / 2 - 0.5, 4.3, 1);
        slide.addText(sd.subtitle, {
          x: 2, y: 4.6, w: W - 4, h: 0.5,
          fontSize: 14, fontFace: theme.bodyFont, color: theme.subtitleColor, align: "center",
        });
      }
    }

    // ── Layout: TWO-COLUMN ──
    else if (layoutType === "two-column") {
      slide.addText(sd.title, {
        x: 0.9, y: 0.5, w: 11, h: 0.8,
        fontSize: 30, fontFace: theme.titleFont, color: theme.titleColor, bold: true,
      });
      addLineAccent(slide, 0.9, 1.35, 2);

      // Divider line
      addShape(slide, "rect", { x: W / 2 - 0.015, y: 1.8, w: 0.03, h: 4.5, fill: { color: theme.accentColor, transparency: 60 } });

      const half = Math.ceil(sd.bullets.length / 2);
      sd.bullets.slice(0, half).forEach((b, idx) => {
        slide.addText(b, {
          x: 0.9, y: 1.9 + idx * 0.65, w: 5.5, h: 0.5,
          fontSize: 13, fontFace: theme.bodyFont, color: theme.textColor,
        });
      });
      sd.bullets.slice(half).forEach((b, idx) => {
        slide.addText(b, {
          x: 7, y: 1.9 + idx * 0.65, w: 5.5, h: 0.5,
          fontSize: 13, fontFace: theme.bodyFont, color: theme.textColor,
        });
      });
    }

    // ── Layout: STATS ──
    else if (layoutType === "stats") {
      slide.addText(sd.title, {
        x: 0.9, y: 0.5, w: 11, h: 0.8,
        fontSize: 30, fontFace: theme.titleFont, color: theme.titleColor, bold: true,
      });
      addLineAccent(slide, 0.9, 1.35, 1.5);

      // Display bullets as "stat cards"
      const cardW = 3.5;
      const cols = Math.min(sd.bullets.length, 3);
      const startX = (W - cols * cardW - (cols - 1) * 0.4) / 2;

      sd.bullets.slice(0, 6).forEach((b, idx) => {
        const col = idx % 3;
        const row = Math.floor(idx / 3);
        const cx = startX + col * (cardW + 0.4);
        const cy = 2.2 + row * 2.5;

        addShape(slide, "roundRect", {
          x: cx, y: cy, w: cardW, h: 2,
          fill: { color: theme.accentColor, transparency: 93 },
          rectRadius: 0.1,
        });
        addShape(slide, "rect", { x: cx, y: cy, w: cardW, h: 0.05, fill: { color: theme.accentColor } });
        slide.addText(b, {
          x: cx + 0.3, y: cy + 0.4, w: cardW - 0.6, h: 1.2,
          fontSize: 13, fontFace: theme.bodyFont, color: theme.textColor,
          valign: "middle", align: "center",
          lineSpacingMultiple: 1.2,
        });
      });
    }

    // ── Layout: BIG-STATEMENT ──
    else if (layoutType === "big-statement") {
      addCornerBlob(slide, "tr", 5, 88);
      addSecondaryBlob(slide, -1, H - 3, 3, 92);

      slide.addText(sd.title, {
        x: 1, y: 1.5, w: W - 2, h: 3,
        fontSize: 42, fontFace: theme.titleFont, color: theme.titleColor, bold: true,
        align: "center", lineSpacingMultiple: 1.1,
      });
      addLineAccent(slide, W / 2 - 1, 4.8, 2);

      if (sd.bullets.length > 0) {
        slide.addText(sd.bullets[0], {
          x: 2, y: 5.2, w: W - 4, h: 0.6,
          fontSize: 16, fontFace: theme.bodyFont, color: theme.subtitleColor,
          align: "center",
        });
      }
    }

    // Speaker notes
    if (sd.notes) slide.addNotes(sd.notes);
  }

  // ══════════════════════════════════
  // END SLIDE — Elegant closing
  // ══════════════════════════════════
  const endSlide = pptx.addSlide();
  endSlide.background = { color: theme.titleBg };
  addAccentStrip(endSlide, "left");
  addAccentStrip(endSlide, "bottom");
  addCornerBlob(endSlide, "tr", 4, 87);
  addSecondaryBlob(endSlide, 1, H - 3, 3, 92);

  endSlide.addText("Thank You", {
    x: 1, y: 2, w: W - 2, h: 1.5,
    fontSize: 44, fontFace: theme.titleFont, color: theme.titleColor, bold: true, align: "center",
  });
  addLineAccent(endSlide, W / 2 - 1, 3.7, 2);
  endSlide.addText("Made with Ethos", {
    x: 1, y: 4.2, w: W - 2, h: 0.5,
    fontSize: 13, fontFace: theme.bodyFont, color: theme.subtitleColor, align: "center",
  });

  addSlideNumber(endSlide, totalSlides, totalSlides);

  pptx.writeFile({ fileName: "ethos-presentation.pptx" });
  toast.success("Downloaded presentation");
}

// ── PDF, DOCX, XLSX exports ──

function exportPDF(content: string, format: OutputFormat) {
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
    const trimmed = line.trim();
    if (!trimmed) { y += 4; continue; }
    if (trimmed.startsWith("## ")) {
      y += 6; pdf.setFontSize(16); pdf.setFont("helvetica", "bold"); pdf.setTextColor(26, 26, 46);
      const wrapped = pdf.splitTextToSize(trimmed.replace(/^##\s*/, ""), maxWidth);
      pdf.text(wrapped, margin, y); y += wrapped.length * 7 + 3;
    } else if (trimmed.startsWith("### ")) {
      y += 4; pdf.setFontSize(13); pdf.setFont("helvetica", "bold"); pdf.setTextColor(50, 50, 70);
      const wrapped = pdf.splitTextToSize(trimmed.replace(/^###\s*/, ""), maxWidth);
      pdf.text(wrapped, margin, y); y += wrapped.length * 6 + 2;
    } else if (trimmed.startsWith("# ")) {
      y += 6; pdf.setFontSize(20); pdf.setFont("helvetica", "bold"); pdf.setTextColor(26, 26, 46);
      const wrapped = pdf.splitTextToSize(trimmed.replace(/^#\s*/, ""), maxWidth);
      pdf.text(wrapped, margin, y); y += wrapped.length * 8 + 4;
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ") || trimmed.startsWith("• ")) {
      pdf.setFontSize(11); pdf.setFont("helvetica", "normal"); pdf.setTextColor(60, 60, 80);
      const bullet = "\u2022  " + trimmed.replace(/^[-*•]\s*/, "");
      const wrapped = pdf.splitTextToSize(bullet, maxWidth - 5);
      pdf.text(wrapped, margin + 5, y); y += wrapped.length * 5 + 2;
    } else if (trimmed.includes("|")) {
      pdf.setFontSize(9); pdf.setFont("helvetica", "normal"); pdf.setTextColor(50, 50, 70);
      pdf.text(trimmed, margin, y); y += 5;
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
        children: [new TextRun({ text: para.replace(/^[-*•]\s*/, ""), size: 22, font: "Calibri" })],
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
    const ws = XLSX.utils.aoa_to_sheet([["Content"], ...lines.map(l => [l.replace(/^[-*•#|]\s*/, "").trim()])]);
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
      slides: `Convert this board content into a beautifully structured slide presentation that could WIN a competition. Create slides that are visually engaging and tell a compelling story.\n\nFor each slide provide:\n- ## Slide Title\n- subtitle: A short subtitle\n- layout: (one of: title, content, two-column, quote, stats, big-statement)\n- Bullet points (key insights, not just lists)\n- Speaker Notes: detailed talking points\n\nDesign guidelines:\n- First slide should be a powerful title slide with a subtitle\n- Use storytelling flow: hook > problem > solution > impact > call to action\n- Keep bullet points concise and impactful (max 4-5 per slide)\n- Include a closing slide\n- Make titles catchy and memorable\n- Vary the layout types for visual interest — use quote for powerful quotes, stats for data, big-statement for key takeaways, two-column for comparisons\n- Create 8-12 slides for a complete presentation\n\nBoard content:\n- ${boardData}${answersContext}${moodContext}\n\n${customPrompt ? `Additional instructions: ${customPrompt}\n\n` : ""}Format as clean markdown with ## for each slide.`,
      document: `Convert this board content into a well-formatted ${docStyle} document. ${
        docStyle === "flowchart" ? "Include a text-based flowchart using arrows and boxes." :
        docStyle === "report" ? "Structure with executive summary, sections, and conclusion." :
        docStyle === "outline" ? "Create a hierarchical outline with clear nesting." :
        "Write as a concise business memo."
      }\n\nBoard content:\n- ${boardData}${answersContext}${moodContext}\n\n${customPrompt ? `Additional instructions: ${customPrompt}\n\n` : ""}Format as markdown.`,
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
