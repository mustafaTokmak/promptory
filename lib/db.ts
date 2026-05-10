import Dexie, { type EntityTable } from 'dexie';
import type { Prompt, Folder, Settings, Gclid } from './types';

const db = new Dexie('PromptoryDB') as Dexie & {
  prompts: EntityTable<Prompt, 'id'>;
  folders: EntityTable<Folder, 'id'>;
  settings: EntityTable<Settings, 'id'>;
  gclids: EntityTable<Gclid, 'id'>;
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

// Version 3: extend settings rows with analytics opt-in fields. Schema
// indexes don't change — but the upgrade hook backfills defaults on
// existing rows so storage helpers can rely on the fields being present.
// Existing users who already accepted the community modal are marked
// onboardingShown=true so they don't see the soft re-prompt banner.
db.version(3)
  .stores({
    prompts: 'id, threadId, platform, timestamp, folderId, isFavorite, *tags',
    folders: 'id, parentId, order',
    settings: 'id',
  })
  .upgrade(async (tx) => {
    await tx
      .table('settings')
      .toCollection()
      .modify((s: Record<string, unknown>) => {
        if (s.analyticsConsent === undefined) s.analyticsConsent = false;
        if (s.analyticsConsentAt === undefined) s.analyticsConsentAt = null;
        if (s.clientId === undefined) s.clientId = crypto.randomUUID();
        if (s.consentGiven === true && s.onboardingShown === undefined) {
          s.onboardingShown = true;
          s.onboardingShownAt = Date.now();
        }
      });
  });

// Version 4: new gclids table for Google Ads offline conversions.
// Primary key is the gclid string itself so re-captures of the same
// gclid upsert cleanly. capturedAt is indexed for future scheduled
// queries (e.g. "all gclids older than 7 days that haven't reported
// the day7 conversion yet").
db.version(4).stores({
  prompts: 'id, threadId, platform, timestamp, folderId, isFavorite, *tags',
  folders: 'id, parentId, order',
  settings: 'id',
  gclids: 'id, capturedAt',
});

// Version 5: add uploadStatus + uploadedAt to prompts for the community
// upload retry queue. uploadStatus is indexed so the flush helper can
// efficiently query rows with status='pending' without scanning the
// whole table.
//
// Migration backfills every existing row to 'skipped' — pre-feature
// captures shouldn't be uploaded retroactively. Forward-only consent:
// the user opted in for new captures, not historical.
db.version(5)
  .stores({
    prompts:
      'id, threadId, platform, timestamp, folderId, isFavorite, uploadStatus, *tags',
    folders: 'id, parentId, order',
    settings: 'id',
    gclids: 'id, capturedAt',
  })
  .upgrade(async (tx) => {
    await tx
      .table('prompts')
      .toCollection()
      .modify((p: Record<string, unknown>) => {
        if (p.uploadStatus === undefined) p.uploadStatus = 'skipped';
        if (p.uploadedAt === undefined) p.uploadedAt = null;
      });
  });

export { db };
