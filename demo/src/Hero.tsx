import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
} from "remotion";

export const FPS = 30;
export const WIDTH = 1280;
export const HEIGHT = 720;
export const DURATION_FRAMES = 300; // 10s

const COLORS = {
  bg: "#0F172A",
  bgAccent: "#1E293B",
  grid: "#1E293B",
  text: "#E2E8F0",
  muted: "#64748B",
  gray: "#94A3B8",
  zone1: "#34D399", // emerald
  zone2: "#F59E0B", // amber
  zone3: "#EF4444", // red
  zone4: "#8B5CF6", // violet
  zone5: "#38BDF8", // sky
  zone1New: "#EC4899", // picker-swap target (pink)
  accent: "#34D399",
};

// ---------- Subcomponents ----------

const DotGrid: React.FC = () => {
  const dots: React.ReactNode[] = [];
  const spacing = 32;
  for (let x = spacing / 2; x < WIDTH; x += spacing) {
    for (let y = spacing / 2; y < HEIGHT; y += spacing) {
      dots.push(
        <circle key={`${x}-${y}`} cx={x} cy={y} r={1} fill={COLORS.grid} />
      );
    }
  }
  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      style={{ position: "absolute", inset: 0 }}
    >
      {dots}
    </svg>
  );
};

interface FileCardProps {
  label: string;
  sublabel: string;
  color: string;
}

const FileCard: React.FC<FileCardProps> = ({ label, sublabel, color }) => {
  return (
    <div
      style={{
        width: 220,
        height: 160,
        borderRadius: 18,
        background: "linear-gradient(180deg, #1E293B 0%, #0F172A 100%)",
        border: `2px solid ${color}`,
        boxShadow: `0 12px 48px rgba(0,0,0,0.5), 0 0 32px ${color}33`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 20,
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif",
      }}
    >
      <div
        style={{
          fontSize: 48,
          fontWeight: 700,
          letterSpacing: -1,
          color,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 16,
          color: COLORS.muted,
          fontFamily: "ui-monospace, 'Menlo', monospace",
        }}
      >
        {sublabel}
      </div>
    </div>
  );
};

interface LayerBarProps {
  width: number;
  height: number;
  color: string;
  revealProgress: number; // 0..1
  colorProgress: number; // 0..1 (gray → color)
}

const LayerBar: React.FC<LayerBarProps> = ({
  width,
  height,
  color,
  revealProgress,
  colorProgress,
}) => {
  const revealW = Math.max(0, width * revealProgress);
  const displayColor = colorProgress <= 0 ? COLORS.gray : color;
  const opacity = interpolate(colorProgress, [0, 1], [0.95, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 4,
        background: COLORS.bgAccent,
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        style={{
          width: revealW,
          height: "100%",
          background: displayColor,
          opacity,
          transition: "none",
        }}
      />
    </div>
  );
};

// A stylized "3D print" built from horizontal layer bars.
interface ModelProps {
  layerProgress: number; // 0..1, controls how many layers have appeared
  colorTimings: number[]; // 0..1 per layer, controls gray→color fade
  swappedLayerIndex: number | null; // which layer uses its swapped color
  swapProgress: number; // 0..1 for the swap transition
}

const PrintedModel: React.FC<ModelProps> = ({
  layerProgress,
  colorTimings,
  swappedLayerIndex,
  swapProgress,
}) => {
  // Model silhouette: narrow at top, wider in middle, tapers at base.
  // widths are ratios from 0..1 (of a base width).
  const widths = [
    0.55, 0.7, 0.82, 0.92, 0.98, 1.0, 0.98, 0.92, 0.82, 0.7, 0.55,
  ];
  const baseWidth = 360;
  const layerH = 20;
  const gap = 3;
  const n = widths.length;
  const revealWindow = 0.18;
  const maxAppearAt = 1 - revealWindow;
  const colorSlots = [
    COLORS.zone1,
    COLORS.zone2,
    COLORS.zone3,
    COLORS.zone4,
    COLORS.zone5,
    COLORS.zone1,
    COLORS.zone2,
    COLORS.zone3,
    COLORS.zone4,
    COLORS.zone5,
    COLORS.zone1,
  ];
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap,
      }}
    >
      {widths.map((w, i) => {
        const appearAt = (i / (n - 1)) * maxAppearAt;
        const revealProgress = interpolate(
          layerProgress,
          [appearAt, appearAt + revealWindow],
          [0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        );
        let color = colorSlots[i];
        let cProgress = colorTimings[i] ?? 0;
        if (swappedLayerIndex === i && swapProgress > 0) {
          // Cross-fade to the new (pink) color
          color =
            swapProgress < 0.5
              ? colorSlots[i]
              : mixHex(colorSlots[i], COLORS.zone1New, (swapProgress - 0.5) * 2);
          cProgress = 1;
        }
        return (
          <LayerBar
            key={i}
            width={baseWidth * w}
            height={layerH}
            color={color}
            revealProgress={revealProgress}
            colorProgress={cProgress}
          />
        );
      })}
    </div>
  );
};

