import { Loader2 } from 'lucide-react';

/**
 * Spinner — inline loading indicator. Brand-colored.
 * For full-panel loading use <PromptCardSkeleton> instead — it's less jarring.
 */
interface SpinnerProps {
  className?: string;
  /** Pixel size. Falls back to className when unset. */
  size?: number;
}

export function Spinner({ className = 'h-4 w-4', size }: SpinnerProps) {
  return (
    <Loader2
      aria-hidden="true"
      size={size}
      className={`animate-spin text-brand-600 ${size ? '' : className}`}
    />
  );
}
