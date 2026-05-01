/**
 * Skeleton — animated placeholder for loading states.
 * Replaces the "Loading..." text that was making the UI feel sluggish.
 */
interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded bg-gray-200 ${className}`}
    />
  );
}

/** Preset — matches the shape of a collapsed PromptCard in the side panel. */
export function PromptCardSkeleton() {
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-3 w-12" />
      </div>
      <Skeleton className="mb-1 h-3 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}
