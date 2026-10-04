/** Small hand-rolled primitives shared by the components. Touch targets are at least 44px. */
import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-stone-900 text-white hover:bg-stone-700 disabled:bg-stone-300",
  secondary: "border border-stone-300 bg-white hover:bg-stone-100 disabled:text-stone-400",
  danger: "border border-red-300 bg-white text-red-700 hover:bg-red-50",
  ghost: "hover:bg-stone-100",
};

export function Button({ variant = "secondary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-11 items-center justify-center rounded px-3 text-sm font-medium disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

export function Panel({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded border border-stone-200 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 px-3 py-2">
        <h2 className="font-semibold">{title}</h2>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}

export const inputClass = "min-h-11 w-full rounded border border-stone-300 bg-white px-2 text-sm";
export const labelClass = "flex flex-col gap-1 text-sm";

export function CheckboxField({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex min-h-11 items-center gap-2 text-sm">
      <input type="checkbox" className="size-5 shrink-0" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/** A pressed/unpressed button for multi-select lists (conditions, clustered with). */
export function ToggleChip({ pressed, onToggle, children }: { pressed: boolean; onToggle: (pressed: boolean) => void; children: ReactNode }) {
  return (
    <Button variant={pressed ? "primary" : "secondary"} aria-pressed={pressed} onClick={() => onToggle(!pressed)}>
      {children}
    </Button>
  );
}

type NumberFieldProps = { label: string; placeholder?: string; disabled?: boolean; className?: string } & (
  | { optional: true; value: number | undefined; onChange: (value: number | undefined) => void }
  | { optional?: false; value: number; onChange: (value: number) => void }
);

const WHOLE_NUMBER = /^\d+$/;

function wholeNumberError(text: string, optional: boolean): string | null {
  if (text === "") return optional ? null : "Required";
  if (!WHOLE_NUMBER.test(text) || !Number.isSafeInteger(Number(text))) return "Enter a whole number, 0 or more";
  return null;
}

/**
 * A whole-number input (0 or more). It keeps the typed text, so a bad value stays visible with an
 * inline error instead of being dropped, and only valid numbers reach `onChange`. The error is also
 * set as the input's custom validity, so a surrounding <form> won't submit while it shows.
 */
export function NumberField(props: NumberFieldProps) {
  const { label, placeholder, disabled, className = "" } = props;
  const [text, setText] = useState(props.value === undefined ? "" : String(props.value));
  // Resync the text when the value changes from outside (React's "adjust state on prop change" pattern).
  const [lastValue, setLastValue] = useState(props.value);
  if (props.value !== lastValue) {
    setLastValue(props.value);
    setText(props.value === undefined ? "" : String(props.value));
  }

  const error = wholeNumberError(text.trim(), props.optional === true);
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.setCustomValidity(error ?? ""), [error]);

  function edit(next: string) {
    setText(next);
    const trimmed = next.trim();
    if (wholeNumberError(trimmed, props.optional === true) !== null) return;
    if (trimmed === "") {
      if (props.optional) {
        setLastValue(undefined);
        props.onChange(undefined);
      }
      return;
    }
    const value = Number(trimmed);
    setLastValue(value);
    props.onChange(value);
  }

  return (
    <label className={`${labelClass} ${className}`}>
      {label}
      <input
        ref={inputRef}
        className={`${inputClass} ${error ? "border-red-500" : ""}`}
        inputMode="numeric"
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={error !== null}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => edit(e.target.value)}
      />
      {error && (
        <span id={errorId} className="text-xs text-red-700">
          {error}
        </span>
      )}
    </label>
  );
}

export function Badge({ tone = "stone", children }: { tone?: "stone" | "amber" | "red" | "green" | "blue"; children: ReactNode }) {
  const tones = {
    stone: "bg-stone-100 text-stone-700",
    amber: "bg-amber-100 text-amber-900",
    red: "bg-red-100 text-red-800",
    green: "bg-green-100 text-green-800",
    blue: "bg-blue-100 text-blue-800",
  };
  return <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}
