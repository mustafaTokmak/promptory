import { useEffect, useState, useCallback } from 'react';
import { Clipboard, LayoutDashboard, Star, Trash2 } from 'lucide-react';
import type { Prompt, AIPlatform } from '../../lib/types';
import {
  getRecentPrompts,
  searchPrompts,
  getFavorites,
  getPromptsByPlatform,
  getPromptCount,
  deleteAllPrompts,
  getSettings,
  markReviewPromptShown,
} from '../../lib/storage';
import { db } from '../../lib/db';
import { PromptCard } from '../../components/PromptCard';
import { SearchBar } from '../../components/SearchBar';
import {
  Button,
  Dialog,
  Logo,
  PromptCardSkeleton,
  useToast,
} from '../../components/ui';
import { getPlatformInfo } from '../../lib/platform';

type FilterType =
  | { kind: 'recent' }
  | { kind: 'favorites' }
  | { kind: 'platform'; platform: AIPlatform };

const platformChips: AIPlatform[] = [
  'chatgpt',
  'gemini',
  'claude',
  'perplexity',
  'grok',
  'copilot',
];

export default function App() {
  const { toast } = useToast();
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>({ kind: 'recent' });
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [showReviewBanner, setShowReviewBanner] = useState(false);

  const loadPrompts = useCallback(async () => {
    setLoading(true);
    let results: Prompt[];

    if (search.trim()) {
      results = await searchPrompts(search);
    } else {
      switch (filter.kind) {
        case 'favorites':
          results = await getFavorites();
          break;
        case 'platform':
          results = await getPromptsByPlatform(filter.platform);
          break;
        default:
          results = await getRecentPrompts(100);
      }
    }

    setPrompts(results);
    setTotalCount(await getPromptCount());
    setLoading(false);
  }, [search, filter]);

  useEffect(() => {
    const timer = setTimeout(loadPrompts, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [loadPrompts, search]);

  const checkReviewPrompt = useCallback(async () => {
    const [count, settings] = await Promise.all([
      getPromptCount(),
      getSettings(),
    ]);
    if (count >= 10 && !settings.reviewPromptShown) {
      setShowReviewBanner(true);
    }
  }, []);

  useEffect(() => {
    checkReviewPrompt();
  }, [checkReviewPrompt]);

  useEffect(() => {
    const handleMessage = (message: { type: string }) => {
      if (message.type === 'SHOW_REVIEW_PROMPT') {
        checkReviewPrompt();
      } else if (message.type === 'PROMPT_SAVED') {
        // Live-update: refresh whenever the background saves a new prompt.
        // Dexie hooks don't fire across contexts, so this is the bridge.
        loadPrompts();
      }
    };
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [checkReviewPrompt, loadPrompts]);

  const openDashboard = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('/dashboard.html') });
  };

  const handleClearAll = async () => {
    await deleteAllPrompts();
    toast(`Deleted ${totalCount} prompts`, 'success');
  };

  const handleDismissReview = async () => {
    await markReviewPromptShown();
    setShowReviewBanner(false);
  };

  // Paste prompt text into the active AI tool's input field.
  const pasteIntoActive = async (text: string) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      toast('No active tab found', 'error');
      return;
    }

    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (t: string) => {
          const input =
            document.querySelector<HTMLTextAreaElement | HTMLElement>(
              'textarea, [contenteditable="true"]',
            );
          if (!input) return false;

          if (input instanceof HTMLTextAreaElement) {
            input.value = t;
            input.dispatchEvent(new Event('input', { bubbles: true }));
          } else {
            input.textContent = t;
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
          input.focus();
          return true;
        },
        args: [text],
      });

      if (result?.result) {
        toast('Pasted into active page', 'success');
      } else {
        toast('No input field found on this page', 'error');
      }
    } catch (err) {
      console.warn('[Promptory] Paste failed', err);
      toast('Paste failed — open an AI tool first', 'error');
    }
  };

  const chipClass = (active: boolean, bg?: string) =>
    `text-xs px-2.5 py-1 rounded-full font-medium transition-colors whitespace-nowrap ${
      active
        ? bg
          ? 'text-white'
          : 'bg-brand-600 text-white'
        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
    }`;

  return (
    <div className="flex h-screen flex-col bg-white">
      {/* Header */}
      <header className="border-b border-gray-200 px-3 py-2">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Logo size={24} />
            <h1 className="text-sm font-semibold text-gray-900">Promptory</h1>
            {totalCount > 0 && (
              <span className="text-xs text-gray-400">{totalCount}</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {totalCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setClearDialogOpen(true)}
                leadingIcon={<Trash2 className="h-3 w-3" />}
                title="Clear all prompts"
              >
                Clear
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={openDashboard}
              leadingIcon={<LayoutDashboard className="h-3 w-3" />}
              className="text-brand-600 hover:bg-brand-50 hover:text-brand-700"
              title="Open full library"
            >
              Library
            </Button>
          </div>
        </div>

        <SearchBar value={search} onChange={setSearch} />

        {/* Filter chips */}
        <div className="mt-2 flex items-center gap-1 overflow-x-auto pb-1">
          <button
            onClick={() => setFilter({ kind: 'recent' })}
            className={chipClass(filter.kind === 'recent')}
          >
            Recent
          </button>
          <button
            onClick={() => setFilter({ kind: 'favorites' })}
            className={chipClass(filter.kind === 'favorites')}
          >
            Favorites
          </button>
          {platformChips.map((p) => {
            const info = getPlatformInfo(p);
            const active = filter.kind === 'platform' && filter.platform === p;
            return (
              <button
                key={p}
                onClick={() => setFilter({ kind: 'platform', platform: p })}
                className={chipClass(active, info.color)}
                style={
                  active
                    ? { backgroundColor: info.color, color: 'white' }
                    : undefined
                }
              >
                {info.label}
              </button>
            );
          })}
        </div>
      </header>

      {showReviewBanner && (
        <div className="mx-3 mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-xs font-medium text-amber-800">
            ⚡ You've saved 10 prompts!
          </p>
          <p className="mt-0.5 text-xs text-amber-700">
            Enjoying Promptory? A quick review helps a lot.
          </p>
          <div className="mt-2 flex gap-2">
            <a
              href="https://chromewebstore.google.com/detail/hbaodafglfcggljhdefilahgcpipcckg/reviews"
              target="_blank"
              rel="noreferrer"
              onClick={handleDismissReview}
              className="flex items-center gap-1 rounded bg-amber-500 px-2 py-1 text-xs font-medium text-white hover:bg-amber-600"
            >
              <Star className="h-3 w-3" />
              Leave a review
            </a>
            <button
              onClick={handleDismissReview}
              className="text-xs text-amber-600 hover:text-amber-800"
            >
              Maybe later
            </button>
          </div>
        </div>
      )}

      {/* Prompt list */}
      <div className="flex-1 overflow-y-auto px-3 pt-1 pb-2">
        {loading ? (
          <>
            <PromptCardSkeleton />
            <PromptCardSkeleton />
            <PromptCardSkeleton />
          </>
        ) : prompts.length === 0 ? (
          <EmptyState search={search} filter={filter} />
        ) : (
          prompts.map((prompt) => (
            <div
              key={prompt.id}
              className="group relative"
              onClick={() =>
                setExpandedId(expandedId === prompt.id ? null : prompt.id)
              }
            >
              <PromptCard
                prompt={prompt}
                compact={expandedId !== prompt.id}
                onUpdate={loadPrompts}
              />
              {/* Paste button — appears on hover */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  pasteIntoActive(prompt.promptText);
                }}
                aria-label="Paste into active page"
                title="Paste into active AI tool"
                className="absolute right-10 top-3 flex items-center gap-1 rounded border border-gray-200 bg-white px-1.5 py-0.5 text-xs text-gray-500 opacity-0 transition-opacity hover:text-brand-600 group-hover:opacity-100"
              >
                <Clipboard className="h-3 w-3" />
                Paste
              </button>
            </div>
          ))
        )}
      </div>

      <Dialog
        open={clearDialogOpen}
        onClose={() => setClearDialogOpen(false)}
        title="Delete all prompts?"
        description={
          <>
            This permanently removes{' '}
            <strong className="text-gray-900">{totalCount}</strong> prompts from
            your device. This action cannot be undone.
          </>
        }
        confirmLabel="Delete all"
        onConfirm={handleClearAll}
        variant="danger"
      />
    </div>
  );
}

function EmptyState({
  search,
  filter,
}: {
  search: string;
  filter: FilterType;
}) {
  let title: string;
  if (search) {
    title = 'No prompts match your search';
  } else if (filter.kind === 'favorites') {
    title = 'No favorites yet';
  } else if (filter.kind === 'platform') {
    title = `No ${getPlatformInfo(filter.platform).label} prompts yet`;
  } else {
    title = 'No prompts saved yet';
  }

  return (
    <div className="flex h-60 flex-col items-center justify-center px-4 text-center">
      <p className="mb-1 text-sm text-gray-700">{title}</p>
      <p className="text-xs text-gray-400">
        Start chatting with any AI tool and your prompts will appear here.
      </p>
    </div>
  );
}
