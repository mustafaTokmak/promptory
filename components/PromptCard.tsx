import { useState } from 'react';
import { Check, Copy, Star } from 'lucide-react';
import type { Prompt } from '../lib/types';
import { getPlatformInfo, formatTimestamp } from '../lib/platform';
import { toggleFavorite } from '../lib/storage';

interface PromptCardProps {
  prompt: Prompt;
  compact?: boolean;
  onUpdate?: () => void;
}

export function PromptCard({
  prompt,
  compact = false,
  onUpdate,
}: PromptCardProps) {
  const [copied, setCopied] = useState<'prompt' | 'response' | null>(null);
  const platform = getPlatformInfo(prompt.platform);

  // Word count — split on whitespace, ignore empty tokens
  const wordCount = prompt.promptText.trim().split(/\s+/).filter(Boolean).length;

  const copy = async (text: string, type: 'prompt' | 'response') => {
    await navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 1500);
  };

  const handleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await toggleFavorite(prompt.id);
    onUpdate?.();
  };

  return (
    // Rose Minimal card style: flat divider line, no box shadow
    <div className="border-b border-gray-100 py-3 transition-colors hover:bg-gray-50">
      {/* Header: platform chip · timestamp · word count · star */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span
            className="rounded-full px-2 py-0.5 text-xs font-medium"
            style={{ color: platform.color, backgroundColor: platform.bgColor }}
          >
            {platform.label}
          </span>
          <span className="text-xs text-gray-400">
            {formatTimestamp(prompt.timestamp)}
          </span>
          <span className="text-xs text-gray-300">·</span>
          <span className="text-xs text-gray-400">{wordCount}w</span>
        </div>
        <button
          onClick={handleFavorite}
          className="flex h-6 w-6 items-center justify-center rounded text-gray-300 transition-colors hover:text-amber-500"
          aria-label={
            prompt.isFavorite ? 'Remove from favorites' : 'Add to favorites'
          }
          title={prompt.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Star
            className={`h-4 w-4 ${prompt.isFavorite ? 'fill-amber-400 text-amber-400' : ''}`}
            strokeWidth={2}
          />
        </button>
      </div>

      {/* Prompt text */}
      <div className="mb-1.5">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Prompt
          </span>
          <CopyButton
            onCopy={() => copy(prompt.promptText, 'prompt')}
            copied={copied === 'prompt'}
          />
        </div>
        <p
          className={`text-sm text-gray-800 ${compact ? 'line-clamp-2' : 'line-clamp-4'}`}
        >
          {prompt.promptText}
        </p>
      </div>

      {/* Tag chips — max 3 shown to keep cards compact */}
      {prompt.tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {prompt.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500"
            >
              {tag}
            </span>
          ))}
          {prompt.tags.length > 3 && (
            <span className="text-xs text-gray-400">
              +{prompt.tags.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Response (expanded only) */}
      {!compact && (
        <div className="mt-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              Response
            </span>
            <CopyButton
              onCopy={() => copy(prompt.responseText, 'response')}
              copied={copied === 'response'}
            />
          </div>
          <p className="line-clamp-4 text-sm text-gray-600">
            {prompt.responseText}
          </p>
        </div>
      )}
    </div>
  );
}

function CopyButton({
  onCopy,
  copied,
}: {
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onCopy();
      }}
      className="flex items-center gap-1 rounded px-1 text-xs text-gray-400 transition-colors hover:text-gray-700"
      aria-label={copied ? 'Copied' : 'Copy'}
    >
      {copied ? (
        <>
          <Check className="h-3 w-3 text-emerald-500" />
          <span className="text-emerald-600">Copied</span>
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" />
          <span>Copy</span>
        </>
      )}
    </button>
  );
}
