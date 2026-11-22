export const GRID = 20;

export const PALETTE = {
  blue: { fill: "#dbeafe", stroke: "#1d4ed8", text: "#1e3a8a", swatch: "#3b82f6" },
  amber: { fill: "#fef3c7", stroke: "#b45309", text: "#78350f", swatch: "#f59e0b" },
  emerald: { fill: "#d1fae5", stroke: "#047857", text: "#064e3b", swatch: "#10b981" },
  violet: { fill: "#ede9fe", stroke: "#6d28d9", text: "#4c1d95", swatch: "#8b5cf6" },
  rose: { fill: "#ffe4e6", stroke: "#be123c", text: "#881337", swatch: "#f43f5e" },
  yellow: { fill: "#fef9c3", stroke: "#a16207", text: "#713f12", swatch: "#eab308" },
  slate: { fill: "#e2e8f0", stroke: "#334155", text: "#0f172a", swatch: "#64748b" },
} as const;

export type ColorKey = keyof typeof PALETTE;

export const COLOR_KEYS = Object.keys(PALETTE) as ColorKey[];

export const COLOR_LABELS: Record<ColorKey, string> = {
  blue: "Azul",
  amber: "Ámbar",
  emerald: "Verde",
  violet: "Violeta",
  rose: "Rosa",
  yellow: "Amarillo",
  slate: "Gris",
};

export type ShapeKind =
  | "rect"
  | "ellipse"
  | "diamond"
  | "parallelogram"
  | "cylinder"
  | "note"
  | "arrow";

export type Tool = "select" | ShapeKind;

export type Shape = {
  id: string;
  kind: ShapeKind;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  color: ColorKey;
};

export type BoxHandle = "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";

type Preset = {
  label: string;
  shortcut: string;
  hint: string;
  w: number;
  h: number;
  text: string;
  color: ColorKey;
};

export const PRESETS: Record<ShapeKind, Preset> = {
  rect: {
    label: "Proceso",
    shortcut: "R",
    hint: "Clic para soltar un proceso, o arrastra para definir el tamaño.",
    w: 160,
    h: 80,
    text: "Proceso",
    color: "blue",
  },
  ellipse: {
    label: "Inicio / fin",
    shortcut: "E",
    hint: "Clic para soltar un inicio o un fin.",
    w: 160,
    h: 80,
    text: "Inicio",
    color: "emerald",
  },
  diamond: {
    label: "Decisión",
    shortcut: "D",
    hint: "Clic para soltar una decisión.",
    w: 120,
    h: 120,
    text: "¿Sí?",
    color: "amber",
  },
  parallelogram: {
    label: "Datos",
    shortcut: "P",
    hint: "Clic para soltar una entrada o salida de datos.",
    w: 160,
    h: 80,
    text: "Datos",
    color: "violet",
  },
  cylinder: {
    label: "Base de datos",
    shortcut: "B",
    hint: "Clic para soltar una base de datos.",
    w: 120,
    h: 120,
    text: "Datos",
    color: "slate",
  },
  note: {
    label: "Nota",
    shortcut: "N",
    hint: "Clic para soltar una nota.",
    w: 160,
    h: 120,
    text: "Nota",
    color: "yellow",
  },
  arrow: {
    label: "Conector",
    shortcut: "F",
    hint: "Arrastra para trazar una flecha, o haz clic para una horizontal.",
    w: 160,
    h: 0,
    text: "",
    color: "slate",
  },
};

export const SHAPE_KINDS = Object.keys(PRESETS) as ShapeKind[];

export const SELECT_HINT =
  "Mayús+clic o un recuadro eligen varios; arrástralos para moverlos juntos. Clic de nuevo o Enter escribe. Espacio desplaza el lienzo.";

export function toolFromShortcut(key: string): Tool | null {
  const shortcut = key.toLowerCase();
  if (shortcut === "v") return "select";
  return SHAPE_KINDS.find((kind) => PRESETS[kind].shortcut.toLowerCase() === shortcut) ?? null;
}

export function snap(value: number, enabled: boolean) {
  if (!enabled) return value;
  return Math.round(value / GRID) * GRID;
}

export function normalizeBox(x: number, y: number, w: number, h: number, min = 40) {
  let left = x;
  let top = y;
  let width = w;
  let height = h;

  if (width < 0) {
    left += width;
    width = -width;
  }
  if (height < 0) {
    top += height;
    height = -height;
  }

  return {
    x: left,
    y: top,
    w: Math.max(min, width),
    h: Math.max(min, height),
  };
}

export function placedGeometry(
  input: {
    shapeKind: ShapeKind;
    color: ColorKey;
    originX: number;
    originY: number;
    x: number;
    y: number;
  },
  gridOn: boolean,
): Omit<Shape, "id"> {
  const preset = PRESETS[input.shapeKind];
  const dw = input.x - input.originX;
  const dh = input.y - input.originY;

  if (Math.hypot(dw, dh) < 8) {
    return {
      kind: input.shapeKind,
      x: snap(input.originX - preset.w / 2, gridOn),
      y: snap(input.originY - preset.h / 2, gridOn),
      w: preset.w,
      h: preset.h,
      text: preset.text,
      color: input.color,
    };
  }

  if (input.shapeKind === "arrow") {
    return {
      kind: "arrow",
      x: input.originX,
      y: input.originY,
      w: dw,
      h: dh,
      text: "",
      color: input.color,
    };
  }

  return {
    kind: input.shapeKind,
    ...normalizeBox(input.originX, input.originY, dw, dh),
    text: preset.text,
    color: input.color,
  };
}

