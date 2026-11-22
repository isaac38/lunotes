"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import ShapeView from "@/components/diagram/ShapeView";
import {
  BOX_HANDLES,
  COLOR_KEYS,
  COLOR_LABELS,
  GRID,
  PALETTE,
  PRESETS,
  SELECT_HINT,
  SHAPE_KINDS,
  handlePoint,
  labelBox,
  placedGeometry,
  resizeArrow,
  resizeBox,
  snap,
  toolFromShortcut,
  type BoxHandle,
  type ColorKey,
  type Shape,
  type ShapeKind,
  type Tool,
} from "@/components/diagram/model";

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 3;
const ZOOM_STEP = 1.25;

function clampZoom(value: number) {
  const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
  return Math.round(clamped * 1000) / 1000;
}

function positiveMod(value: number, size: number) {
  if (size === 0) return 0;
  return ((value % size) + size) % size;
}

type DrawGesture = {
  type: "draw";
  shapeKind: ShapeKind;
  color: ColorKey;
  originX: number;
  originY: number;
  x: number;
  y: number;
};

type MoveGesture = {
  type: "move";
  id: string;
  pointerX: number;
  pointerY: number;
  originX: number;
  originY: number;
  lastX: number;
  lastY: number;
  moved: boolean;
  editOnClick: boolean;
  snapshot: Shape[];
};

type ResizeGesture = {
  type: "resize";
  id: string;
  handle: BoxHandle;
  pointerX: number;
  pointerY: number;
  origin: Shape;
  moved: boolean;
  snapshot: Shape[];
};

type ArrowGesture = {
  type: "arrow";
  id: string;
  which: "start" | "end";
  pointerX: number;
  pointerY: number;
  origin: Shape;
  moved: boolean;
  snapshot: Shape[];
};

type Gesture = DrawGesture | MoveGesture | ResizeGesture | ArrowGesture;

