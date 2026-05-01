import Dexie, { type EntityTable } from 'dexie';
import type { Prompt, Folder, Settings } from './types';

const db = new Dexie('PromptoryDB') as Dexie & {
  prompts: EntityTable<Prompt, 'id'>;
  folders: EntityTable<Folder, 'id'>;
  settings: EntityTable<Settings, 'id'>;
};

db.version(1).stores({
  prompts: 'id, threadId, platform, timestamp, folderId, isFavorite, *tags',
  folders: 'id, parentId, order',
});

// Version 2: add settings table
db.version(2).stores({
  prompts: 'id, threadId, platform, timestamp, folderId, isFavorite, *tags',
  folders: 'id, parentId, order',
  settings: 'id',
});

export { db };
