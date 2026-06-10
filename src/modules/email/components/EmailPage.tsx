import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  Mail,
  Plus,
  Inbox,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { useEmailStore } from "../email-store";
import { AccountList } from "./AccountList";
import { InboxList } from "./InboxList";
import { ThreadReader } from "./ThreadReader";
import { ComposePanel } from "./ComposePanel";

export function EmailPage() {
  const hydrateAccounts = useEmailStore((s) => s.hydrateAccounts);
  const accounts = useEmailStore((s) => s.accounts);
  const isComposing = useEmailStore((s) => s.isComposing);
  const startCompose = useEmailStore((s) => s.startCompose);
  const configureGmailOauth = useEmailStore((s) => s.configureGmailOauth);
  const connectGmail = useEmailStore((s) => s.connectGmail);
  const activeAccountId = useEmailStore((s) => s.activeAccountId);
  const syncAccount = useEmailStore((s) => s.syncAccount);
  const isLoading = useEmailStore((s) => s.isLoading);
  const error = useEmailStore((s) => s.error);

  useEffect(() => {
    void hydrateAccounts();
  }, [hydrateAccounts]);

  const showWelcome = accounts.length === 0;

  const handleConfigureAndConnect = async (clientId: string, clientSecret: string) => {
    await configureGmailOauth(clientId, clientSecret);
    if (useEmailStore.getState().error) return;
    await connectGmail();
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
          onConfigureAndConnect={handleConfigureAndConnect}
          isLoading={isLoading}
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

function WelcomeScreen({
  onConfigureAndConnect,
  isLoading,
}: {
  onConfigureAndConnect: (clientId: string, clientSecret: string) => Promise<void>;
  isLoading: boolean;
}) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onConfigureAndConnect(clientId, clientSecret);
  };

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-sky-500/25 to-blue-500/20 text-sky-300 ring-1 ring-inset ring-sky-400/20">
          <Inbox className="size-7" />
        </div>
        <h2 className="text-[18px] font-semibold tracking-tight text-white">
          Connect Gmail
        </h2>
        <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-[var(--color-text-dim)]">
          Enter your Google OAuth Desktop app credentials to securely link your Gmail account.
        </p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-3 rounded-2xl border border-[var(--color-border)] bg-white/[0.025] p-4 text-left">
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
            {isLoading ? "Connecting..." : "Configure & Connect Gmail"}
          </button>
        </form>
        <p className="mt-4 text-[11px] text-[var(--color-text-dim)]">
          Use a Google OAuth 2.0 Desktop app from Google Cloud Console.
        </p>
      </div>
    </div>
  );
}