export default function DiagramEditor() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Gesture | null>(null);
  const shapesRef = useRef<Shape[]>([]);
  const historyRef = useRef<Shape[][]>([]);
  const futureRef = useRef<Shape[][]>([]);
  const editingIdRef = useRef<string | null>(null);
  const editTextRef = useRef("");

  const [shapes, setShapes] = useState<Shape[]>([]);
  const [tool, setTool] = useState<Tool>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [draft, setDraft] = useState<Shape | null>(null);
  const [gestureKind, setGestureKind] = useState<Gesture["type"] | null>(null);
  const [grid, setGrid] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [nextColor, setNextColor] = useState<ColorKey | null>(null);
  const [pastCount, setPastCount] = useState(0);
  const [futureCount, setFutureCount] = useState(0);
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });

  const selected = shapes.find((shape) => shape.id === selectedId) ?? null;
  const indicatedColor = nextColor ?? selected?.color ?? null;

  function remember(snapshot: Shape[]) {
    historyRef.current.push(snapshot);
    if (historyRef.current.length > 100) historyRef.current.shift();
    futureRef.current = [];
    setPastCount(historyRef.current.length);
    setFutureCount(0);
  }

  function writeShapes(next: Shape[]) {
    shapesRef.current = next;
    setShapes(next);
  }

  function commit(next: Shape[]) {
    remember(shapesRef.current);
    writeShapes(next);
  }

  function updateShape(id: string, patch: Partial<Shape>) {
    writeShapes(
      shapesRef.current.map((shape) => (shape.id === id ? { ...shape, ...patch } : shape)),
    );
  }

  function bringToFront(id: string) {
    const prev = shapesRef.current;
    const index = prev.findIndex((shape) => shape.id === id);
    if (index < 0 || index === prev.length - 1) return;
    const next = prev.slice();
    const [item] = next.splice(index, 1);
    next.push(item);
    writeShapes(next);
  }

  function commitEdit() {
    const id = editingIdRef.current;
    if (!id) return;
    editingIdRef.current = null;
    const text = editTextRef.current;
    setEditingId(null);
    const current = shapesRef.current.find((shape) => shape.id === id);
    if (!current || current.text === text) return;
    commit(shapesRef.current.map((shape) => (shape.id === id ? { ...shape, text } : shape)));
  }

  function cancelEdit() {
    editingIdRef.current = null;
    setEditingId(null);
  }

  function chooseTool(next: Tool) {
    setTool(next);
    if (next !== "select") setSelectedId(null);
  }

  function undo() {
    if (dragRef.current) return;
    const previous = historyRef.current.pop();
    if (!previous) return;
    futureRef.current.push(shapesRef.current);
    writeShapes(previous);
    setPastCount(historyRef.current.length);
    setFutureCount(futureRef.current.length);
    setSelectedId(null);
    cancelEdit();
  }

  function redo() {
    if (dragRef.current) return;
    const next = futureRef.current.pop();
    if (!next) return;
    historyRef.current.push(shapesRef.current);
    writeShapes(next);
    setPastCount(historyRef.current.length);
    setFutureCount(futureRef.current.length);
    setSelectedId(null);
    cancelEdit();
  }

  function removeSelected() {
    const id = selectedId;
    if (!id) return;
    const prev = shapesRef.current;
    if (!prev.some((shape) => shape.id === id)) return;
    commit(prev.filter((shape) => shape.id !== id));
    setSelectedId(null);
    cancelEdit();
  }

  function applyColor(color: ColorKey) {
    setNextColor(color);
    const id = selectedId;
    if (!id || tool !== "select") return;
    const current = shapesRef.current.find((shape) => shape.id === id);
    if (!current || current.color === color) return;
    commit(shapesRef.current.map((shape) => (shape.id === id ? { ...shape, color } : shape)));
  }

  const commitView = useCallback((nextZoom: number, anchorX: number, anchorY: number) => {
    const currentZoom = zoomRef.current;
    const origin = panRef.current;
    const clamped = clampZoom(nextZoom);
    const worldX = (anchorX - origin.x) / currentZoom;
    const worldY = (anchorY - origin.y) / currentZoom;
    const nextPan = {
      x: anchorX - worldX * clamped,
      y: anchorY - worldY * clamped,
    };
    zoomRef.current = clamped;
    panRef.current = nextPan;
    setZoom(clamped);
    setPan(nextPan);
  }, []);

  function zoomBy(factor: number) {
    const bounds = canvasRef.current?.getBoundingClientRect();
    commitView(zoomRef.current * factor, bounds ? bounds.width / 2 : 0, bounds ? bounds.height / 2 : 0);
  }

  function resetView() {
    zoomRef.current = 1;
    panRef.current = { x: 0, y: 0 };
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  function pointFromEvent(event: { clientX: number; clientY: number }) {
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (!bounds) return { x: 0, y: 0 };
    const origin = panRef.current;
    const scale = zoomRef.current;
    return {
      x: (event.clientX - bounds.left - origin.x) / scale,
      y: (event.clientY - bounds.top - origin.y) / scale,
    };
  }

  function beginGesture(event: React.PointerEvent, gesture: Gesture) {
    dragRef.current = gesture;
    setGestureKind(gesture.type);
    canvasRef.current?.setPointerCapture(event.pointerId);
  }

  function endGesture(event: { type?: string; pointerId?: number }) {
    if (
      event.type === "lostpointercapture" &&
      event.pointerId !== undefined &&
      canvasRef.current?.hasPointerCapture(event.pointerId)
    ) {
      return;
    }

    const gesture = dragRef.current;
    if (!gesture) return;
    dragRef.current = null;
    setGestureKind(null);
    setDraft(null);

    if (gesture.type === "draw") {
      const shape: Shape = {
        id: crypto.randomUUID(),
        ...placedGeometry(gesture, grid),
      };
      commit([...shapesRef.current, shape]);
      setSelectedId(shape.id);
      setTool("select");
      if (shape.kind !== "arrow") startEditing(shape);
      return;
    }

    if (gesture.type === "move" && gesture.editOnClick && !gesture.moved) {
      const shape = shapesRef.current.find((item) => item.id === gesture.id);
      if (shape) startEditing(shape);
    }

    if (gesture.moved) remember(gesture.snapshot);
  }

  function onCanvasPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    commitEdit();

    if (tool === "select") {
      setSelectedId(null);
      return;
    }

    const raw = pointFromEvent(event);
    const originX = snap(raw.x, grid);
    const originY = snap(raw.y, grid);
    const gesture: DrawGesture = {
      type: "draw",
      shapeKind: tool,
      color: nextColor ?? PRESETS[tool].color,
      originX,
      originY,
      x: originX,
      y: originY,
    };
    beginGesture(event, gesture);
    setDraft({ id: "draft", ...placedGeometry(gesture, grid) });
  }

  function onShapePointerDown(event: React.PointerEvent<SVGGElement>, shape: Shape) {
    if (tool !== "select") return;
    event.stopPropagation();
    commitEdit();
    const point = pointFromEvent(event);
    const snapshot = shapesRef.current;
    const editOnClick = selectedId === shape.id;
    bringToFront(shape.id);
    setSelectedId(shape.id);
    beginGesture(event, {
      type: "move",
      id: shape.id,
      pointerX: point.x,
      pointerY: point.y,
      originX: shape.x,
      originY: shape.y,
      lastX: shape.x,
      lastY: shape.y,
      moved: false,
      editOnClick,
      snapshot,
    });
  }

  function onResizePointerDown(
    event: React.PointerEvent<HTMLDivElement>,
    shape: Shape,
    handle: BoxHandle,
  ) {
    event.stopPropagation();
    commitEdit();
    const point = pointFromEvent(event);
    beginGesture(event, {
      type: "resize",
      id: shape.id,
      handle,
      pointerX: point.x,
      pointerY: point.y,
      origin: shape,
      moved: false,
      snapshot: shapesRef.current,
    });
  }

  function onArrowPointerDown(
    event: React.PointerEvent<HTMLDivElement>,
    shape: Shape,
    endpoint: "start" | "end",
  ) {
    event.stopPropagation();
    commitEdit();
    const point = pointFromEvent(event);
    beginGesture(event, {
      type: "arrow",
      id: shape.id,
      which: endpoint,
      pointerX: point.x,
      pointerY: point.y,
      origin: shape,
      moved: false,
      snapshot: shapes,
    });
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const gesture = dragRef.current;
    if (!gesture) return;
    const raw = pointFromEvent(event);
    const gridOn = grid;

    if (gesture.type === "draw") {
      gesture.x = snap(raw.x, gridOn);
      gesture.y = snap(raw.y, gridOn);
      setDraft({ id: "draft", ...placedGeometry(gesture, gridOn) });
      return;
    }

    const dx = raw.x - gesture.pointerX;
    const dy = raw.y - gesture.pointerY;

    if (gesture.type === "move") {
      const x = snap(gesture.originX + dx, gridOn);
      const y = snap(gesture.originY + dy, gridOn);
      if (x === gesture.lastX && y === gesture.lastY) return;
      gesture.lastX = x;
      gesture.lastY = y;
      gesture.moved = x !== gesture.originX || y !== gesture.originY;
      updateShape(gesture.id, { x, y });
      return;
    }

    const next =
      gesture.type === "resize"
        ? resizeBox(gesture.origin, gesture.handle, dx, dy, gridOn)
        : resizeArrow(gesture.origin, gesture.which, dx, dy, gridOn);
    const same =
      next.x === gesture.origin.x &&
      next.y === gesture.origin.y &&
      next.w === gesture.origin.w &&
      next.h === gesture.origin.h;
    gesture.moved = !same;
    updateShape(gesture.id, next);
  }

  function startEditing(shape: Shape) {
    setTool("select");
    setSelectedId(shape.id);
    editingIdRef.current = shape.id;
    editTextRef.current = shape.text;
    setEditingId(shape.id);
    setEditText(shape.text);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || target.closest("textarea, input"))
      ) {
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if (
        event.key === "=" ||
        event.key === "+" ||
        event.key === "Add" ||
        event.key === "-" ||
        event.key === "_" ||
        event.key === "Subtract" ||
        event.key === "0"
      ) {
        event.preventDefault();
        if (event.key === "-" || event.key === "_" || event.key === "Subtract") zoomBy(1 / ZOOM_STEP);
        else if (event.key === "0") resetView();
        else zoomBy(ZOOM_STEP);
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        removeSelected();
        return;
      }
      if (event.key === "Escape") {
        cancelEdit();
        setSelectedId(null);
        setTool("select");
        return;
      }
      if ((event.key === "Enter" || event.key === "F2") && selectedId) {
        const shape = shapesRef.current.find((item) => item.id === selectedId);
        if (shape) {
          event.preventDefault();
          startEditing(shape);
        }
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const next = toolFromShortcut(event.key);
      if (next) chooseTool(next);
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    const node = canvasRef.current;
    if (!node) return;
    const canvas = node;

    function onWheel(event: WheelEvent) {
      if (dragRef.current) return;
      event.preventDefault();
      const bounds = canvas.getBoundingClientRect();
      const pixels =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? event.deltaY * 40
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? event.deltaY * bounds.height
            : event.deltaY;
      const factor = Math.exp(-pixels * 0.0025);
      commitView(
        zoomRef.current * factor,
        event.clientX - bounds.left,
        event.clientY - bounds.top,
      );
    }

    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [commitView]);

  const editingShape = shapes.find((shape) => shape.id === editingId) ?? null;
  const hint = editingId
    ? "Escribe dentro de la forma. Enter guarda y Escape cancela."
    : tool === "select"
      ? SELECT_HINT
      : PRESETS[tool].hint;
  const cursor =
    gestureKind === "move" ? "cursor-grabbing" : tool === "select" ? "cursor-default" : "cursor-crosshair";

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden bg-[#efeae2] font-sans text-zinc-900 select-none dark:bg-[#1c1b19] dark:text-zinc-100">
      <div
        ref={canvasRef}
        role="application"
        aria-label="Lienzo de diagrama"
        className={`absolute inset-0 touch-none ${cursor}`}
        onPointerDown={onCanvasPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        onLostPointerCapture={endGesture}
      >
        <svg className="pointer-events-none absolute inset-0 h-full w-full">
          <defs>
            <pattern
              id="diagram-dots"
              width={GRID * zoom}
              height={GRID * zoom}
              patternUnits="userSpaceOnUse"
              x={positiveMod(pan.x, GRID * zoom)}
              y={positiveMod(pan.y, GRID * zoom)}
            >
              <circle cx={zoom} cy={zoom} r={1.15 * zoom} fill="#6f675e" />
            </pattern>
          </defs>
          {grid ? <rect width="100%" height="100%" fill="url(#diagram-dots)" /> : null}
        </svg>

        <div
          className="absolute top-0 left-0 h-full w-full origin-top-left"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        >
        <svg className="absolute inset-0 h-full w-full overflow-visible">
          <defs>
            {COLOR_KEYS.map((color) => (
              <marker
                key={color}
                id={`diagram-arrow-${color}`}
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill={PALETTE[color].stroke} />
              </marker>
            ))}
          </defs>
          {shapes.map((shape) => (
            <ShapeView
              key={shape.id}
              shape={shape}
              selected={shape.id === selectedId}
              hovered={shape.id === hoveredId && tool === "select"}
              listening={tool === "select" && gestureKind === null}
              onPointerDown={(event) => onShapePointerDown(event, shape)}
              onDoubleClick={(event) => {
                event.stopPropagation();
                startEditing(shape);
              }}
              onPointerEnter={() => {
                if (tool === "select") setHoveredId(shape.id);
              }}
              onPointerLeave={() => {
                setHoveredId((current) => (current === shape.id ? null : current));
              }}
            />
          ))}
          {draft ? (
            <ShapeView
              shape={draft}
              selected={false}
              hovered={false}
              listening={false}
            />
          ) : null}
        </svg>

        {shapes.map((shape) =>
          shape.id === editingId ? null : (
            <ShapeLabel key={shape.id} shape={shape} placeholder={shape.id === selectedId} />
          ),
        )}
        {draft && draft.id !== editingId ? <ShapeLabel shape={draft} placeholder={false} /> : null}

        {tool === "select" && selected && selected.kind !== "arrow"
          ? BOX_HANDLES.map((handle) => {
              const point = handlePoint(selected, handle.id);
              return (
                <div
                  key={handle.id}
                  title="Cambiar tamaño"
                  className="absolute z-20 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-zinc-900 bg-white shadow-sm dark:border-white dark:bg-zinc-900"
                  style={{ left: point.x, top: point.y, cursor: handle.cursor }}
                  onPointerDown={(event) => onResizePointerDown(event, selected, handle.id)}
                />
              );
            })
          : null}

        {tool === "select" && selected && selected.kind === "arrow" ? (
          <>
            <div
              title="Mover el origen"
              className="absolute z-20 h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-move rounded-full border border-zinc-900 bg-white shadow-sm dark:border-white dark:bg-zinc-900"
              style={{ left: selected.x, top: selected.y }}
              onPointerDown={(event) => onArrowPointerDown(event, selected, "start")}
            />
            <div
              title="Mover la punta"
              className="absolute z-20 h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-move rounded-full border border-zinc-900 bg-white shadow-sm dark:border-white dark:bg-zinc-900"
              style={{ left: selected.x + selected.w, top: selected.y + selected.h }}
              onPointerDown={(event) => onArrowPointerDown(event, selected, "end")}
            />
          </>
        ) : null}

        {editingShape ? (
          <LabelEditor
            key={editingShape.id}
            shape={editingShape}
            value={editText}
            onChange={(value) => {
              editTextRef.current = value;
              setEditText(value);
            }}
            onCommit={commitEdit}
            onCancel={cancelEdit}
          />
        ) : null}
        </div>

        {shapes.length === 0 && !draft ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center px-6 sm:pl-56">
            <div className="max-w-sm rounded-2xl border border-dashed border-black/15 bg-white/75 px-6 py-5 text-center shadow-sm dark:border-white/15 dark:bg-zinc-900/75">
              <p className="text-sm font-semibold">El lienzo está vacío</p>
              <p className="mt-1 text-sm leading-5 text-zinc-500 dark:text-zinc-400">
                Elige una forma en la barra y haz clic, o arrastra, para crear un objeto.
              </p>
            </div>
          </div>
        ) : null}
      </div>

      <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 p-4">
        <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-black/10 bg-white/90 px-3 py-2 shadow-sm backdrop-blur dark:border-white/10 dark:bg-zinc-900/90">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-zinc-900 text-xs font-semibold text-white dark:bg-white dark:text-zinc-900">
            Lu
          </span>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold leading-none">Lunotes</h1>
            <p className="mt-1 hidden max-w-sm text-xs leading-4 text-zinc-500 sm:block dark:text-zinc-400">
              {hint}
            </p>
          </div>
        </div>
        <div className="pointer-events-auto rounded-2xl border border-black/10 bg-white/90 px-3 py-2 text-xs font-medium text-zinc-600 shadow-sm backdrop-blur dark:border-white/10 dark:bg-zinc-900/90 dark:text-zinc-300">
          {selected ? `${PRESETS[selected.kind].label} · ` : null}
          {Math.round(zoom * 100)}% · {shapes.length === 1 ? "1 objeto" : `${shapes.length} objetos`}
        </div>
      </header>

      <Toolbar
        tool={tool}
        indicatedColor={indicatedColor}
        grid={grid}
        zoom={zoom}
        canUndo={pastCount > 0}
        canRedo={futureCount > 0}
        canDelete={selected !== null}
        canWrite={selected !== null}
        onTool={chooseTool}
        onColor={applyColor}
        onGrid={() => setGrid((value) => !value)}
        onZoomIn={() => zoomBy(ZOOM_STEP)}
        onZoomOut={() => zoomBy(1 / ZOOM_STEP)}
        onZoomReset={resetView}
        onUndo={undo}
        onRedo={redo}
        onDelete={removeSelected}
        onWrite={() => {
          if (selected) startEditing(selected);
        }}
      />
    </div>
  );
}

