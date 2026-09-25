import Link from "next/link";

export function Wordmark({ href = "/dashboard" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 font-semibold tracking-tight">
      <span
        className="flex h-6 w-6 items-center justify-center rounded bg-primary text-[13px] font-semibold leading-none text-primary-foreground"
        aria-hidden="true"
      >
        W
      </span>
      Westside
    </Link>
  );
}
