import { PALETTE, cylinderCap, type Shape } from "@/components/diagram/model";

type ShapeViewProps = {
  shape: Shape;
  selected: boolean;
  hovered: boolean;
  listening: boolean;
  onPointerDown?: (event: React.PointerEvent<SVGGElement>) => void;
  onDoubleClick?: (event: React.MouseEvent<SVGGElement>) => void;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
};

export default function ShapeView({
  shape,
  selected,
  hovered,
  listening,
  onPointerDown,
  onDoubleClick,
  onPointerEnter,
  onPointerLeave,
}: ShapeViewProps) {
  const tone = PALETTE[shape.color];
  const strokeWidth = selected ? 2.4 : hovered ? 2 : 1.6;

  return (
    <g
      data-shape-id={shape.id}
      data-kind={shape.kind}
      pointerEvents={listening ? "auto" : "none"}
      style={{
        cursor: listening ? "grab" : "inherit",
        filter: shape.kind === "arrow" ? undefined : "drop-shadow(0 1px 1px rgb(0 0 0 / 0.16))",
      }}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      {selected && shape.kind === "arrow" ? (
        <line
          x1={shape.x}
          y1={shape.y}
          x2={shape.x + shape.w}
          y2={shape.y + shape.h}
          stroke={tone.stroke}
          strokeOpacity={0.35}
          strokeWidth={8}
          strokeLinecap="round"
          pointerEvents="none"
        />
      ) : null}
      <ShapeGraphic shape={shape} fill={tone.fill} stroke={tone.stroke} strokeWidth={strokeWidth} />
      {selected && shape.kind !== "arrow" ? (
        <rect
          x={shape.x - 5}
          y={shape.y - 5}
          width={shape.w + 10}
          height={shape.h + 10}
          fill="none"
          stroke={tone.stroke}
          strokeOpacity={0.55}
          strokeWidth={1}
          strokeDasharray="4 3"
          pointerEvents="none"
        />
      ) : null}
    </g>
  );
}

function ShapeGraphic({
  shape,
  fill,
  stroke,
  strokeWidth,
}: {
  shape: Shape;
  fill: string;
  stroke: string;
  strokeWidth: number;
}) {
  const { x, y, w, h, kind } = shape;

  if (kind === "rect") {
    return <rect x={x} y={y} width={w} height={h} rx={12} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
  }

  if (kind === "ellipse") {
    return (
      <ellipse
        cx={x + w / 2}
        cy={y + h / 2}
        rx={Math.max(w / 2, 1)}
        ry={Math.max(h / 2, 1)}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    );
  }

  if (kind === "diamond") {
    const points = `${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}`;
    return <polygon points={points} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
  }

  if (kind === "parallelogram") {
    const skew = Math.min(28, w * 0.18);
    const points = `${x + skew},${y} ${x + w},${y} ${x + w - skew},${y + h} ${x},${y + h}`;
    return <polygon points={points} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
  }

  if (kind === "cylinder") {
    const ry = cylinderCap(shape);
    const rx = w / 2;
    const top = y + ry;
    const bottom = y + h - ry;
    return (
      <>
        <path
          d={`M ${x} ${top} L ${x} ${bottom} A ${rx} ${ry} 0 0 0 ${x + w} ${bottom} L ${x + w} ${top} Z`}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
        <ellipse cx={x + rx} cy={top} rx={rx} ry={ry} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      </>
    );
  }

  if (kind === "note") {
    const fold = Math.min(22, w * 0.22, h * 0.28);
    return (
      <>
        <path
          d={`M ${x} ${y} H ${x + w - fold} L ${x + w} ${y + fold} V ${y + h} H ${x} Z`}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
        <path
          d={`M ${x + w - fold} ${y} V ${y + fold} H ${x + w}`}
          fill={stroke}
          fillOpacity={0.16}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      </>
    );
  }

  return (
    <>
      <line
        x1={x}
        y1={y}
        x2={x + w}
        y2={y + h}
        stroke="transparent"
        strokeWidth={16}
      />
      <line
        x1={x}
        y1={y}
        x2={x + w}
        y2={y + h}
        stroke={stroke}
        strokeWidth={2.25}
        strokeLinecap="round"
        markerEnd={`url(#diagram-arrow-${shape.color})`}
      />
    </>
  );
}
