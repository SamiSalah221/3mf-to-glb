type IconProps = {
  className?: string;
  size?: number;
};

const BASE = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true as const,
};

/** Reset / relink affordance. Replaces the old "↺" text glyph. */
export function ResetIcon({ className, size = 13 }: IconProps) {
  return (
    <svg width={size} height={size} className={className} {...BASE}>
      <path d="M3 12a9 9 0 1 0 2.6-6.3" />
      <path d="M3 4.5V9h4.5" />
    </svg>
  );
}

/** Success confirmation. Replaces the old "✓" text glyph. */
export function CheckIcon({ className, size = 13 }: IconProps) {
  return (
    <svg width={size} height={size} className={className} {...BASE}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
