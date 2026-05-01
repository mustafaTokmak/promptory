/**
 * Logo — the Promptory mark.
 * Rose rounded square, bold white "P" lettermark inside.
 * Matches the extension icon PNGs in public/icon/.
 *
 * This is the in-app React component. The toolbar/install icons live as PNGs
 * in public/icon/ so Chrome can render them without parsing our bundle.
 */
interface LogoProps {
  /** Square dimension in pixels. */
  size?: number;
  className?: string;
}

export function Logo({ size = 28, className = '' }: LogoProps) {
  return (
    <div
      aria-hidden="true"
      className={`flex flex-shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white font-bold select-none ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.62), lineHeight: 1 }}
    >
      P
    </div>
  );
}