function textFits(node: HTMLElement) {
  return node.scrollHeight <= node.clientHeight + 1;
}

function fitShapeText(node: HTMLElement) {
  let size = 13;
  node.style.fontSize = "13px";
  node.style.lineHeight = "1.25";
  while (size > 9 && !textFits(node)) {
    size -= 0.5;
    node.style.fontSize = `${size}px`;
  }
  return textFits(node);
}

function ShapeLabel({ shape, placeholder }: { shape: Shape; placeholder: boolean }) {
  const box = labelBox(shape);
  const textRef = useRef<HTMLDivElement>(null);
  const empty = shape.text.trim().length === 0;

  useLayoutEffect(() => {
    if (textRef.current) fitShapeText(textRef.current);
  }, [shape.text, box.w, box.h]);

  if (empty && !placeholder) return null;

  return (
    <div
      className="pointer-events-none absolute z-10 flex items-center justify-center overflow-hidden"
      style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
    >
      <div
        ref={textRef}
        className="max-h-full min-h-0 w-full overflow-hidden px-1 text-center text-[13px] leading-tight font-semibold break-words whitespace-pre-wrap"
        style={{ color: empty ? "#8a8175" : PALETTE[shape.color].text }}
      >
        {empty ? "Escribir…" : shape.text}
      </div>
    </div>
  );
}

