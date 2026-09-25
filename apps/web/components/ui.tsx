"use client";

/**
 * Shared interface pieces. Rules the rest of the app follows:
 *   - controls are 32px tall (28px for the small size), 4px radius
 *   - panels and dialogs use a 6px radius, a 1px border, and no shadow (dialogs get one)
 *   - text is 14px, secondary text 12–13px; titles are 20px semibold at most
 *   - status is a dot + label; colour is never the only signal
 */

import { forwardRef, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "./icons";

/* ---------- Button ---------- */

type ButtonVariant = "primary" | "secondary" | "danger" | "dangerSolid" | "ghost";

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary-hover",
  secondary: "border border-border-strong bg-surface text-text hover:bg-surface-hover",
  danger: "border border-danger/40 text-danger hover:bg-danger/10",
  dangerSolid: "bg-danger text-danger-foreground hover:opacity-90",
  ghost: "text-text-muted hover:bg-bg-subtle hover:text-text",
};

export function buttonClass(variant: ButtonVariant = "secondary", size: "md" | "sm" = "md") {
  return [
    "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded font-medium transition-colors",
    "disabled:cursor-not-allowed disabled:opacity-50",
    size === "md" ? "h-8 px-3 text-sm" : "h-7 px-2.5 text-[13px]",
    BUTTON_VARIANT[variant],
  ].join(" ");
}

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  className = "",
  disabled,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "md" | "sm";
  loading?: boolean;
}) {
  return (
    <button
      {...rest}
      type={rest.type ?? "button"}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${buttonClass(variant, size)} ${className}`}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  variant = "secondary",
  size = "md",
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: "md" | "sm";
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={buttonClass(variant, size)}>
      {children}
    </Link>
  );
}

export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className="animate-spin"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/* ---------- Form fields ---------- */

const CONTROL =
  "w-full rounded border bg-surface px-2.5 text-sm text-text placeholder:text-text-faint " +
  "transition-colors focus:ring-1 disabled:cursor-not-allowed disabled:bg-bg-subtle disabled:text-text-muted";

function controlTone(invalid?: boolean) {
  return invalid
    ? "border-danger focus:border-danger focus:ring-danger"
    : "border-border-strong hover:border-text-faint focus:border-primary focus:ring-primary";
}

export const Input = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; mono?: boolean }
>(function Input({ invalid, mono, className = "", ...rest }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      {...rest}
      className={`${CONTROL} h-8 ${controlTone(invalid)} ${mono ? "font-mono" : ""} ${className}`}
    />
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ invalid, className = "", ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      {...rest}
      className={`${CONTROL} py-1.5 ${controlTone(invalid)} ${className}`}
    />
  );
});

export function Field({
  label,
  hint,
  error,
  optional,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: string;
  optional?: boolean;
  /** Render-prop so the control receives the generated id and describedby. */
  children: (props: { id: string; "aria-describedby"?: string; invalid: boolean }) => React.ReactNode;
}) {
  const id = useId();
  const noteId = `${id}-note`;
  const hasNote = !!(error || hint);
  return (
    <div>
      <label htmlFor={id} className="mb-1 flex items-baseline gap-1.5 text-[13px] font-medium">
        {label}
        {optional && <span className="text-xs font-normal text-text-faint">optional</span>}
      </label>
      {children({ id, "aria-describedby": hasNote ? noteId : undefined, invalid: !!error })}
      {hasNote && (
        <p id={noteId} className={`mt-1 text-xs ${error ? "text-danger" : "text-text-muted"}`}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

/* ---------- Feedback ---------- */

type Tone = "danger" | "success" | "warning" | "info";

const NOTICE_TONE: Record<Tone, string> = {
  danger: "border-danger bg-danger/[0.07]",
  success: "border-success bg-success/[0.07]",
  warning: "border-warning bg-warning/[0.08]",
  info: "border-primary bg-primary/[0.07]",
};

export function Notice({
  tone = "info",
  title,
  children,
  action,
}: {
  tone?: Tone;
  title?: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={`flex items-start justify-between gap-4 rounded-r border-l-2 px-3 py-2.5 text-sm ${NOTICE_TONE[tone]}`}
    >
      <div className="min-w-0">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={title ? "mt-0.5 text-text-muted" : ""}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

const DOT: Record<"ok" | "warn" | "bad" | "off", string> = {
  ok: "bg-success",
  warn: "bg-warning",
  bad: "bg-danger",
  off: "bg-text-faint",
};

/** Status as a dot and a word. */
export function Status({
  tone,
  children,
}: {
  tone: "ok" | "warn" | "bad" | "off";
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[tone]}`} aria-hidden="true" />
      {children}
    </span>
  );
}

