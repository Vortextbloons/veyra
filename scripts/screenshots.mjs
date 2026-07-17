import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "docs", "screenshots");
const DEV_URL = "http://localhost:1420";

const TABS = [
  { id: "chat", label: "Chat" },
  { id: "characters", label: "Characters" },
  { id: "projects", label: "Projects" },
  { id: "documents", label: "Documents" },
  { id: "research", label: "Research" },
  { id: "email", label: "Email" },
  { id: "memory", label: "Memory" },
  { id: "settings", label: "Settings" },
];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  console.log(`[screenshots] navigating to ${DEV_URL}`);
  await page.goto(DEV_URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 0.8 });
  await page.waitForTimeout(500);
  console.log("[screenshots] zoom set to 80%");

  const nav = page.locator("aside nav");

  for (const tab of TABS) {
    console.log(`[screenshots] capturing ${tab.id}`);

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);

    const btn = nav.locator(`button:has(span:text-is("${tab.label}"))`);
    await btn.click({ timeout: 5000 });
    await page.waitForTimeout(800);

    const file = join(OUT_DIR, `${tab.id}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(`[screenshots] saved ${file}`);
  }

  await browser.close();
  console.log(`[screenshots] done — ${TABS.length} screenshots in ${OUT_DIR}`);
}

main().catch((err) => {
  console.error("[screenshots] failed:", err.message);
  process.exit(1);
});