function LabelEditor({
  shape,
  value,
  onChange,
  onCommit,
  onCancel,
}: {
  shape: Shape;
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const initialText = useRef(value);
  const acceptedText = useRef(value);
  const box = labelBox(shape);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.textContent = initialText.current;
    fitShapeText(node);
    node.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(node);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, []);

  return (
    <div
      className="absolute z-30 flex items-center justify-center overflow-hidden"
      style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
    >
      <div
        ref={ref}
        role="textbox"
        aria-label={`Texto de ${PRESETS[shape.kind].label}`}
        contentEditable
        suppressContentEditableWarning
        className="max-h-full min-h-0 w-full overflow-hidden px-1 text-center text-[13px] leading-tight font-semibold break-words whitespace-pre-wrap outline-none select-text"
        style={{ color: PALETTE[shape.color].text }}
        onPointerDown={(event) => event.stopPropagation()}
        onInput={(event) => {
          const node = event.currentTarget;
          const next = node.innerText.replace(/\n$/, "");
          if (!fitShapeText(node)) {
            node.textContent = acceptedText.current;
            fitShapeText(node);
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(node);
            range.collapse(false);
            selection?.removeAllRanges();
            selection?.addRange(range);
            return;
          }
          acceptedText.current = next;
          onChange(next);
        }}
        onBlur={onCommit}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onCommit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
      />
    </div>
  );
}

