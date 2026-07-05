import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  Mail,
  Plus,
  Inbox,
  AlertCircle,
  RefreshCw,
  KeyRound,
  ShieldCheck,
} from "lucide-react";
import { useEmailStore } from "../email-store";
import { AccountList } from "./AccountList";
import { InboxList } from "./InboxList";
import ThreadReader from "./ThreadReader";
import { ComposePanel } from "./ComposePanel";

export function EmailPage() {
  const hydrateAccounts = useEmailStore((s) => s.hydrateAccounts);
  const accounts = useEmailStore((s) => s.accounts);
  const isComposing = useEmailStore((s) => s.isComposing);
  const startCompose = useEmailStore((s) => s.startCompose);
  const connectGmailWithConfig = useEmailStore((s) => s.connectGmailWithConfig);
  const connectGmail = useEmailStore((s) => s.connectGmail);
  const hasGmailOauthConfig = useEmailStore((s) => s.hasGmailOauthConfig);
  const activeAccountId = useEmailStore((s) => s.activeAccountId);
  const syncAccount = useEmailStore((s) => s.syncAccount);
  const isLoading = useEmailStore((s) => s.isLoading);
  const error = useEmailStore((s) => s.error);

  useEffect(() => {
    void hydrateAccounts();
  }, [hydrateAccounts]);

  const showWelcome = accounts.length === 0;

  const handleQuickSignIn = async () => {
    if (hasGmailOauthConfig) {
      await connectGmail();
    }
  };

  const handleSignInWithConfig = async (clientId: string, clientSecret: string) => {
    await connectGmailWithConfig(clientId, clientSecret);
  };

  return (
    <main className="flex h-full min-w-0 flex-1 flex-col bg-[var(--color-bg)]">
      {/* Page header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg)] px-5">
        <div className="flex items-center gap-2.5">
          <div className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-sky-500/30 to-blue-500/20 ring-1 ring-inset ring-sky-400/30">
            <Mail className="size-3.5 text-sky-300" />
          </div>
          <h1 className="text-[14px] font-semibold tracking-tight">Email</h1>
          <span className="ml-2 rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[10.5px] font-mono uppercase tracking-wide text-[var(--color-text-dim)]">
            {accounts.length} account{accounts.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {error && (
            <span className="flex items-center gap-1 text-[11px] text-red-400">
              <AlertCircle className="size-3" />
              {error}
            </span>
          )}
          {activeAccountId && (
            <button
              type="button"
              onClick={() => void syncAccount(activeAccountId)}
              disabled={isLoading}
              className="flex h-7 items-center gap-1.5 rounded-md border border-[var(--color-border)] px-2.5 text-[12px] font-medium text-[var(--color-text-dim)] hover:bg-white/5 hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-50"
              title="Sync account"
            >
              <RefreshCw className="size-3.5" />
              Sync
            </button>
          )}
          <button
            type="button"
            onClick={() => startCompose()}
            className="flex h-7 items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-2.5 text-[12px] font-medium text-white shadow-[0_0_0_1px_rgba(99,102,241,0.4)] hover:brightness-110"
          >
            <Plus className="size-3.5" />
            Compose
          </button>
        </div>
      </header>

      {showWelcome ? (
        <WelcomeScreen
          onQuickSignIn={handleQuickSignIn}
          onSignInWithConfig={handleSignInWithConfig}
          isLoading={isLoading}
          hasSavedConfig={hasGmailOauthConfig}
        />
      ) : (
        <div className="flex flex-1 min-h-0">
          <AccountList />
          <InboxList />
          {isComposing ? <ComposePanel /> : <ThreadReader />}
        </div>
      )}
    </main>
  );
}

function GoogleGIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}

function WelcomeScreen({
  onQuickSignIn,
  onSignInWithConfig,
  isLoading,
  hasSavedConfig,
}: {
  onQuickSignIn: () => Promise<void>;
  onSignInWithConfig: (clientId: string, clientSecret: string) => Promise<void>;
  isLoading: boolean;
  hasSavedConfig: boolean;
}) {
  const [needsConfig, setNeedsConfig] = useState(!hasSavedConfig);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");

  const handlePrimaryClick = () => {
    if (hasSavedConfig) {
      void onQuickSignIn();
    } else {
      setNeedsConfig(true);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onSignInWithConfig(clientId, clientSecret);
  };

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-sky-500/25 to-blue-500/20 text-sky-300 ring-1 ring-inset ring-sky-400/20">
          <Inbox className="size-7" />
        </div>
        <h2 className="text-[18px] font-semibold tracking-tight text-white">
          Sign in with Gmail
        </h2>
        <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-[var(--color-text-dim)]">
          Connect your Google account to read, search, and send mail from Veyra. Your tokens stay local.
        </p>

        <button
          type="button"
          onClick={handlePrimaryClick}
          disabled={isLoading}
          className="mt-6 flex h-11 w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white text-[14px] font-medium text-[#1f1f1f] shadow-sm transition hover:bg-white/95 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
        >
          <GoogleGIcon className="size-5" />
          {isLoading ? "Opening Google..." : "Sign in with Google"}
        </button>

        <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-[var(--color-text-dim)]">
          <ShieldCheck className="size-3" />
          OAuth 2.0 - tokens stored locally
        </div>

        {needsConfig && (
          <form onSubmit={handleSubmit} className="mt-5 space-y-3 rounded-2xl border border-[var(--color-border)] bg-white/[0.025] p-4 text-left">
            <div className="flex items-start gap-2 text-[11px] leading-relaxed text-[var(--color-text-dim)]">
              <KeyRound className="mt-0.5 size-3 shrink-0" />
              <span>
                First-time setup. Paste the Client ID and Secret from a Google Cloud OAuth 2.0 Desktop app. Saved locally and reused for future sign-ins.
              </span>
            </div>
            <label className="block text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
              OAuth Client ID
              <input
                type="text"
                required
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com"
                className="mt-1 h-9 w-full rounded-lg border border-[var(--color-border)] bg-black/20 px-3 text-[13px] normal-case tracking-normal text-[var(--color-text)] placeholder:text-[var(--color-text-dim)]/60"
              />
            </label>
            <label className="block text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
              OAuth Client Secret
              <input
                type="password"
                required
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="Your client secret"
                className="mt-1 h-9 w-full rounded-lg border border-[var(--color-border)] bg-black/20 px-3 text-[13px] normal-case tracking-normal text-[var(--color-text)] placeholder:text-[var(--color-text-dim)]/60"
              />
            </label>
            <button
              type="submit"
              disabled={isLoading}
              className="flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-accent)] px-5 text-[13px] font-medium text-white shadow-[0_0_0_1px_rgba(99,102,241,0.4)] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus className="size-4" />
              {isLoading ? "Connecting..." : "Save & Continue with Google"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
