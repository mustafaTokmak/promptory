import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from './ui';
import {
  getSettings,
  setAnalyticsConsent,
  setConsent,
  cancelPendingUploads,
} from '../lib/storage';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called after either consent flag is changed so the parent can refresh state. */
  onConsentChanged?: (next: { analyticsConsent: boolean; consentGiven: boolean }) => void;
}

type PendingDisable =
  | { kind: 'analytics' }
  | { kind: 'community' }
  | null;

/**
 * Settings dialog — the single surface for changing consent flags after
 * onboarding. Opt-OUT (toggling either flag from on → off) requires a
 * second confirmation with danger-styled copy. Opt-IN is one click.
 *
 * The friction on opt-out is intentional. Users who installed and opted
 * in deliberately should not lose that decision via an accidental click;
 * users who genuinely want to revoke get clear copy explaining what does
 * and doesn't happen.
 */
export function SettingsDialog({
  open,
  onClose,
  onConsentChanged,
}: SettingsDialogProps) {
  const [analyticsOn, setAnalyticsOn] = useState(false);
  const [communityOn, setCommunityOn] = useState(false);
  const [pendingDisable, setPendingDisable] = useState<PendingDisable>(null);

  useEffect(() => {
    if (!open) return;
    getSettings().then((s) => {
      setAnalyticsOn(s.analyticsConsent);
      setCommunityOn(s.consentGiven);
    });
  }, [open]);

  const fireConsentChange = (
    setting: 'analytics' | 'community',
    new_value: boolean,
  ) => {
    chrome.runtime
      .sendMessage({
        type: 'TRACK',
        event: 'consent_changed',
        params: { setting, new_value },
      })
      .catch(() => {/* fire-and-forget */});
  };

  const handleAnalyticsToggle = async (next: boolean) => {
    if (next) {
      // Opt-in is one click.
      await setAnalyticsConsent(true);
      setAnalyticsOn(true);
      fireConsentChange('analytics', true);
      onConsentChanged?.({ analyticsConsent: true, consentGiven: communityOn });
      return;
    }
    // Opt-out requires confirmation.
    setPendingDisable({ kind: 'analytics' });
  };

  const handleCommunityToggle = async (next: boolean) => {
    if (next) {
      await setConsent(true);
      setCommunityOn(true);
      fireConsentChange('community', true);
      onConsentChanged?.({ analyticsConsent: analyticsOn, consentGiven: true });
      return;
    }
    setPendingDisable({ kind: 'community' });
  };

  const confirmDisable = async () => {
    if (!pendingDisable) return;
    if (pendingDisable.kind === 'analytics') {
      await setAnalyticsConsent(false);
      setAnalyticsOn(false);
      // Note: consent_changed for opt-out NEVER fires — analytics is now
      // off, so track() would no-op anyway. Recording the opt-out
      // server-side would defeat the point of opting out.
      onConsentChanged?.({ analyticsConsent: false, consentGiven: communityOn });
    } else {
      await setConsent(false);
      // Cancel any prompts queued for upload but not yet sent. Already-
      // sent rows stay in the remote dataset (we can't unshare per-user;
      // documented in the opt-out copy). Pending → 'skipped' so the flush
      // helper never picks them up again.
      const cancelled = await cancelPendingUploads();
      if (cancelled > 0) {
        console.log(`[Promptory] cancelled ${cancelled} pending upload(s)`);
      }
      setCommunityOn(false);
      // Community opt-out is fine to track if analytics is still on.
      fireConsentChange('community', false);
      onConsentChanged?.({ analyticsConsent: analyticsOn, consentGiven: false });
    }
    setPendingDisable(null);
  };

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="promptory-settings-title"
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl"
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2
              id="promptory-settings-title"
              className="text-base font-semibold text-gray-900"
            >
              Privacy &amp; data
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mt-1 -mr-1 rounded p-1 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="mb-4 text-xs text-gray-500">
            Local prompt capture works regardless of these toggles. They only
            affect what leaves your device.
          </p>

          <ToggleRow
            checked={analyticsOn}
            onChange={handleAnalyticsToggle}
            title="Anonymous usage analytics"
            body="Helps us see which AI tools people use and fix bugs. Sent to Google Analytics. No prompt content is ever shared."
          />

          <ToggleRow
            checked={communityOn}
            onChange={handleCommunityToggle}
            title="Contribute to the community library"
            body="Anonymized prompts help build a shared library. Coming with V2."
          />

          <div className="mt-5 flex justify-end">
            <Button variant="secondary" size="md" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      </div>

      {pendingDisable && (
        <OptOutConfirmDialog
          kind={pendingDisable.kind}
          onDismiss={() => setPendingDisable(null)}
          onKeep={() => {
            setPendingDisable(null);
            // Only close the parent settings dialog for community-sharing.
            // Analytics is lower-stakes — keeping it on shouldn't kick the
            // user out of Settings since they may want to tweak other things.
            if (pendingDisable.kind === 'community') onClose();
          }}
          onConfirm={confirmDisable}
        />
      )}
    </>
  );
}

/**
 * Asymmetric opt-out confirmation. The "Keep on" path is the visual
 * default — large primary button, ample whitespace. The "Turn off" path is
 * an intentionally small, low-contrast text link. The user can still opt
 * out, but a glance at the dialog makes it clear which way the design is
 * pointing them.
 */
function OptOutConfirmDialog({
  kind,
  onDismiss,
  onKeep,
  onConfirm,
}: {
  kind: 'analytics' | 'community';
  /** Called on backdrop click / Escape — user is still deciding. */
  onDismiss: () => void;
  /** Called when user explicitly clicks the big "Keep on" button — closes both dialogs. */
  onKeep: () => void;
  onConfirm: () => void;
}) {
  const copy =
    kind === 'analytics'
      ? {
          title: 'Turn off analytics?',
          body: (
            <>
              We won't be able to see usage patterns or fix bugs you hit.
              Your local capture, search, and export keep working — this only
              affects what we learn about how Promptory is used.
            </>
          ),
          keep: 'Keep analytics on',
          leave: 'Turn off anyway',
        }
      : {
          title: 'Stop contributing to the community?',
          body: (
            <>
              Prompts you've already shared stay anonymized in the dataset —
              we can't unshare them per-user. From now on, no new prompts
              will leave your device, and you'll lose access to the community
              library when it launches.
            </>
          ),
          keep: 'Keep sharing',
          leave: 'Stop sharing anyway',
        };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={onDismiss}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl"
      >
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          {copy.title}
        </h2>
        <p className="mb-6 text-sm text-gray-600">{copy.body}</p>

        <div className="flex flex-col items-stretch gap-3">
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={onKeep}
            autoFocus
          >
            {copy.keep}
          </Button>
          <button
            type="button"
            onClick={onConfirm}
            className="self-center text-xs text-gray-400 underline underline-offset-2 hover:text-gray-600"
          >
            {copy.leave}
          </button>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({
  checked,
  onChange,
  title,
  body,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  title: string;
  body: string;
}) {
  return (
    <div className="mb-3 flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex-1">
        <div className="text-sm font-medium text-gray-900">{title}</div>
        <div className="mt-0.5 text-xs text-gray-500">{body}</div>
      </div>
      <label className="flex shrink-0 cursor-pointer items-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
            checked ? 'bg-brand-600' : 'bg-gray-300'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              checked ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </span>
      </label>
    </div>
  );
}