function Toolbar({
  tool,
  indicatedColor,
  grid,
  zoom,
  canUndo,
  canRedo,
  canDelete,
  canWrite,
  onTool,
  onColor,
  onGrid,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onUndo,
  onRedo,
  onDelete,
  onWrite,
}: {
  tool: Tool;
  indicatedColor: ColorKey | null;
  grid: boolean;
  zoom: number;
  canUndo: boolean;
  canRedo: boolean;
  canDelete: boolean;
  canWrite: boolean;
  onTool: (tool: Tool) => void;
  onColor: (color: ColorKey) => void;
  onGrid: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onDelete: () => void;
  onWrite: () => void;
}) {
  return (
    <aside
      aria-label="Herramientas del diagrama"
      className="absolute z-30 flex max-w-[calc(100%-1.5rem)] gap-1 overflow-auto rounded-2xl border border-black/10 bg-white/95 p-1.5 shadow-lg backdrop-blur inset-x-3 bottom-3 flex-row sm:inset-x-auto sm:top-24 sm:bottom-4 sm:left-4 sm:w-48 sm:flex-col dark:border-white/10 dark:bg-zinc-900/95"
    >
      <ToolButton
        active={tool === "select"}
        label="Seleccionar"
        shortcut="V"
        onClick={() => onTool("select")}
      >
        <ToolIcon name="select" />
      </ToolButton>

      <Divider />
      <p className="hidden px-2 pt-0.5 text-[10px] font-semibold tracking-[0.14em] text-zinc-400 uppercase sm:block">
        Formas
      </p>
      {SHAPE_KINDS.map((kind) => (
        <ToolButton
          key={kind}
          active={tool === kind}
          label={PRESETS[kind].label}
          shortcut={PRESETS[kind].shortcut}
          onClick={() => onTool(kind)}
        >
          <ToolIcon name={kind} />
        </ToolButton>
      ))}

      <Divider />
      <p className="hidden px-2 pt-0.5 text-[10px] font-semibold tracking-[0.14em] text-zinc-400 uppercase sm:block">
        Color
      </p>
      <div className="grid grid-flow-col grid-rows-1 gap-1.5 px-1 py-1 sm:grid-flow-row sm:grid-cols-4 sm:px-2">
        {COLOR_KEYS.map((color) => {
          const active = indicatedColor === color;
          return (
            <button
              key={color}
              type="button"
              aria-label={`Color ${COLOR_LABELS[color]}`}
              aria-pressed={active}
              title={COLOR_LABELS[color]}
              className={`h-4 w-4 rounded-full ${active ? "ring-2 ring-zinc-900 ring-offset-2 ring-offset-white dark:ring-white dark:ring-offset-zinc-900" : "ring-1 ring-black/15"}`}
              style={{ backgroundColor: PALETTE[color].swatch }}
              onClick={() => onColor(color)}
            />
          );
        })}
      </div>

      <Divider />
      <ToolButton active={grid} label="Cuadrícula" onClick={onGrid}>
        <ToolIcon name="grid" />
      </ToolButton>
      <ToolButton label="Alejar" shortcut="−" disabled={zoom <= ZOOM_MIN} onClick={onZoomOut}>
        <ToolIcon name="zoom-out" />
      </ToolButton>
      <ToolButton label={`${Math.round(zoom * 100)}%`} shortcut="0" onClick={onZoomReset}>
        <ToolIcon name="zoom" />
      </ToolButton>
      <ToolButton label="Acercar" shortcut="+" disabled={zoom >= ZOOM_MAX} onClick={onZoomIn}>
        <ToolIcon name="zoom-in" />
      </ToolButton>
      <ToolButton label="Deshacer" disabled={!canUndo} onClick={onUndo}>
        <ToolIcon name="undo" />
      </ToolButton>
      <ToolButton label="Rehacer" disabled={!canRedo} onClick={onRedo}>
        <ToolIcon name="redo" />
      </ToolButton>
      <ToolButton label="Escribir" shortcut="Enter" disabled={!canWrite} onClick={onWrite}>
        <ToolIcon name="text" />
      </ToolButton>
      <ToolButton label="Eliminar" disabled={!canDelete} onClick={onDelete}>
        <ToolIcon name="trash" />
      </ToolButton>
    </aside>
  );
}

