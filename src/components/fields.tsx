import { useId } from 'react';
import type { ComponentProps, ReactNode } from 'react';

const INPUT =
  'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-teal-600 focus:ring-2 focus:ring-teal-600/30 focus:outline-none aria-invalid:border-red-500';

/** Label + control + error/hint, wired for screen readers. */
function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: (ids: { id: string; describedBy?: string }) => ReactNode;
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children({ id, describedBy })}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-red-600">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="text-xs text-slate-500">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

export function SelectField({
  label,
  error,
  hint,
  options,
  ...props
}: ComponentProps<'select'> & {
  label: string;
  error?: string;
  hint?: string;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <Field label={label} error={error} hint={hint}>
      {({ id, describedBy }) => (
        <select
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={INPUT}
          {...props}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function TextAreaField({
  label,
  error,
  hint,
  ...props
}: ComponentProps<'textarea'> & {
  label: string;
  error?: string;
  hint?: string;
}) {
  return (
    <Field label={label} error={error} hint={hint}>
      {({ id, describedBy }) => (
        <textarea
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`${INPUT} font-mono`}
          {...props}
        />
      )}
    </Field>
  );
}
