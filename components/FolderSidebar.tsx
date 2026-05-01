import { useState } from 'react';
import {
  Folder as FolderIcon,
  FolderOpen,
  FolderPlus,
  Pencil,
  Star,
  Trash2,
  LayoutGrid,
} from 'lucide-react';
import type { Folder } from '../lib/types';
import type { AIPlatform } from '../lib/types';
import { createFolder, renameFolder, deleteFolder } from '../lib/storage';
import { getPlatformInfo } from '../lib/platform';

export type FilterType =
  | { kind: 'all' }
  | { kind: 'favorites' }
  | { kind: 'platform'; platform: AIPlatform }
  | { kind: 'folder'; folderId: string };

interface FolderSidebarProps {
  folders: Folder[];
  activeFilter: FilterType;
  onFilterChange: (filter: FilterType) => void;
  onFoldersChanged: () => void;
}

// Perplexity intentionally excluded — not currently captured.
const platforms: AIPlatform[] = ['chatgpt', 'gemini', 'claude', 'grok', 'copilot'];

export function FolderSidebar({
  folders,
  activeFilter,
  onFilterChange,
  onFoldersChanged,
}: FolderSidebarProps) {
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const handleCreate = async () => {
    if (!newFolderName.trim()) return;
    await createFolder(newFolderName.trim());
    setNewFolderName('');
    setIsCreating(false);
    onFoldersChanged();
  };

  const handleRename = async (id: string) => {
    if (!editName.trim()) return;
    await renameFolder(id, editName.trim());
    setEditingId(null);
    onFoldersChanged();
  };

  const handleDelete = async (id: string) => {
    await deleteFolder(id);
    if (activeFilter.kind === 'folder' && activeFilter.folderId === id) {
      onFilterChange({ kind: 'all' });
    }
    onFoldersChanged();
  };

  const isActive = (filter: FilterType) => {
    if (filter.kind !== activeFilter.kind) return false;
    if (filter.kind === 'platform' && activeFilter.kind === 'platform')
      return filter.platform === activeFilter.platform;
    if (filter.kind === 'folder' && activeFilter.kind === 'folder')
      return filter.folderId === activeFilter.folderId;
    return true;
  };

  const itemClass = (filter: FilterType) =>
    `flex items-center gap-2 px-3 py-1.5 rounded-md text-sm cursor-pointer transition-colors ${
      isActive(filter)
        ? 'bg-brand-50 text-brand-700 font-medium'
        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
    }`;

  return (
    <aside className="flex w-56 flex-col gap-4 overflow-y-auto border-r border-gray-200 p-4">
      {/* Library */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
          Library
        </h3>
        <div className="space-y-0.5">
          <div
            className={itemClass({ kind: 'all' })}
            onClick={() => onFilterChange({ kind: 'all' })}
          >
            <LayoutGrid className="h-4 w-4 flex-shrink-0" />
            <span>All Prompts</span>
          </div>
          <div
            className={itemClass({ kind: 'favorites' })}
            onClick={() => onFilterChange({ kind: 'favorites' })}
          >
            <Star className="h-4 w-4 flex-shrink-0" />
            <span>Favorites</span>
          </div>
        </div>
      </div>

      {/* Platforms */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
          Platforms
        </h3>
        <div className="space-y-0.5">
          {platforms.map((p) => {
            const info = getPlatformInfo(p);
            return (
              <div
                key={p}
                className={itemClass({ kind: 'platform', platform: p })}
                onClick={() => onFilterChange({ kind: 'platform', platform: p })}
              >
                <span
                  aria-hidden="true"
                  className="h-2 w-2 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: info.color }}
                />
                <span>{info.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Folders */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            Folders
          </h3>
          <button
            onClick={() => setIsCreating(true)}
            aria-label="New folder"
            title="New folder"
            className="flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-brand-600"
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </button>
        </div>

        {isCreating && (
          <div className="mb-2 flex gap-1">
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
                if (e.key === 'Escape') {
                  setIsCreating(false);
                  setNewFolderName('');
                }
              }}
              placeholder="Folder name"
              className="flex-1 rounded border border-gray-200 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              autoFocus
            />
            <button
              onClick={handleCreate}
              className="rounded bg-brand-600 px-2 py-1 text-xs font-medium text-white hover:bg-brand-700"
            >
              Add
            </button>
          </div>
        )}

        <div className="space-y-0.5">
          {folders.map((folder) => (
            <div key={folder.id} className="group flex items-center">
              {editingId === folder.id ? (
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRename(folder.id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  onBlur={() => setEditingId(null)}
                  className="flex-1 rounded border border-gray-200 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  autoFocus
                />
              ) : (
                <div
                  className={`flex-1 ${itemClass({ kind: 'folder', folderId: folder.id })}`}
                  onClick={() =>
                    onFilterChange({ kind: 'folder', folderId: folder.id })
                  }
                >
                  {isActive({ kind: 'folder', folderId: folder.id }) ? (
                    <FolderOpen className="h-4 w-4 flex-shrink-0" />
                  ) : (
                    <FolderIcon className="h-4 w-4 flex-shrink-0" />
                  )}
                  <span className="truncate">{folder.name}</span>
                </div>
              )}
              <div className="ml-1 hidden items-center gap-0.5 group-hover:flex">
                <button
                  onClick={() => {
                    setEditingId(folder.id);
                    setEditName(folder.name);
                  }}
                  aria-label={`Rename ${folder.name}`}
                  title="Rename"
                  className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  onClick={() => handleDelete(folder.id)}
                  aria-label={`Delete ${folder.name}`}
                  title="Delete"
                  className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
          {folders.length === 0 && !isCreating && (
            <p className="px-3 text-xs text-gray-400">No folders yet</p>
          )}
        </div>
      </div>
    </aside>
  );
}
