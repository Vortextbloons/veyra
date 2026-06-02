import { spawn } from "node:child_process";
import net from "node:net";

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host: "127.0.0.1" }, () => {
      socket.end();
      resolve(true);
    });
    socket.setTimeout(500);
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => resolve(false));
  });
}

const viteRunning = await isPortOpen(1420);
if (!viteRunning) {
  console.warn(
    "[veyra] Vite is not running on :1420. Start `npm run dev:ui` in another terminal for faster restarts.",
  );
}

const child = spawn("npx", ["tauri", "dev", "--config", "src-tauri/tauri.dev.conf.json"], {
  stdio: "inherit",
  shell: true,
});

child.on("exit", (code) => process.exit(code ?? 0));