export function statusTone(status: string): "ok" | "warn" | "bad" | "off" {
  switch (status) {
    case "active":
      return "ok";
    case "pending":
    case "suspended":
    case "locked":
      return "warn";
    case "disabled":
      return "bad";
    default:
      return "off"; // archived, left, etc.
  }
}

/** Small mono label for scopes, roles, IDs. */
export function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded border border-border bg-bg-subtle px-1.5 py-px font-mono text-xs text-text-muted">
      {children}
    </span>
  );
}

/* ---------- Layout pieces ---------- */

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  useEffect(() => {
    document.title = `${title} · Westside`;
  }, [title]);
  return (
    <header className="mb-6">
      {back && (
        <Link
          href={back.href}
          className="mb-2 inline-flex items-center gap-1 text-[13px] text-text-muted hover:text-text"
        >
          <Icon name="arrowLeft" size={14} />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold leading-7">{title}</h1>
          {description && <p className="mt-0.5 max-w-2xl text-text-muted">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function Section({
  title,
  action,
  children,
  className = "",
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <div className="mb-3 flex items-center justify-between gap-4 border-b pb-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Bordered container for tables and lists. Not used to wrap every block. */
export function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`overflow-hidden rounded-lg border bg-surface ${className}`}>{children}</div>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-surface px-5 py-6">
      <p className="font-medium">{title}</p>
      {children && <p className="mt-1 max-w-md text-text-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function NoAccess({ what }: { what: string }) {
  return (
    <EmptyState title="You don't have access to this page">
      {what} requires a permission your account doesn&rsquo;t have. Ask a server owner or an
      administrator if you think you should.
    </EmptyState>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-bg-muted ${className}`} aria-hidden="true" />;
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Panel>
      <div role="status" aria-label="Loading" className="divide-y">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-3 py-3">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="hidden h-3.5 w-24 sm:block" />
            <Skeleton className="ml-auto h-3.5 w-16" />
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function Dl({ children }: { children: React.ReactNode }) {
  return <dl className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-4 gap-y-2.5">{children}</dl>;
}
export function Dt({ children }: { children: React.ReactNode }) {
  return <dt className="text-text-muted">{children}</dt>;
}
export function Dd({ children }: { children: React.ReactNode }) {
  return <dd className="min-w-0 break-words">{children}</dd>;
}

/* ---------- Copy ---------- */

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <Button
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
        } catch {
          /* clipboard blocked (non-secure origin); the value is still selectable */
        }
      }}
    >
      <Icon name={copied ? "check" : "copy"} size={14} />
      {copied ? "Copied" : label}
    </Button>
  );
}

/* ---------- Dialogs ---------- */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        // Clicks on the backdrop land on the <dialog> itself, not its content.
        if (e.target === ref.current) onClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border bg-surface p-0 shadow-[0_8px_28px_rgb(0_0_0/0.22)]"
    >
      {open && (
        <div className="p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold leading-6">{title}</h2>
              {description && <p className="mt-0.5 text-text-muted">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-1.5 -mt-1 rounded p-1.5 text-text-muted hover:bg-bg-subtle hover:text-text"
            >
              <Icon name="x" size={16} />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  children,
  confirmLabel,
  busy = false,
  destructive = true,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  busy?: boolean;
  destructive?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="text-text-muted">{children}</div>
      <div className="mt-5 flex justify-end gap-2">
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant={destructive ? "dangerSolid" : "primary"} onClick={onConfirm} loading={busy}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

/* ---------- Segmented filter ---------- */

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex h-8 overflow-hidden rounded border border-border-strong bg-surface">
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={`px-3 text-[13px] transition-colors ${i > 0 ? "border-l border-border-strong" : ""} ${
            o.value === value ? "bg-bg-muted font-medium text-text" : "text-text-muted hover:bg-surface-hover hover:text-text"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
