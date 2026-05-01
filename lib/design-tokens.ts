/**
 * Design tokens — single source of truth for contexts that can't reach
 * Tailwind utilities (SVG fills, inline styles, chart colors, dynamic JS).
 *
 * For anything reachable via className, prefer `bg-brand-600` / `text-brand-600`
 * over importing from here — those are wired through styles/globals.css.
 */

export const brand = {
  50: '#F5F3FF',
  100: '#EDE9FE',
  200: '#DDD6FE',
  300: '#C4B5FD',
  400: '#A78BFA',
  500: '#8B5CF6',
  600: '#7C3AED', // primary
  700: '#6D28D9',
  800: '#5B21B6',
  900: '#4C1D95',
} as const;

export const semantic = {
  success: '#10B981', // emerald-500
  warning: '#F59E0B', // amber-500
  danger: '#EF4444', // red-500
  info: brand[600],
} as const;
