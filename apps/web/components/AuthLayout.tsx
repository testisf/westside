import { Wordmark } from "./Wordmark";

/** Frame for sign-in, registration and email verification. */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="px-5 py-4 md:px-8 md:py-5">
        <Wordmark href="/" />
      </header>

      <main className="flex-1 px-5 pb-16 pt-6 md:pt-[9vh]">
        <div className="mx-auto w-full max-w-[22rem]">
          <h1 className="text-xl font-semibold leading-7">{title}</h1>
          {subtitle && <p className="mt-1 text-text-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
          {footer && <div className="mt-6 border-t pt-4 text-text-muted">{footer}</div>}
        </div>
      </main>

      <footer className="px-5 py-4 text-xs text-text-faint md:px-8">
        Westside · Communications platform for ERLC communities
      </footer>
    </div>
  );
}
