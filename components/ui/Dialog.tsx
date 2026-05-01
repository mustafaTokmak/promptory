import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

/**
 * Dialog — replacement for native `confirm()`.
 *
 * Accessible: traps Escape to close, Enter to confirm (when onConfirm present),
 * clicks on backdrop to close. aria-modal + role="dialog".
 *
 * Intentionally stateless — parent controls `open`. This keeps it trivial to
 * compose ("show dialog → await result via callback") without portal magic.
 */
interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  /** Primary action label. If undefined, only Cancel is shown. */
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  /** Danger styling for the confirm button (red). */
  variant?: 'default' | 'danger';
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  variant = 'default',
}: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Enter' && onConfirm) {
        e.preventDefault();
        onConfirm();
        onClose();
      }
    };

    document.addEventListener('keydown', onKey);
    // Move focus into the dialog for keyboard users
    dialogRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, onConfirm]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="promptory-dialog-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl focus:outline-none"
      >
        <div className="mb-2 flex items-start justify-between gap-4">
          <h2
            id="promptory-dialog-title"
            className="text-base font-semibold text-gray-900"
          >
            {title}
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

        {description && (
          <div className="mb-5 text-sm text-gray-600">{description}</div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="md" onClick={onClose}>
            {cancelLabel}
          </Button>
          {confirmLabel && onConfirm && (
            <Button
              variant={variant === 'danger' ? 'danger' : 'primary'}
              size="md"
              onClick={() => {
                onConfirm();
                onClose();
              }}
            >
              {confirmLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
