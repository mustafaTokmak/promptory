import { db } from './db';
import type { Prompt, Folder, ExportData, Settings } from './types';

// ── Prompts ──────────────────────────────────────────────

const DEDUP_WINDOW_MS = 60_000; // 1 minute — prevents duplicates from selector glitches

/**
 * Adds a prompt, but skips if an identical prompt was saved in the last minute.
 * Returns the ID of the saved prompt, or null if deduped.
 */
export async function addPrompt(
  prompt: Omit<Prompt, 'id' | 'timestamp' | 'tags' | 'folderId' | 'isFavorite'>,
): Promise<string | null> {
  // Content-based dedup — defense against broad selectors matching the same
  // message multiple times during a streaming response.
  const now = Date.now();
  const recent = await db.prompts
    .where('timestamp')
    .above(now - DEDUP_WINDOW_MS)
    .toArray();

  const promptKey = prompt.promptText.slice(0, 200);
  const responseKey = prompt.responseText.slice(0, 200);

  const duplicate = recent.find(
    (p) =>
      p.platform === prompt.platform &&
      p.promptText.slice(0, 200) === promptKey &&
      p.responseText.slice(0, 200) === responseKey,
  );

  if (duplicate) {
    console.log('[Promptory] Skipping duplicate of', duplicate.id);
    return null;
  }

  const id = crypto.randomUUID();
  await db.prompts.add({
    ...prompt,
    id,
    timestamp: now,
    tags: [],
    folderId: null,
    isFavorite: false,
  });
  return id;
}

/** Delete every prompt — used by the "Clear All" button. */
export async function deleteAllPrompts(): Promise<void> {
  await db.prompts.clear();
}

export async function getRecentPrompts(limit = 20): Promise<Prompt[]> {
  return db.prompts.orderBy('timestamp').reverse().limit(limit).toArray();
}

export async function searchPrompts(query: string): Promise<Prompt[]> {
  const lower = query.toLowerCase();
  return db.prompts
    .filter(
      (p) =>
        p.promptText.toLowerCase().includes(lower) ||
        p.responseText.toLowerCase().includes(lower),
    )
    .toArray();
}

export async function getPromptsByFolder(folderId: string): Promise<Prompt[]> {
  return db.prompts
    .where('folderId')
    .equals(folderId)
    .reverse()
    .sortBy('timestamp');
}

export async function getPromptsByPlatform(
  platform: Prompt['platform'],
): Promise<Prompt[]> {
  return db.prompts
    .where('platform')
    .equals(platform)
    .reverse()
    .sortBy('timestamp');
}

export async function getFavorites(): Promise<Prompt[]> {
  return db.prompts
    .where('isFavorite')
    .equals(1) // Dexie stores booleans as 0/1 in indexes
    .reverse()
    .sortBy('timestamp');
}

export async function getThreadPrompts(threadId: string): Promise<Prompt[]> {
  return db.prompts.where('threadId').equals(threadId).sortBy('timestamp');
}

export async function toggleFavorite(id: string): Promise<void> {
  const prompt = await db.prompts.get(id);
  if (prompt) {
    await db.prompts.update(id, { isFavorite: !prompt.isFavorite });
  }
}

export async function moveToFolder(
  ids: string[],
  folderId: string | null,
): Promise<void> {
  await db.prompts.bulkUpdate(
    ids.map((id) => ({ key: id, changes: { folderId } })),
  );
}

export async function updateTags(id: string, tags: string[]): Promise<void> {
  await db.prompts.update(id, { tags });
}

export async function deletePrompts(ids: string[]): Promise<void> {
  await db.prompts.bulkDelete(ids);
}

export async function getAllPrompts(): Promise<Prompt[]> {
  return db.prompts.orderBy('timestamp').reverse().toArray();
}

export async function getPromptCount(): Promise<number> {
  return db.prompts.count();
}

// ── Folders ──────────────────────────────────────────────

export async function createFolder(
  name: string,
  parentId: string | null = null,
): Promise<string> {
  const id = crypto.randomUUID();
  const count = await db.folders.where('parentId').equals(parentId ?? '').count();
  await db.folders.add({
    id,
    name,
    parentId,
    createdAt: Date.now(),
    order: count,
  });
  return id;
}

export async function getAllFolders(): Promise<Folder[]> {
  return db.folders.orderBy('order').toArray();
}

export async function renameFolder(
  id: string,
  name: string,
): Promise<void> {
  await db.folders.update(id, { name });
}

export async function deleteFolder(id: string): Promise<void> {
  // Move all prompts in this folder back to "unfiled"
  const prompts = await db.prompts.where('folderId').equals(id).toArray();
  if (prompts.length > 0) {
    await db.prompts.bulkUpdate(
      prompts.map((p) => ({ key: p.id, changes: { folderId: null } })),
    );
  }
  await db.folders.delete(id);
}

// ── Export / Import ──────────────────────────────────────

export async function exportAll(): Promise<ExportData> {
  const [prompts, folders] = await Promise.all([
    db.prompts.toArray(),
    db.folders.toArray(),
  ]);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    prompts,
    folders,
  };
}

export async function importData(data: ExportData): Promise<number> {
  if (data.version !== 1) throw new Error('Unsupported export version');
  await db.transaction('rw', db.prompts, db.folders, async () => {
    if (data.folders.length > 0) await db.folders.bulkPut(data.folders);
    if (data.prompts.length > 0) await db.prompts.bulkPut(data.prompts);
  });
  return data.prompts.length;
}

// ── Settings ─────────────────────────────────────────────

const DEFAULT_SETTINGS: Settings = {
  id: 1,
  consentGiven: false,
  consentTimestamp: null,
  reviewPromptShown: false,
};

export async function getSettings(): Promise<Settings> {
  const s = await db.settings.get(1);
  return s ?? DEFAULT_SETTINGS;
}

export async function setConsent(given: boolean): Promise<void> {
  const current = await getSettings();
  await db.settings.put({
    ...current,
    consentGiven: given,
    consentTimestamp: given ? Date.now() : null,
  });
}

export async function markReviewPromptShown(): Promise<void> {
  const current = await getSettings();
  await db.settings.put({ ...current, reviewPromptShown: true });
}

export async function markOnboardingShown(): Promise<void> {
  const current = await getSettings();
  await db.settings.put({
    ...current,
    onboardingShown: true,
    onboardingShownAt: Date.now(),
  });
}

/**
 * Exports all prompts as a CSV string.
 * Columns: id, platform, timestamp, promptText, responseText, tags, isFavorite
 */
export async function exportAsCsv(): Promise<string> {
  const prompts = await db.prompts.orderBy('timestamp').reverse().toArray();

  const escape = (val: string) => `"${val.replace(/"/g, '""')}"`;

  const header = ['id', 'platform', 'timestamp', 'promptText', 'responseText', 'tags', 'isFavorite'].join(',');

  const rows = prompts.map((p) =>
    [
      escape(p.id),
      escape(p.platform),
      escape(new Date(p.timestamp).toISOString()),
      escape(p.promptText),
      escape(p.responseText),
      escape(p.tags.join('; ')),
      String(p.isFavorite),
    ].join(','),
  );

  return [header, ...rows].join('\n');
}
