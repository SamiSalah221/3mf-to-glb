import { ResetIcon } from './Icon';

/** Shared "reset all colors" affordance for the desktop panel and mobile plate selector. */
export function ResetButton({
  onClick,
  variant = 'text',
}: {
  onClick: () => void;
  /** `text`: inline link-style (desktop header). `block`: full-width bordered button (mobile footer). */
  variant?: 'text' | 'block';
}) {
  if (variant === 'block') {
    return (
      <button
        onClick={onClick}
        className="w-full h-10 flex items-center justify-center gap-1.5 rounded-md border border-line hover:border-line2 hover:bg-panel3 text-tx2 hover:text-tx text-xs transition-colors active:scale-[0.98]"
      >
        <ResetIcon size={12} /> Reset all colors
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 text-tx2 hover:text-tx text-[11px] transition-colors"
    >
      <ResetIcon size={11} /> Reset all
    </button>
  );
}
