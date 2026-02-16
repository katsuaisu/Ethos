/**
 * Miro Compatibility Abstraction Layer
 * Maps internal board elements to Miro-supported primitives,
 * simplifies connectors, normalizes dimensions, and pre-calculates
 * positions to avoid collisions.
 */

interface LayoutItem {
  content: string;
  x: number;
  y: number;
  type: string;
  color?: string;
  width?: number;
  height?: number;
  connectedTo?: number[];
  elementType?: string;
}

interface MiroItem {
  content: string;
  x: number;
  y: number;
  type: "sticky_note" | "shape";
  color?: string;
  width?: number;
  height?: number;
}

// Miro-friendly dimensions
const MIRO_STICKY_WIDTH = 200;
const MIRO_SHAPE_WIDTH = 250;
const MIRO_SPACING_X = 320;
const MIRO_SPACING_Y = 280;
const MIRO_MAX_CONTENT_LEN = 200;

// Map ALL element types to sticky_note for reliable Miro export
function mapElementType(_elementType?: string, _type?: string): "sticky_note" | "shape" {
  // All elements export as sticky notes for maximum compatibility
  return "sticky_note";
}

// Miro color palette
const MIRO_COLORS: Record<string, string> = {
  "#FFF9DB": "light_yellow",
  "#D4EDDA": "light_green",
  "#FDE8E8": "light_pink",
  "#E3F2FD": "light_blue",
  "#F3E5F5": "violet",
  "#FFE8D6": "orange",
  "#F5E6D3": "orange",
  "#E8D5B7": "yellow",
  "#E0F4FF": "light_blue",
  "#E8E3F3": "violet",
  "#FFECD2": "light_yellow",
  "#F5F5F5": "gray",
  "#1A1A1A": "black",
};

function toMiroColor(hex?: string): string {
  if (!hex || hex === "transparent") return "light_yellow";
  const upper = hex.toUpperCase();
  if (MIRO_COLORS[upper]) return MIRO_COLORS[upper];
  const r = parseInt(upper.slice(1, 3), 16);
  const g = parseInt(upper.slice(3, 5), 16);
  const b = parseInt(upper.slice(5, 7), 16);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2 / 255;
  if (l < 0.2) return "black";
  if (l > 0.9) return "gray";
  let h = 0;
  if (max !== min) {
    const d = max - min;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  if (h < 30 || h >= 330) return "light_pink";
  if (h < 60) return "orange";
  if (h < 90) return "light_yellow";
  if (h < 150) return "light_green";
  if (h < 210) return "cyan";
  if (h < 270) return "light_blue";
  return "violet";
}

function truncateContent(content: string): string {
  const clean = content
    .replace(/<[^>]*>/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .trim();
  return clean.length > MIRO_MAX_CONTENT_LEN ? clean.slice(0, MIRO_MAX_CONTENT_LEN - 3) + "..." : clean;
}

// Detect and resolve spatial collisions
function resolveCollisions(items: MiroItem[]): MiroItem[] {
  const resolved = [...items];
  const occupied = new Set<string>();

  for (let i = 0; i < resolved.length; i++) {
    const item = resolved[i];
    let { x, y } = item;
    let key = `${Math.round(x / 100)}_${Math.round(y / 100)}`;
    let attempts = 0;
    while (occupied.has(key) && attempts < 20) {
      x += MIRO_SPACING_X * 0.4;
      if (attempts % 5 === 4) { x = item.x; y += MIRO_SPACING_Y * 0.5; }
      key = `${Math.round(x / 100)}_${Math.round(y / 100)}`;
      attempts++;
    }
    occupied.add(key);
    resolved[i] = { ...item, x: Math.round(x), y: Math.round(y) };
  }
  return resolved;
}

// Re-layout items for Miro
function normalizeLayout(items: LayoutItem[]): { x: number; y: number }[] {
  if (items.length === 0) return [];
  const centralIdx = items.findIndex(i => i.type === "central");
  if (centralIdx >= 0) {
    const cx = 0, cy = 0;
    const positions = items.map(() => ({ x: 0, y: 0 }));
    positions[centralIdx] = { x: cx, y: cy };
    const branches = items.map((_, i) => i).filter(i => i !== centralIdx);
    const angleStep = (2 * Math.PI) / Math.max(branches.length, 1);
    const radius = Math.max(500, branches.length * 100);
    branches.forEach((idx, i) => {
      const angle = angleStep * i - Math.PI / 2;
      positions[idx] = { x: Math.round(cx + Math.cos(angle) * radius), y: Math.round(cy + Math.sin(angle) * radius) };
    });
    return positions;
  }
  const cols = Math.ceil(Math.sqrt(items.length));
  return items.map((_, i) => ({ x: (i % cols) * MIRO_SPACING_X, y: Math.floor(i / cols) * MIRO_SPACING_Y }));
}

/**
 * Snapshot and validate board state before export.
 * Returns null if validation fails.
 */
export function snapshotAndValidate(items: LayoutItem[]): { items: LayoutItem[]; errors: string[] } | null {
  if (!items || items.length === 0) return null;
  
  // Deep clone — freeze state
  const snapshot = JSON.parse(JSON.stringify(items)) as LayoutItem[];
  const errors: string[] = [];

  // Validate every node
  for (let i = 0; i < snapshot.length; i++) {
    const item = snapshot[i];
    if (item.x == null || item.y == null) {
      errors.push(`Node ${i} missing position`);
      item.x = item.x ?? 0;
      item.y = item.y ?? 0;
    }
    if (!item.content) {
      errors.push(`Node ${i} missing content`);
      item.content = "(empty)";
    }
    // Validate connectors reference valid IDs
    if (item.connectedTo) {
      item.connectedTo = item.connectedTo.filter(c => {
        if (c < 0 || c >= snapshot.length || c === i) {
          errors.push(`Node ${i} has invalid connector to ${c}`);
          return false;
        }
        return true;
      });
    }
    // Ensure width/height
    if (!item.width) item.width = 140;
    if (!item.height) item.height = 100;
  }

  // Check for duplicate IDs (by content+position)
  const seen = new Set<string>();
  for (const item of snapshot) {
    const key = `${item.content}|${item.x}|${item.y}`;
    if (seen.has(key)) errors.push(`Duplicate element: "${item.content.slice(0, 30)}"`);
    seen.add(key);
  }

  return { items: snapshot, errors };
}

/**
 * Convert internal board items to Miro-compatible format.
 * Uses snapshot for immutable export.
 */
export function convertToMiroItems(items: LayoutItem[]): MiroItem[] {
  if (items.length === 0) return [];
  const positions = normalizeLayout(items);

  const miroItems: MiroItem[] = items.map((item, i) => ({
    content: truncateContent(item.content),
    x: positions[i].x,
    y: positions[i].y,
    type: mapElementType(item.elementType, item.type),
    color: toMiroColor(item.color),
    width: item.type === "shape" || item.elementType === "shape_rect" ? MIRO_SHAPE_WIDTH : MIRO_STICKY_WIDTH,
    height: item.height || 100,
  }));

  return resolveCollisions(miroItems);
}

/**
 * Get simplified connections for Miro export.
 * Returns array of [fromIndex, toIndex] pairs.
 */
export function getMiroConnections(items: LayoutItem[]): number[][] {
  const connections: number[][] = [];
  const seen = new Set<string>();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.connectedTo?.length) continue;
    for (const target of item.connectedTo) {
      if (target < 0 || target >= items.length || target === i) continue;
      // Deduplicate bidirectional
      const key = `${Math.min(i, target)}-${Math.max(i, target)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      connections.push([i, target]);
    }
  }
  return connections;
}
