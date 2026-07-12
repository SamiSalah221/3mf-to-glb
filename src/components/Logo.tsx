/**
 * Printproof mark: a Rub el Hizb (8-pointed Islamic star, two overlapping
 * squares) drawn as a nested double outline. Stroke is `currentColor`, so the
 * mark follows the surrounding text color / accent and recolors for free with
 * any theme swap. Size and color it from the caller with utility classes
 * (e.g. `className="w-7 h-7 text-tx"`).
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinejoin="round"
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M 12 2 L 14.93 4.93 L 19.07 4.93 L 19.07 9.07 L 22 12 L 19.07 14.93 L 19.07 19.07 L 14.93 19.07 L 12 22 L 9.07 19.07 L 4.93 19.07 L 4.93 14.93 L 2 12 L 4.93 9.07 L 4.93 4.93 L 9.07 4.93 Z" />
      <path d="M 12 5 L 14.05 7.05 L 16.95 7.05 L 16.95 9.95 L 19 12 L 16.95 14.05 L 16.95 16.95 L 14.05 16.95 L 12 19 L 9.95 16.95 L 7.05 16.95 L 7.05 14.05 L 5 12 L 7.05 9.95 L 7.05 7.05 L 9.95 7.05 Z" />
    </svg>
  );
}
