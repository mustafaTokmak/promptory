import { useState } from 'react';
import { Button, Logo } from '../../components/ui';
import {
  setAnalyticsConsent,
  setConsent,
  markOnboardingShown,
  cancelPendingUploads,
} from '../../lib/storage';

type ExitMode = 'save' | 'skip' | 'later';

export default function App() {
  const [analyticsOn, setAnalyticsOn] = useState(true);
  const [communityOn, setCommunityOn] = useState(true);
  const [busy, setBusy] = useState(false);

  const trackBg = (
    event: string,
    params: Record<string, string | number | boolean> = {},
  ) => {
    chrome.runtime
      .sendMessage({ type: 'TRACK', event, params })
      .catch(() => {/* fire-and-forget */});
  };

  const persistAndClose = async (mode: ExitMode) => {
    setBusy(true);
    try {
      if (mode === 'save') {
        await setAnalyticsConsent(analyticsOn);
        await setConsent(communityOn);
        // If the user is opening this page from the banner and explicitly
        // unchecks community, cancel any prompts queued from a previous
        // opt-in so they aren't uploaded after the user just declined.
        if (!communityOn) await cancelPendingUploads();
        await markOnboardingShown();
        // After setAnalyticsConsent so background.track() sees the new flag.
        trackBg('onboarding_completed', {
          analytics_opt_in: analyticsOn,
          community_opt_in: communityOn,
        });
      } else if (mode === 'skip') {
        await setAnalyticsConsent(false);
        await setConsent(false);
        await cancelPendingUploads();
        await markOnboardingShown();
        // No track — analytics is off.
      }
      // 'later' — leave everything as-is, don't mark onboardingShown.
    } finally {
      const dashboardUrl = chrome.runtime.getURL('/dashboard.html');
      window.location.replace(dashboardUrl);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="mx-auto max-w-2xl px-6 py-16">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <div className="flex flex-col items-center text-center">
            <Logo size={48} />
            <h1 className="mt-4 text-2xl font-semibold text-gray-900">
              Welcome to Promptory
            </h1>
            <p className="mt-3 max-w-md text-sm text-gray-600">
              Promptory auto-saves every prompt you send to ChatGPT, Claude,
              Gemini, and 3 more — locally, on your device. No account
              needed. Already working.
            </p>
          </div>

          <hr className="my-8 border-gray-100" />

          <p className="mb-4 text-sm font-medium text-gray-700">
            Two optional extras — you can change these anytime:
          </p>

          <ConsentToggle
            checked={analyticsOn}
            onChange={setAnalyticsOn}
            title="Anonymous usage analytics"
            body={
              <>
                Helps us see which AI tools people use most and fix bugs
                faster. Sent to Google Analytics.{' '}
                <strong className="text-gray-900">
                  No prompt content is ever shared.
                </strong>
              </>
            }
          />

          <ConsentToggle
            checked={communityOn}
            onChange={setCommunityOn}
            title="Contribute to the community library"
            body={
              <>
                Anonymized prompts help build a shared library of great
                prompts for everyone. Coming with V2.{' '}
                <a
                  href="https://promptory.chat/privacy"
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-600 underline hover:text-brand-700"
                >
                  Read what's anonymized
                </a>
              </>
            }
          />

          <div className="mt-8 flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="md"
              onClick={() => persistAndClose('later')}
              disabled={busy}
            >
              Decide later
            </Button>
            <Button
              variant="ghost"
              size="md"
              onClick={() => persistAndClose('skip')}
              disabled={busy}
            >
              Skip both
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={() => persistAndClose('save')}
              disabled={busy}
            >
              Save preferences
            </Button>
          </div>
        </div>

        <Faq />
      </main>
    </div>
  );
}

function ConsentToggle({
  checked,
  onChange,
  title,
  body,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  title: string;
  body: React.ReactNode;
}) {
  return (
    <label
      className={`mb-3 flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors ${
        checked
          ? 'border-brand-300 bg-brand-50/40'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
      />
      <div>
        <div className="text-sm font-medium text-gray-900">{title}</div>
        <div className="mt-1 text-xs text-gray-600">{body}</div>
      </div>
    </label>
  );
}

function Faq() {
  return (
    <div className="mt-8 space-y-2 text-sm">
      <FaqItem question="What's anonymized in the community library?">
        <>
          Before any prompt leaves your device, it's scanned for emails,
          phone numbers, credit card numbers, and other identifiers.
          Anything detected is replaced with a placeholder like{' '}
          <code className="rounded bg-gray-100 px-1 text-xs">[email]</code>.
          A second sanitizer runs on our server, and every shared prompt is
          manually reviewed before it appears publicly. You can opt out at
          any time.
        </>
      </FaqItem>
      <FaqItem question="What does the analytics actually track?">
        <>
          Which AI tools you capture from (platform name only), how many
          prompts per day, when you open the dashboard or sidepanel, and
          basic version info. Never the prompt text, response text, or URLs.
        </>
      </FaqItem>
      <FaqItem question="How do I opt out later?">
        <>
          Open the dashboard and toggle the analytics checkbox in the header
          off. Local capture continues to work either way.
        </>
      </FaqItem>
    </div>
  );
}

function FaqItem({
  question,
  children,
}: {
  question: string;
  children: React.ReactNode;
}) {
  return (
    <details className="rounded-lg border border-gray-200 bg-white px-4 py-3">
      <summary className="cursor-pointer text-sm font-medium text-gray-800">
        {question}
      </summary>
      <div className="mt-2 text-sm text-gray-600">{children}</div>
    </details>
  );
}
