import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

/**
 * Button — the one button. Every clickable in the app that's not a plain text
 * link should go through here so variant/size/spacing stay consistent.
 *
 * Variants:
 *   primary   — solid brand fill (the default call-to-action)
 *   secondary — white with subtle border (neutral action)
 *   danger    — solid red (destructive, irreversible)
 *   ghost     — transparent (tertiary, toolbar-style actions)
 *
 * Sizes:
 *   sm — 24px tall, for compact toolbars (side panel)
 *   md — 32px tall, the default
 *   lg — 40px tall, for prominent CTAs (dashboard empty state, etc.)
 */

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  fullWidth?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 border-transparent',
  secondary:
    'bg-white text-gray-700 hover:bg-gray-50 hover:text-gray-900 border-gray-200',
  danger:
    'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 border-transparent',
  ghost:
    'bg-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100 border-transparent',
};

const SIZES: Record<Size, string> = {
  sm: 'h-6 text-xs px-2 gap-1 rounded-md',
  md: 'h-8 text-sm px-3 gap-1.5 rounded-md',
  lg: 'h-10 text-sm px-4 gap-2 rounded-lg',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      leadingIcon,
      trailingIcon,
      fullWidth = false,
      className = '',
      children,
      ...props
    },
    ref,
  ) => (
    <button
      ref={ref}
      className={[
        'inline-flex items-center justify-center border font-medium',
        'transition-colors duration-150',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
        VARIANTS[variant],
        SIZES[size],
        fullWidth ? 'w-full' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {leadingIcon && <span className="flex-shrink-0">{leadingIcon}</span>}
      {children}
      {trailingIcon && <span className="flex-shrink-0">{trailingIcon}</span>}
    </button>
  ),
);

Button.displayName = 'Button';