export function resizeBox(
  origin: Pick<Shape, "x" | "y" | "w" | "h">,
  handle: BoxHandle,
  dx: number,
  dy: number,
  gridOn: boolean,
) {
  const min = 40;
  let x = origin.x;
  let y = origin.y;
  let right = origin.x + origin.w;
  let bottom = origin.y + origin.h;

  if (handle.includes("e")) right = snap(origin.x + origin.w + dx, gridOn);
  if (handle.includes("s")) bottom = snap(origin.y + origin.h + dy, gridOn);
  if (handle.includes("w")) x = snap(origin.x + dx, gridOn);
  if (handle.includes("n")) y = snap(origin.y + dy, gridOn);

  if (right - x < min) {
    if (handle.includes("w") && !handle.includes("e")) x = right - min;
    else right = x + min;
  }
  if (bottom - y < min) {
    if (handle.includes("n") && !handle.includes("s")) y = bottom - min;
    else bottom = y + min;
  }

  return { x, y, w: right - x, h: bottom - y };
}

export function resizeArrow(
  origin: Pick<Shape, "x" | "y" | "w" | "h">,
  which: "start" | "end",
  dx: number,
  dy: number,
  gridOn: boolean,
) {
  const endX = origin.x + origin.w;
  const endY = origin.y + origin.h;

  if (which === "end") {
    const x = snap(endX + dx, gridOn);
    const y = snap(endY + dy, gridOn);
    return { x: origin.x, y: origin.y, w: x - origin.x, h: y - origin.y };
  }

  const x = snap(origin.x + dx, gridOn);
  const y = snap(origin.y + dy, gridOn);
  return { x, y, w: endX - x, h: endY - y };
}

export function cylinderCap(shape: Pick<Shape, "w" | "h">) {
  return Math.min(16, Math.max(7, shape.h * 0.14));
}

export function labelBox(shape: Pick<Shape, "kind" | "x" | "y" | "w" | "h">) {
  if (shape.kind === "arrow") {
    return {
      x: shape.x + shape.w / 2 - 56,
      y: shape.y + shape.h / 2 - 14,
      w: 112,
      h: 28,
    };
  }

  if (shape.kind === "diamond") {
    return inset(shape.x + shape.w * 0.26, shape.y + shape.h * 0.32, shape.w * 0.48, shape.h * 0.36);
  }

  if (shape.kind === "parallelogram") {
    const pad = Math.min(36, shape.w * 0.2);
    return inset(shape.x + pad, shape.y + 8, shape.w - pad * 2, shape.h - 16);
  }

  if (shape.kind === "cylinder") {
    const cap = cylinderCap(shape);
    return inset(shape.x + 10, shape.y + cap + 8, shape.w - 20, shape.h - cap * 2 - 12);
  }

  if (shape.kind === "note") {
    return inset(shape.x + 12, shape.y + 16, shape.w - 24, shape.h - 28);
  }

  return inset(shape.x + 10, shape.y + 8, shape.w - 20, shape.h - 16);
}

function inset(x: number, y: number, w: number, h: number) {
  return { x, y, w: Math.max(16, w), h: Math.max(16, h) };
}

export const BOX_HANDLES: { id: BoxHandle; cursor: string }[] = [
  { id: "nw", cursor: "nwse-resize" },
  { id: "n", cursor: "ns-resize" },
  { id: "ne", cursor: "nesw-resize" },
  { id: "e", cursor: "ew-resize" },
  { id: "se", cursor: "nwse-resize" },
  { id: "s", cursor: "ns-resize" },
  { id: "sw", cursor: "nesw-resize" },
  { id: "w", cursor: "ew-resize" },
];

export type Rect = { x: number; y: number; w: number; h: number };

export function shapeBounds(shape: Pick<Shape, "kind" | "x" | "y" | "w" | "h">): Rect {
  if (shape.kind !== "arrow") {
    return { x: shape.x, y: shape.y, w: shape.w, h: shape.h };
  }

  const x2 = shape.x + shape.w;
  const y2 = shape.y + shape.h;
  const pad = 8;
  return {
    x: Math.min(shape.x, x2) - pad,
    y: Math.min(shape.y, y2) - pad,
    w: Math.abs(shape.w) + pad * 2,
    h: Math.abs(shape.h) + pad * 2,
  };
}

export function rectsIntersect(a: Rect, b: Rect) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function rectFromPoints(x1: number, y1: number, x2: number, y2: number): Rect {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    w: Math.abs(x2 - x1),
    h: Math.abs(y2 - y1),
  };
}

export function idsInRect(shapes: readonly Shape[], rect: Rect) {
  return shapes.filter((shape) => rectsIntersect(shapeBounds(shape), rect)).map((shape) => shape.id);
}

export function handlePoint(shape: Pick<Shape, "x" | "y" | "w" | "h">, handle: BoxHandle) {
  const midX = shape.x + shape.w / 2;
  const midY = shape.y + shape.h / 2;
  const right = shape.x + shape.w;
  const bottom = shape.y + shape.h;

  switch (handle) {
    case "nw":
      return { x: shape.x, y: shape.y };
    case "n":
      return { x: midX, y: shape.y };
    case "ne":
      return { x: right, y: shape.y };
    case "e":
      return { x: right, y: midY };
    case "se":
      return { x: right, y: bottom };
    case "s":
      return { x: midX, y: bottom };
    case "sw":
      return { x: shape.x, y: bottom };
    case "w":
      return { x: shape.x, y: midY };
  }
}
