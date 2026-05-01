import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';

/**
 * Toast — transient feedback for user actions (copied, saved, deleted, etc.).
 *
 * Auto-dismisses after 3.5s. Bottom-right placement to stay out of the main
 * reading column. Clickable dismiss for power users who just triggered a
 * cascade of actions and don't want to wait.
 *
 * Usage:
 *   const { toast } = useToast();
 *   toast('Copied to clipboard', 'success');
 */

type ToastVariant = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}

const AUTO_DISMISS_MS = 3500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, variant: ToastVariant = 'info') => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, message, variant }]);
      setTimeout(() => remove(id), AUTO_DISMISS_MS);
    },
    [remove],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Viewport — fixed bottom-right, stacks upward. pointer-events-none on
          the container so the dead space doesn't eat clicks. */}
      <div className="pointer-events-none fixed bottom-3 right-3 z-50 flex flex-col-reverse gap-2">
        {toasts.map((t) => (
          <ToastCard key={t.id} item={t} onDismiss={() => remove(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const ICONS: Record<ToastVariant, ReactNode> = {
  success: <CheckCircle className="h-4 w-4 text-emerald-500" />,
  error: <AlertCircle className="h-4 w-4 text-red-500" />,
  info: <Info className="h-4 w-4 text-brand-500" />,
};

function ToastCard({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      className="pointer-events-auto flex min-w-[200px] max-w-[320px] items-start gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-md"
    >
      <span className="mt-0.5">{ICONS[item.variant]}</span>
      <p className="flex-1 text-sm text-gray-700">{item.message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="mt-0.5 text-gray-400 hover:text-gray-600"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