function mixHex(a: string, b: string, t: number): string {
  const ah = parseInt(a.slice(1), 16);
  const bh = parseInt(b.slice(1), 16);
  const ar = (ah >> 16) & 0xff;
  const ag = (ah >> 8) & 0xff;
  const ab = ah & 0xff;
  const br = (bh >> 16) & 0xff;
  const bg = (bh >> 8) & 0xff;
  const bb = bh & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
}

interface ColorPickerProps {
  visibleProgress: number; // 0..1
  selectedColor: string;
}

const ColorPickerUI: React.FC<ColorPickerProps> = ({
  visibleProgress,
  selectedColor,
}) => {
  const translateX = interpolate(visibleProgress, [0, 1], [80, 0]);
  const opacity = interpolate(visibleProgress, [0, 1], [0, 1]);
  return (
    <div
      style={{
        transform: `translateX(${translateX}px)`,
        opacity,
        width: 240,
        borderRadius: 16,
        background: "#0F172A",
        border: `1px solid ${COLORS.bgAccent}`,
        boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        padding: 20,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif",
      }}
    >
      <div
        style={{
          fontSize: 13,
          color: COLORS.muted,
          letterSpacing: 1,
          textTransform: "uppercase",
        }}
      >
        Zone 1
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: selectedColor,
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        />
        <div
          style={{
            fontFamily: "ui-monospace, 'Menlo', monospace",
            fontSize: 16,
            color: COLORS.text,
          }}
        >
          {selectedColor.toUpperCase()}
        </div>
      </div>
      <div
        style={{
          height: 110,
          borderRadius: 10,
          background: `linear-gradient(180deg, ${selectedColor} 0%, #000 100%)`,
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "70%",
            top: "30%",
            width: 14,
            height: 14,
            borderRadius: "50%",
            border: "2px solid white",
            boxShadow: "0 0 0 1px rgba(0,0,0,0.3)",
          }}
        />
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {[
          COLORS.zone1,
          COLORS.zone2,
          COLORS.zone3,
          COLORS.zone4,
          COLORS.zone5,
          COLORS.zone1New,
        ].map((c) => (
          <div
            key={c}
            style={{
              flex: 1,
              height: 18,
              borderRadius: 4,
              background: c,
              outline:
                c === selectedColor ? `2px solid ${COLORS.text}` : "none",
              outlineOffset: 2,
            }}
          />
        ))}
      </div>
    </div>
  );
};

interface CursorProps {
  x: number;
  y: number;
  opacity: number;
}

const Cursor: React.FC<CursorProps> = ({ x, y, opacity }) => {
  return (
    <svg
      width={28}
      height={28}
      viewBox="0 0 28 28"
      style={{
        position: "absolute",
        left: x,
        top: y,
        opacity,
        filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.6))",
      }}
    >
      <path
        d="M 4 3 L 4 22 L 10 17 L 13.5 24 L 16.5 22.5 L 13 15.5 L 21 15.5 Z"
        fill="white"
        stroke="black"
        strokeWidth={1}
      />
    </svg>
  );
};

// ---------- Main Composition ----------

