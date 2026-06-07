import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { emitAppReady, markStartup } from "@/lib/startup";

markStartup("veyra:main-start");

const root = createRoot(document.getElementById("root")!);
const app = <App />;

if (import.meta.env.DEV && import.meta.env.VITE_STRICT_MODE === "true") {
  root.render(<StrictMode>{app}</StrictMode>);
} else {
  root.render(app);
}

void emitAppReady();
