import { useId } from 'react';
import type { ComponentProps } from 'react';

/** Label + input + error message, wired together for screen readers (htmlFor, aria-*). */
export function TextField({
  label,
  error,
  ...inputProps
}: ComponentProps<'input'> & { label: string; error?: string }) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-teal-600 focus:ring-2 focus:ring-teal-600/30 focus:outline-none aria-invalid:border-red-500"
        {...inputProps}
      />
      {error && (
        <p id={errorId} className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