export const Hero: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // --- Scene timings (frames) ---
  const SCENE = {
    fileDropStart: 0,
    fileDropEnd: 40,
    layersStart: 40,
    layersEnd: 90,
    colorsStart: 80,
    colorsEnd: 140,
    pickerStart: 140,
    pickerSwapMid: 175,
    pickerSwapEnd: 200,
    glbStart: 210,
    glbArrowStart: 235,
    glbArrowEnd: 265,
    captionStart: 255,
    glbEnd: 300,
  };

  // 1. File card drop-in
  const fileDropProgress = spring({
    frame: frame - SCENE.fileDropStart,
    fps,
    config: { damping: 14, stiffness: 120 },
  });
  const fileY = interpolate(fileDropProgress, [0, 1], [-200, 0]);
  const fileOpacity = interpolate(fileDropProgress, [0, 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // File exits to fly toward the model as a hint
  const fileExitProgress = interpolate(
    frame,
    [SCENE.layersStart - 8, SCENE.layersStart + 12],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const fileExitX = interpolate(fileExitProgress, [0, 1], [0, 300]);
  const fileExitScale = interpolate(fileExitProgress, [0, 1], [1, 0.2]);
  const fileExitOpacity = interpolate(fileExitProgress, [0, 1], [1, 0]);

  // 2. Model layers reveal (gray first)
  const layerProgress = interpolate(
    frame,
    [SCENE.layersStart, SCENE.layersEnd],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // 3. Per-layer color-in timings (staggered)
  const layerCount = 11;
  const colorTimings: number[] = [];
  const colorSceneLen = SCENE.colorsEnd - SCENE.colorsStart;
  const colorFadeLen = 10;
  for (let i = 0; i < layerCount; i++) {
    const t0 =
      SCENE.colorsStart +
      (i / (layerCount - 1)) * (colorSceneLen - colorFadeLen);
    const t1 = t0 + colorFadeLen;
    colorTimings.push(
      interpolate(frame, [t0, t1], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    );
  }

  // 4. Color picker reveal + swap
  const pickerVisible = spring({
    frame: frame - SCENE.pickerStart,
    fps,
    config: { damping: 14, stiffness: 110 },
  });

  // Swap happens mid-way through picker scene. Layer 0 (top) swaps from emerald to pink.
  const swapProgress = interpolate(
    frame,
    [SCENE.pickerSwapMid, SCENE.pickerSwapEnd],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const swappedLayerIndex = 0;
  const selectedColor =
    swapProgress < 0.5 ? COLORS.zone1 : COLORS.zone1New;

  // Cursor animation: moves from picker color swatch to selected layer
  const cursorProgress = interpolate(
    frame,
    [SCENE.pickerStart + 10, SCENE.pickerSwapMid],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const cursorFadeOut = interpolate(
    frame,
    [SCENE.pickerSwapEnd - 8, SCENE.pickerSwapEnd + 2],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const cursorX = interpolate(
    cursorProgress,
    [0, 0.5, 1],
    [WIDTH - 220, WIDTH - 240, WIDTH / 2 + 200]
  );
  const cursorY = interpolate(
    cursorProgress,
    [0, 0.5, 1],
    [HEIGHT / 2 + 80, HEIGHT / 2 + 80, HEIGHT / 2 - 150]
  );
  const cursorOpacity =
    cursorFadeOut *
    interpolate(
      frame,
      [SCENE.pickerStart + 4, SCENE.pickerStart + 14],
      [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
    );

  // 5. GLB file export
  const glbDrop = spring({
    frame: frame - SCENE.glbStart,
    fps,
    config: { damping: 14, stiffness: 120 },
  });
  const glbX = interpolate(glbDrop, [0, 1], [-300, 0]);
  const glbOpacity = interpolate(glbDrop, [0, 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Arrow → GLB
  const arrowProgress = interpolate(
    frame,
    [SCENE.glbArrowStart, SCENE.glbArrowEnd],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Headline typography appears from the start, subtle fade
  const titleOpacity = interpolate(frame, [6, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg, overflow: "hidden" }}>
      <DotGrid />

      {/* Title in top-left */}
      <div
        style={{
          position: "absolute",
          top: 48,
          left: 64,
          opacity: titleOpacity,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif",
        }}
      >
        <div
          style={{
            fontSize: 32,
            fontWeight: 700,
            color: COLORS.text,
            letterSpacing: -0.5,
          }}
        >
          3MF Color Customizer
        </div>
        <div
          style={{
            fontSize: 16,
            color: COLORS.muted,
            marginTop: 6,
          }}
        >
          Multi-color 3MF → GLB · in your browser
        </div>
      </div>

      {/* LEFT: 3MF file card that drops in then flies toward model */}
      <Sequence from={SCENE.fileDropStart} durationInFrames={SCENE.layersStart + 20}>
        <div
          style={{
            position: "absolute",
            left: 120,
            top: HEIGHT / 2 - 80,
            transform: `translate(${fileExitX}px, ${fileY}px) scale(${fileExitScale})`,
            opacity: fileOpacity * fileExitOpacity,
          }}
        >
          <FileCard label=".3MF" sublabel="watchful_owl" color={COLORS.zone1} />
        </div>
      </Sequence>

      {/* CENTER: 3D-printed model */}
      <div
        style={{
          position: "absolute",
          left: WIDTH / 2 - 180,
          top: HEIGHT / 2 - 140,
        }}
      >
        <PrintedModel
          layerProgress={layerProgress}
          colorTimings={colorTimings}
          swappedLayerIndex={swapProgress > 0 ? swappedLayerIndex : null}
          swapProgress={swapProgress}
        />
      </div>

      {/* Label under model */}
      {frame >= SCENE.layersStart + 10 && (
        <div
          style={{
            position: "absolute",
            top: HEIGHT / 2 + 160,
            left: 0,
            right: 0,
            textAlign: "center",
            fontFamily: "ui-monospace, 'Menlo', monospace",
            fontSize: 14,
            color: COLORS.muted,
            letterSpacing: 1,
            opacity: interpolate(
              frame,
              [SCENE.layersStart + 10, SCENE.layersStart + 25],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            ),
          }}
        >
          parse · decode paint_color · clip Z-zones
        </div>
      )}

      {/* RIGHT: Color picker panel */}
      <Sequence from={SCENE.pickerStart} durationInFrames={SCENE.glbEnd - SCENE.pickerStart}>
        <div
          style={{
            position: "absolute",
            right: 120,
            top: HEIGHT / 2 - 130,
          }}
        >
          <ColorPickerUI
            visibleProgress={Math.max(0, Math.min(1, pickerVisible))}
            selectedColor={selectedColor}
          />
        </div>

        <Cursor x={cursorX} y={cursorY} opacity={cursorOpacity} />
      </Sequence>

      {/* GLB export card */}
      <Sequence from={SCENE.glbStart} durationInFrames={SCENE.glbEnd - SCENE.glbStart + 10}>
        <div
          style={{
            position: "absolute",
            left: 120,
            top: HEIGHT / 2 - 80,
            transform: `translateX(${glbX}px)`,
            opacity: glbOpacity,
          }}
        >
          <FileCard label=".GLB" sublabel="download" color={COLORS.zone3} />
        </div>

        {/* Animated arrow from model → GLB */}
        <svg
          width={WIDTH}
          height={HEIGHT}
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        >
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="10"
              refX="8"
              refY="5"
              orient="auto"
            >
              <polygon points="0 0, 10 5, 0 10" fill={COLORS.zone3} />
            </marker>
          </defs>
          <line
            x1={WIDTH / 2 - 120}
            y1={HEIGHT / 2}
            x2={WIDTH / 2 - 120 - (WIDTH / 2 - 120 - 350) * arrowProgress}
            y2={HEIGHT / 2}
            stroke={COLORS.zone3}
            strokeWidth={3}
            strokeDasharray="8 6"
            markerEnd={arrowProgress > 0.1 ? "url(#arrowhead)" : undefined}
            opacity={interpolate(arrowProgress, [0, 0.2], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })}
          />
        </svg>
      </Sequence>

      {/* Bottom caption that fades in at the end */}
      <div
        style={{
          position: "absolute",
          bottom: 48,
          left: 0,
          right: 0,
          textAlign: "center",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif",
          fontSize: 18,
          color: COLORS.accent,
          fontWeight: 500,
          opacity: interpolate(
            frame,
            [SCENE.captionStart, SCENE.captionStart + 20],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          ),
        }}
      >
        100% client-side · no uploads · MIT
      </div>
    </AbsoluteFill>
  );
};
