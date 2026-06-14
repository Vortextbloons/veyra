import { Component, type ErrorInfo, type ReactNode } from "react";

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  error: Error | null;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Veyra render error", error, errorInfo);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <main className="grid min-h-screen place-items-center bg-[var(--color-bg)] p-6 text-[var(--color-text)]">
        <section className="max-w-lg rounded-2xl border border-red-400/20 bg-[var(--color-panel)] p-6 shadow-2xl shadow-black/40">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-red-300">
            Veyra recovered from an interface error
          </p>
          <h1 className="mt-3 text-xl font-semibold text-white">Something went wrong</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--color-text-dim)]">
            The app shell is still running. Reload the window to continue; diagnostic details were written to the console.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition hover:brightness-110"
          >
            Reload Veyra
          </button>
        </section>
      </main>
    );
  }
}
