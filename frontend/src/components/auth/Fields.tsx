"use client";

import { useState } from "react";

const INPUT_BASE =
  "h-12 w-full rounded-2xl bg-paper px-4 text-[15px] text-ink ring-inset outline-none transition placeholder:text-[#8c9bae] focus:bg-white focus:ring-2";

/** Ring classes are picked here rather than appended, so the error colour never fights the default one. */
function inputClass(error?: string) {
  return `${INPUT_BASE} ${error ? "ring-2 ring-[#d92d20] focus:ring-[#d92d20]" : "ring-1 ring-ice focus:ring-blue"}`;
}

type BaseProps = {
  id: string;
  label: string;
  error?: string;
  hint?: React.ReactNode;
};

function FieldShell({ id, label, error, hint, aside, children }: BaseProps & { aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[13px] font-semibold text-ink">
          {label}
        </label>
        {aside}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-[13px] font-medium text-[#d92d20]">
          {error}
        </p>
      ) : (
        hint && <div className="mt-1.5 text-[12px] text-[#5f6b7a]">{hint}</div>
      )}
    </div>
  );
}

type TextFieldProps = BaseProps & {
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "email";
  placeholder?: string;
  autoComplete?: string;
  aside?: React.ReactNode;
};

export function TextField({ id, label, error, hint, aside, value, onChange, type = "text", placeholder, autoComplete }: TextFieldProps) {
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} aside={aside}>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={inputClass(error)}
      />
    </FieldShell>
  );
}

export function PasswordField({
  id,
  label,
  error,
  hint,
  aside,
  value,
  onChange,
  autoComplete,
}: Omit<TextFieldProps, "type" | "placeholder">) {
  const [visible, setVisible] = useState(false);
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} aside={aside}>
      <div className="relative">
        <input
          id={id}
          name={id}
          type={visible ? "text" : "password"}
          value={value}
          placeholder="At least 8 characters"
          autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`${inputClass(error)} pr-12`}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-[#5f6b7a] transition hover:bg-ice-soft hover:text-link"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
            <path
              d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"
              stroke="currentColor"
              strokeWidth="1.8"
              fill="none"
            />
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" fill="none" />
            {visible && <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
          </svg>
        </button>
      </div>
    </FieldShell>
  );
}

export function SelectField({
  id,
  label,
  error,
  value,
  onChange,
  options,
  placeholder,
}: BaseProps & { value: string; onChange: (value: string) => void; options: string[]; placeholder: string }) {
  return (
    <FieldShell id={id} label={label} error={error}>
      <div className="relative">
        <select
          id={id}
          name={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`${inputClass(error)} appearance-none pr-11 ${value ? "" : "!text-[#8c9bae]"}`}
        >
          <option value="" disabled>
            {placeholder}
          </option>
          {options.map((o) => (
            <option key={o} value={o} className="text-ink">
              {o}
            </option>
          ))}
        </select>
        <svg viewBox="0 0 20 20" className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-link" aria-hidden>
          <path d="M5 7.5l5 5 5-5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </FieldShell>
  );
}

export function CheckboxField({
  id,
  checked,
  onChange,
  error,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="flex cursor-pointer items-start gap-3 text-[14px] leading-snug text-body">
        <input
          id={id}
          name={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="mt-0.5 h-[18px] w-[18px] shrink-0 cursor-pointer rounded accent-blue"
        />
        <span>{children}</span>
      </label>
      {error && (
        <p id={`${id}-error`} className="mt-1.5 pl-[30px] text-[13px] font-medium text-[#d92d20]">
          {error}
        </p>
      )}
    </div>
  );
}

/** Four-step meter under the sign up password: length, mixed case, a number, a symbol. */
export function PasswordStrength({ value }: { value: string }) {
  const checks = [value.length >= 8, /[a-z]/.test(value) && /[A-Z]/.test(value), /\d/.test(value), /[^A-Za-z0-9]/.test(value)];
  const score = value ? checks.filter(Boolean).length : 0;
  const labels = ["Use at least 8 characters", "Weak", "Fair", "Good", "Strong"];
  const colours = ["bg-ice", "bg-[#d92d20]", "bg-gold", "bg-blue-bright", "bg-[#2fbf71]"];
  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-1 gap-1.5" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${i < score ? colours[score] : "bg-ice"}`} />
        ))}
      </div>
      <span className="w-[150px] text-right" aria-live="polite">
        {labels[score]}
      </span>
    </div>
  );
}
