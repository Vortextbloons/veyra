import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { emitAppReady, markStartup } from "@/lib/startup";
import { ErrorBoundary } from "@/components/error-boundary";

markStartup("veyra:main-start");

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element not found");
const root = createRoot(rootEl);
const app = (
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

if (import.meta.env.DEV && import.meta.env.VITE_STRICT_MODE === "true") {
  root.render(<StrictMode>{app}</StrictMode>);
} else {
  root.render(app);
}

void emitAppReady();
