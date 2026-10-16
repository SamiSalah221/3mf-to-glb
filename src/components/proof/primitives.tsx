import { useRef, type ReactNode } from 'react';
import { useAppStore } from '../../store/useAppStore';
import type { FilamentSlot } from '../../types';
import { STEPS, type Step } from './constants';

/**
 * The "Proof" look: the app reads as a print shop's proof sheet. A sheet is
 * a flat panel with a crop mark in each corner; labels are small mono caps.
 */

function CropMark({ corner, size }: { corner: 'tl' | 'tr' | 'bl' | 'br'; size: number }) {
  const pos = {
    tl: 'top-3 left-3 border-t-[1.5px] border-l-[1.5px]',
    tr: 'top-3 right-3 border-t-[1.5px] border-r-[1.5px]',
    bl: 'bottom-3 left-3 border-b-[1.5px] border-l-[1.5px]',
    br: 'bottom-3 right-3 border-b-[1.5px] border-r-[1.5px]',
  }[corner];
  return (
    <span
      aria-hidden="true"
      className={`absolute ${pos} border-tx pointer-events-none`}
      style={{ width: size, height: size }}
    />
  );
}

/** A proof sheet: panel with crop marks. `strong` gives it an ink border (the active proof). */
export function ProofSheet({
  children,
  className = '',
  strong = false,
  markSize = 18,
  label,
}: {
  children: ReactNode;
  className?: string;
  strong?: boolean;
  markSize?: number;
  label?: string;
}) {
  return (
    <section
      aria-label={label}
      className={`relative bg-panel border ${strong ? 'border-tx' : 'border-line'} ${className}`}
    >
      <CropMark corner="tl" size={markSize} />
      <CropMark corner="tr" size={markSize} />
      <CropMark corner="bl" size={markSize} />
      <CropMark corner="br" size={markSize} />
      {children}
    </section>
  );
}

/** Small mono caps label, the sheet's metadata voice. */
export function Caps({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`font-mono text-[11px] tracking-[0.08em] uppercase text-tx2 ${className}`}>{children}</span>
  );
}

/** The job ticket's section heading: caps over an ink rule. */
export function TicketHeading({ children }: { children: ReactNode }) {
  return (
    <div className="pb-2.5 border-b-[1.5px] border-tx">
      <Caps>{children}</Caps>
    </div>
  );
}

/** "1 OPEN ✓ · 2 COLOR · 3 PROOF · 4 SIGN OFF". Open is done once a file is loaded. */
export function StepNav({ step, onStep }: { step: Step; onStep: (s: Step) => void }) {
  const current = STEPS.findIndex((s) => s.id === step);
  return (
    <nav aria-label="Job steps" className="flex items-center gap-1 font-mono text-[12px]">
      <span className="px-3 py-2 text-tx3">1 OPEN ✓</span>
      {STEPS.map((s, i) => {
        const active = s.id === step;
        return (
          <button
            key={s.id}
            type="button"
            aria-current={active ? 'step' : undefined}
            onClick={() => onStep(s.id)}
            className={`px-3 py-2 uppercase transition-colors ${
              active ? 'bg-tx text-bg' : 'text-tx2 hover:text-tx hover:bg-panel3'
            }`}
          >
            {i + 2} {s.label}
            {i < current ? ' ✓' : ''}
          </button>
        );
      })}
    </nav>
  );
}

/** Readable text color for a label sitting on a filament swatch. */
function inkOn(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 150 ? '#0E0F12' : '#FFFFFF';
}

function patchBackground(f: FilamentSlot, filaments: FilamentSlot[]): string {
  if (!f.mix) return f.currentColor;
  const a = filaments.find((x) => x.index === f.mix!.sources[0])?.currentColor ?? f.currentColor;
  const b = filaments.find((x) => x.index === f.mix!.sources[1])?.currentColor ?? f.currentColor;
  return `linear-gradient(135deg, ${a} 0 50%, ${b} 50% 100%)`;
}

/**
 * The press control strip: one patch per filament on the plate. Clicking a
 * patch selects that zone (same as clicking it on the model).
 */
export function ColorBar({ height = 64, interactive = true }: { height?: number; interactive?: boolean }) {
  const parseResult = useAppStore((s) => s.parseResult);
  const currentPlateId = useAppStore((s) => s.currentPlateId);
  const filaments = useAppStore((s) => s.filaments);
  const selected = useAppStore((s) => s.selectedFilamentIndex);
  const selectFilament = useAppStore((s) => s.selectFilament);

  const plate = parseResult?.plates.find((p) => p.id === currentPlateId);
  const used = plate ? filaments.filter((f) => plate.filamentIndicesUsed.includes(f.index)) : [];
  if (!used.length) return null;

  return (
    <div
      role="group"
      aria-label="Color bar"
      className="grid border-[1.5px] border-tx"
      style={{ gridTemplateColumns: `repeat(${used.length}, minmax(0, 1fr))` }}
    >
      {used.map((f, i) => {
        const isSel = selected === f.index;
        const label = f.mix ? `M${f.index}` : `F${f.index}`;
        const style = { background: patchBackground(f, filaments), height, color: inkOn(f.currentColor) };
        const cls = `flex items-end p-2 font-mono text-[12px] ${i < used.length - 1 ? 'border-r-[1.5px] border-tx' : ''} ${
          isSel ? 'outline outline-[3px] outline-tx outline-offset-4 relative z-10 font-semibold' : ''
        }`;
        return interactive ? (
          <button
            key={f.index}
            type="button"
            aria-pressed={isSel}
            aria-label={`${f.mix ? 'Mix' : 'Filament'} ${f.index}, ${f.currentColor}`}
            onClick={() => selectFilament(isSel ? null : f.index)}
            className={`${cls} cursor-pointer`}
            style={style}
          >
            {label}
          </button>
        ) : (
          <div key={f.index} className={cls} style={style}>
            {label}
          </div>
        );
      })}
    </div>
  );
}

/** A button that opens a file picker. */
export function FilePickButton({
  accept,
  onPick,
  multiple = false,
  disabled = false,
  className,
  children,
}: {
  accept: string;
  onPick: (files: File[]) => void;
  multiple?: boolean;
  disabled?: boolean;
  className: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" disabled={disabled} onClick={() => ref.current?.click()} className={className}>
        {children}
      </button>
      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          if (files.length) onPick(files);
          e.target.value = '';
        }}
      />
    </>
  );
}
