import { forwardRef, useEffect, useId, useRef, useState } from "react";
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

function buttonClass(variant: ButtonVariant = "secondary", size: "md" | "sm" = "md") {
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
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "md" | "sm"; loading?: boolean }) {
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

export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className="animate-spin" aria-hidden="true">
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

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; mono?: boolean }>(
  function Input({ invalid, mono, className = "", ...rest }, ref) {
    return (
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        {...rest}
        className={`${CONTROL} h-8 ${controlTone(invalid)} ${mono ? "font-mono" : ""} ${className}`}
      />
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function Textarea({ invalid, className = "", ...rest }, ref) {
    return <textarea ref={ref} aria-invalid={invalid || undefined} {...rest} className={`${CONTROL} py-1.5 ${controlTone(invalid)} ${className}`} />;
  },
);

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
    <div role={tone === "danger" ? "alert" : "status"} className={`flex items-start justify-between gap-4 rounded-r border-l-2 px-3 py-2.5 text-sm ${NOTICE_TONE[tone]}`}>
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

export function Status({ tone, children }: { tone: "ok" | "warn" | "bad" | "off"; children: React.ReactNode }) {
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
      return "off";
  }
}

export function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded border border-border bg-bg-subtle px-1.5 py-px font-mono text-xs text-text-muted">{children}</span>
  );
}

/* ---------- Layout ---------- */

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold leading-7">{title}</h1>
        {description && <p className="mt-0.5 max-w-xl text-text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Section({ title, action, children, className = "" }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
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

export function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`overflow-hidden rounded-lg border bg-surface ${className}`}>{children}</div>;
}

export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-surface px-5 py-6">
      <p className="font-medium">{title}</p>
      {children && <p className="mt-1 max-w-md text-text-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-bg-muted ${className}`} aria-hidden="true" />;
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
          /* clipboard unavailable; value is still selectable */
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
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border bg-surface p-0 shadow-[0_8px_28px_rgb(0_0_0/0.3)]"
    >
      {open && (
        <div className="p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold leading-6">{title}</h2>
              {description && <p className="mt-0.5 text-text-muted">{description}</p>}
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="-mr-1.5 -mt-1 rounded p-1.5 text-text-muted hover:bg-bg-subtle hover:text-text">
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
