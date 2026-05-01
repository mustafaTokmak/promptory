import { useEffect, useState, useCallback } from 'react';
import { Download, Trash2, Upload } from 'lucide-react';
import type { Prompt, Folder } from '../../lib/types';
import {
  getAllPrompts,
  searchPrompts,
  getPromptsByFolder,
  getPromptsByPlatform,
  getFavorites,
  getAllFolders,
  deletePrompts,
  deleteAllPrompts,
  moveToFolder,
  exportAll,
  exportAsCsv,
  importData,
  getPromptCount,
  getSettings,
  setConsent,
} from '../../lib/storage';
import { db } from '../../lib/db';
import { PromptCard } from '../../components/PromptCard';
import { SearchBar } from '../../components/SearchBar';
import { FolderSidebar, type FilterType } from '../../components/FolderSidebar';
import { getPlatformInfo } from '../../lib/platform';
import {
  Button,
  Dialog,
  Logo,
  PromptCardSkeleton,
  useToast,
} from '../../components/ui';

export default function App() {
  const { toast } = useToast();
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>({ kind: 'all' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);

  type DashboardTab = 'library' | 'community';
  const [activeTab, setActiveTab] = useState<DashboardTab>('library');
  const [consentGiven, setConsentGiven] = useState(false);
  const [consentModalOpen, setConsentModalOpen] = useState(false);

  const loadFolders = useCallback(async () => {
    setFolders(await getAllFolders());
  }, []);

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
        case 'folder':
          results = await getPromptsByFolder(filter.folderId);
          break;
        default:
          results = await getAllPrompts();
      }
    }

    setPrompts(results);
    setTotalCount(await getPromptCount());
    setLoading(false);
  }, [search, filter]);

  useEffect(() => {
    loadFolders();
    getSettings().then((s) => setConsentGiven(s.consentGiven));
  }, [loadFolders]);

  useEffect(() => {
    const timer = setTimeout(loadPrompts, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [loadPrompts, search]);

  // Live-update when captures happen in other tabs (user on dashboard,
  // chatting in ChatGPT tab should not require manual refresh). The write
  // happens in the background service worker, so we listen for the broadcast
  // message it sends after each save.
  useEffect(() => {
    const listener = (message: { type?: string }) => {
      if (message?.type === 'PROMPT_SAVED') loadPrompts();
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [loadPrompts]);

  // ── Bulk actions ──

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === prompts.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(prompts.map((p) => p.id)));
    }
  };

  const handleBulkDelete = async () => {
    const count = selected.size;
    if (count === 0) return;
    await deletePrompts([...selected]);
    setSelected(new Set());
    toast(`Deleted ${count} prompt${count === 1 ? '' : 's'}`, 'success');
  };

  const handleClearAll = async () => {
    const count = totalCount;
    await deleteAllPrompts();
    setSelected(new Set());
    await loadPrompts();
    toast(`Deleted ${count} prompts`, 'success');
  };

  const handleBulkMove = async (folderId: string | null, folderLabel: string) => {
    if (selected.size === 0) return;
    const count = selected.size;
    await moveToFolder([...selected], folderId);
    setSelected(new Set());
    toast(
      `Moved ${count} prompt${count === 1 ? '' : 's'} to ${folderLabel}`,
      'success',
    );
  };

  // ── Export / Import ──

  const handleExport = async () => {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `promptory-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast(`Exported ${data.prompts?.length ?? totalCount} prompts`, 'success');
  };

  const handleExportCsv = async () => {
    const csv = await exportAsCsv();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `promptory-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast(`Exported ${totalCount} prompts as CSV`, 'success');
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const count = await importData(data);
        toast(
          `Imported ${count} prompt${count === 1 ? '' : 's'}`,
          'success',
        );
        loadFolders();
      } catch (err) {
        console.warn('[Promptory] Import failed', err);
        toast('Import failed — invalid JSON file', 'error');
      }
    };
    input.click();
  };

  const handleAcceptConsent = async () => {
    await setConsent(true);
    setConsentGiven(true);
    setConsentModalOpen(false);
    setActiveTab('community');
  };

  const handleTabClick = (tab: DashboardTab) => {
    if (tab === 'community' && !consentGiven) {
      setConsentModalOpen(true);
      return;
    }
    setActiveTab(tab);
  };

  // Active filter label — used in empty-state copy + move-to toast
  const filterLabel = (() => {
    if (filter.kind === 'all') return null;
    if (filter.kind === 'favorites') return 'Favorites';
    if (filter.kind === 'platform')
      return getPlatformInfo(filter.platform).label;
    return folders.find((f) => f.id === filter.folderId)?.name ?? 'Folder';
  })();

  const allSelected =
    prompts.length > 0 && selected.size === prompts.length;

  return (
    <div className="flex h-screen flex-col bg-white">
      {/* Top bar */}
      <header className="flex flex-col border-b border-gray-200 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo size={32} />
            <h1 className="text-lg font-semibold text-gray-900">Promptory</h1>
            <span className="text-sm text-gray-400">
              {totalCount} prompt{totalCount === 1 ? '' : 's'} saved
            </span>
          </div>
          <div className="flex items-center gap-2">
            {totalCount > 0 && (
              <Button
                variant="ghost"
                size="md"
                onClick={() => setClearDialogOpen(true)}
                leadingIcon={<Trash2 className="h-4 w-4" />}
                className="text-red-600 hover:bg-red-50 hover:text-red-700"
                title="Delete all prompts"
              >
                Clear all
              </Button>
            )}
            <Button
              variant="secondary"
              size="md"
              onClick={handleImport}
              leadingIcon={<Upload className="h-4 w-4" />}
            >
              Import
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={handleExport}
              leadingIcon={<Download className="h-4 w-4" />}
            >
              Export JSON
            </Button>
            <Button
              variant="secondary"
              size="md"
              onClick={handleExportCsv}
            >
              Export CSV
            </Button>
          </div>
        </div>
        {/* Tab bar */}
        <div className="mt-3 flex gap-1 border-b border-gray-200">
          <button
            onClick={() => handleTabClick('library')}
            className={`px-4 pb-2 text-sm font-medium transition-colors ${
              activeTab === 'library'
                ? 'border-b-2 border-brand-600 text-brand-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            My Library
          </button>
          <button
            onClick={() => handleTabClick('community')}
            className={`flex items-center gap-1.5 px-4 pb-2 text-sm font-medium transition-colors ${
              activeTab === 'community'
                ? 'border-b-2 border-brand-600 text-brand-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Community
            <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-xs font-semibold text-brand-700">
              NEW
            </span>
          </button>
        </div>
      </header>

      {activeTab === 'library' ? (
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <FolderSidebar
          folders={folders}
          activeFilter={filter}
          onFilterChange={(f) => {
            setFilter(f);
            setSearch('');
            setSelected(new Set());
          }}
          onFoldersChanged={loadFolders}
        />

        {/* Main content */}
        <main className="flex flex-1 flex-col overflow-hidden">
          {/* Search + bulk actions bar */}
          <div className="flex items-center gap-4 border-b border-gray-100 px-6 py-3">
            <div className="max-w-md flex-1">
              <SearchBar value={search} onChange={setSearch} />
            </div>

            {selected.size > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">
                  {selected.size} selected
                </span>
                <select
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '') return;
                    const label =
                      val === 'unfiled'
                        ? 'Unfiled'
                        : folders.find((f) => f.id === val)?.name ?? 'Folder';
                    handleBulkMove(val === 'unfiled' ? null : val, label);
                    e.target.value = '';
                  }}
                  className="rounded-md border border-gray-200 bg-white px-2 py-1 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  defaultValue=""
                >
                  <option value="" disabled>
                    Move to…
                  </option>
                  <option value="unfiled">Unfiled</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setBulkDeleteDialogOpen(true)}
                  leadingIcon={<Trash2 className="h-3 w-3" />}
                >
                  Delete
                </Button>
              </div>
            )}

            {prompts.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={selectAll}
                className="ml-auto"
              >
                {allSelected ? 'Deselect all' : 'Select all'}
              </Button>
            )}
          </div>

          {/* Prompt list */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {loading ? (
              <div className="max-w-3xl space-y-3">
                <PromptCardSkeleton />
                <PromptCardSkeleton />
                <PromptCardSkeleton />
                <PromptCardSkeleton />
                <PromptCardSkeleton />
              </div>
            ) : prompts.length === 0 ? (
              <EmptyState search={search} filterLabel={filterLabel} />
            ) : (
              <div className="max-w-3xl space-y-3">
                {prompts.map((prompt) => (
                  <div key={prompt.id} className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selected.has(prompt.id)}
                      onChange={() => toggleSelect(prompt.id)}
                      aria-label={`Select prompt from ${getPlatformInfo(prompt.platform).label}`}
                      className="mt-4 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    />
                    <div className="flex-1">
                      <PromptCard prompt={prompt} onUpdate={loadPrompts} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
      ) : (
        <CommunityTab
          consentGiven={consentGiven}
          onOptOut={async () => {
            await setConsent(false);
            setConsentGiven(false);
            setActiveTab('library');
          }}
        />
      )}

      {/* Clear-all confirmation */}
      <Dialog
        open={clearDialogOpen}
        onClose={() => setClearDialogOpen(false)}
        title="Delete all prompts?"
        description={
          <>
            This permanently removes{' '}
            <strong className="text-gray-900">{totalCount}</strong> prompts
            from your device. Export first if you want a backup — this cannot
            be undone.
          </>
        }
        confirmLabel="Delete all"
        onConfirm={handleClearAll}
        variant="danger"
      />

      {/* Bulk-delete confirmation */}
      <Dialog
        open={bulkDeleteDialogOpen}
        onClose={() => setBulkDeleteDialogOpen(false)}
        title={`Delete ${selected.size} prompt${selected.size === 1 ? '' : 's'}?`}
        description="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={handleBulkDelete}
        variant="danger"
      />

      {/* Community consent modal */}
      <Dialog
        open={consentModalOpen}
        onClose={() => setConsentModalOpen(false)}
        title="Join the Community"
        description={
          <div className="space-y-3 text-sm text-gray-600">
            <p>
              Community Prompts lets you browse and reuse prompts shared by other
              Promptory users.
            </p>
            <p>
              To access this, we anonymize your saved prompts and include them in our
              shared dataset. Your personal information is never shared.
            </p>
            <a
              href="https://promptory.chat/privacy"
              target="_blank"
              rel="noreferrer"
              className="text-brand-600 underline hover:text-brand-700"
            >
              Read full policy
            </a>
          </div>
        }
        confirmLabel="Accept & Browse Community"
        onConfirm={handleAcceptConsent}
        variant="default"
      />
    </div>
  );
}

function EmptyState({
  search,
  filterLabel,
}: {
  search: string;
  filterLabel: string | null;
}) {
  let title: string;
  let body: string;

  if (search) {
    title = 'No prompts match your search';
    body = 'Try a different search term, or clear the filter on the left.';
  } else if (filterLabel) {
    title = `No prompts in ${filterLabel} yet`;
    body =
      'Prompts you capture that match this filter will show up here automatically.';
  } else {
    title = 'No prompts saved yet';
    body =
      'Start chatting with ChatGPT, Gemini, Claude, Perplexity, Grok, or Copilot — your prompts will be saved automatically.';
  }

  return (
    <div className="flex h-60 flex-col items-center justify-center px-4 text-center">
      <p className="mb-1 text-base text-gray-700">{title}</p>
      <p className="max-w-md text-sm text-gray-400">{body}</p>
    </div>
  );
}

function CommunityTab({
  consentGiven,
  onOptOut,
}: {
  consentGiven: boolean;
  onOptOut: () => void;
}) {
  if (!consentGiven) return null;

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 text-4xl">🌐</div>
      <h2 className="mb-2 text-lg font-semibold text-gray-900">You're in!</h2>
      <p className="max-w-sm text-sm text-gray-500">
        Community prompts are coming soon. You'll be among the first to see
        them when they launch.
      </p>
      <p className="mt-3 text-xs text-gray-400">
        Your anonymized prompts help build this library for everyone.
      </p>
      <button
        onClick={onOptOut}
        className="mt-6 text-xs text-gray-400 underline underline-offset-2 hover:text-gray-600 transition-colors"
      >
        Opt out &amp; stop sharing my prompts
      </button>
    </div>
  );
}
