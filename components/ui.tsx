/** Small hand-rolled primitives shared by the components. Touch targets are at least 44px. */
import type { ButtonHTMLAttributes, ReactNode } from "react";

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
