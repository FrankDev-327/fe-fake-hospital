import type { ComponentProps } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-teal-700 text-white hover:bg-teal-800 disabled:bg-teal-700/50',
  secondary:
    'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-50',
  ghost: 'text-slate-700 hover:bg-slate-100 disabled:opacity-50',
};

/** A <button> with our styles. All normal button props (onClick, type, disabled...) pass through. */
export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ComponentProps<'button'> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}