function Divider() {
  return <div className="mx-0.5 h-6 w-px shrink-0 self-center bg-black/10 sm:mx-1 sm:h-px sm:w-auto dark:bg-white/10" />;
}

function ToolButton({
  active = false,
  disabled = false,
  label,
  shortcut,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  label: string;
  shortcut?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={shortcut ? `${label} (${shortcut})` : label}
      aria-pressed={active}
      title={shortcut ? `${label} (${shortcut})` : label}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-xl text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-35 sm:h-8 sm:w-full sm:justify-start sm:px-2 ${
        active
          ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
          : "text-zinc-700 hover:bg-black/[0.05] dark:text-zinc-200 dark:hover:bg-white/10"
      }`}
    >
      {children}
      <span className="hidden sm:inline">{label}</span>
      {shortcut ? (
        <span
          className={`ml-auto hidden font-mono text-[10px] sm:inline ${active ? "text-white/70 dark:text-zinc-900/60" : "text-zinc-400"}`}
        >
          {shortcut}
        </span>
      ) : null}
    </button>
  );
}

function ToolIcon({
  name,
}: {
  name: Tool | "undo" | "redo" | "trash" | "grid" | "text" | "zoom" | "zoom-in" | "zoom-out";
}) {
  const props = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className: "shrink-0",
  };

  switch (name) {
    case "select":
      return (
        <svg {...props}>
          <path d="M4.5 3.8 10.2 20l2.1-6.1L18.6 12 4.5 3.8Z" />
        </svg>
      );
    case "rect":
      return (
        <svg {...props}>
          <rect x="4" y="6" width="16" height="12" rx="2" />
        </svg>
      );
    case "ellipse":
      return (
        <svg {...props}>
          <ellipse cx="12" cy="12" rx="8" ry="5.5" />
        </svg>
      );
    case "diamond":
      return (
        <svg {...props}>
          <path d="M12 3.5 20.5 12 12 20.5 3.5 12Z" />
        </svg>
      );
    case "parallelogram":
      return (
        <svg {...props}>
          <path d="M8 6h12L16 18H4Z" />
        </svg>
      );
    case "cylinder":
      return (
        <svg {...props}>
          <ellipse cx="12" cy="7" rx="6" ry="2.4" />
          <path d="M6 7v10c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V7" />
        </svg>
      );
    case "note":
      return (
        <svg {...props}>
          <path d="M7 4.5h7.2L19 9.2V19.5H7Z" />
          <path d="M14.2 4.5V9.2H19" />
        </svg>
      );
    case "arrow":
      return (
        <svg {...props}>
          <path d="M4 12h14" />
          <path d="m14 7 5 5-5 5" />
        </svg>
      );
    case "undo":
      return (
        <svg {...props}>
          <path d="M9 14 4 9l5-5" />
          <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H12" />
        </svg>
      );
    case "redo":
      return (
        <svg {...props}>
          <path d="m15 14 5-5-5-5" />
          <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H12" />
        </svg>
      );
    case "text":
      return (
        <svg {...props}>
          <path d="M5 6h14" />
          <path d="M12 6v12" />
          <path d="M9 18h6" />
        </svg>
      );
    case "trash":
      return (
        <svg {...props}>
          <path d="M4 7h16" />
          <path d="M9 7V5h6v2" />
          <path d="m18 7-1 13H7L6 7" />
        </svg>
      );
    case "grid":
      return (
        <svg {...props}>
          <rect x="4" y="4" width="6.5" height="6.5" rx="1" />
          <rect x="13.5" y="4" width="6.5" height="6.5" rx="1" />
          <rect x="4" y="13.5" width="6.5" height="6.5" rx="1" />
          <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1" />
        </svg>
      );
    case "zoom":
      return (
        <svg {...props}>
          <circle cx="10" cy="10" r="6.5" />
          <path d="m15 15 5 5" />
        </svg>
      );
    case "zoom-in":
      return (
        <svg {...props}>
          <circle cx="10" cy="10" r="6.5" />
          <path d="m15 15 5 5" />
          <path d="M10 7.5v5" />
          <path d="M7.5 10h5" />
        </svg>
      );
    case "zoom-out":
      return (
        <svg {...props}>
          <circle cx="10" cy="10" r="6.5" />
          <path d="m15 15 5 5" />
          <path d="M7.5 10h5" />
        </svg>
      );
  }
}
