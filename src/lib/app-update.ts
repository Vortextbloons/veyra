import { getVersion } from "@tauri-apps/api/app";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { resolveEffectiveConnectivity } from "@/lib/connectivity/connectivity-service";
import { useConnectivityStore } from "@/stores/connectivity-store";
import { useSettingsStore } from "@/stores/settings-store";

export const GITHUB_REPO = "Vortextbloons/veyra";
export const GITHUB_RELEASES_PAGE = `https://github.com/${GITHUB_REPO}/releases`;
const GITHUB_LATEST_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

type GitHubReleaseAsset = {
  name: string;
  browser_download_url: string;
};

type GitHubReleaseResponse = {
  tag_name: string;
  name: string;
  html_url: string;
  published_at: string;
  body: string | null;
  assets: GitHubReleaseAsset[];
  draft?: boolean;
  prerelease?: boolean;
};

export type AppReleaseInfo = {
  version: string;
  tagName: string;
  name: string;
  htmlUrl: string;
  publishedAt: string;
  releaseNotes: string;
  downloadUrl: string | null;
  downloadAssetName: string | null;
};

export type UpdateCheckResult =
  | {
      status: "up-to-date";
      currentVersion: string;
      latest: AppReleaseInfo;
    }
  | {
      status: "update-available";
      currentVersion: string;
      latest: AppReleaseInfo;
    }
  | {
      status: "skipped";
      reason: string;
    }
  | {
      status: "error";
      message: string;
    };

export function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, "");
}

export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const parse = (value: string) =>
    normalizeVersion(value)
      .split(".")
      .map((part) => Number.parseInt(part, 10) || 0);

  const left = parse(a);
  const right = parse(b);
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff < 0) return -1;
    if (diff > 0) return 1;
  }

  return 0;
}

export function pickWindowsInstallerAsset(
  assets: GitHubReleaseAsset[],
): GitHubReleaseAsset | null {
  const setupExe = assets.find(
    (asset) => /\.exe$/i.test(asset.name) && /setup|install/i.test(asset.name),
  );
  if (setupExe) return setupExe;

  const anyExe = assets.find((asset) => /\.exe$/i.test(asset.name));
  if (anyExe) return anyExe;

  const msi = assets.find((asset) => /\.msi$/i.test(asset.name));
  return msi ?? null;
}

function mapRelease(payload: GitHubReleaseResponse): AppReleaseInfo {
  const asset = pickWindowsInstallerAsset(payload.assets ?? []);
  return {
    version: normalizeVersion(payload.tag_name),
    tagName: payload.tag_name,
    name: payload.name,
    htmlUrl: payload.html_url,
    publishedAt: payload.published_at,
    releaseNotes: payload.body?.trim() ?? "",
    downloadUrl: asset?.browser_download_url ?? null,
    downloadAssetName: asset?.name ?? null,
  };
}

export async function getCurrentAppVersion(): Promise<string> {
  try {
    return normalizeVersion(await getVersion());
  } catch {
    const mod = await import("../../version.json");
    return normalizeVersion(mod.version);
  }
}

export async function fetchLatestRelease(): Promise<AppReleaseInfo> {
  const response = await tauriFetch(GITHUB_LATEST_API, {
    method: "GET",
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "Veyra-Desktop",
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub releases API returned ${response.status}`);
  }

  const payload = (await response.json()) as GitHubReleaseResponse;
  if (payload.draft || payload.prerelease) {
    throw new Error("Latest release is not a stable public release.");
  }

  return mapRelease(payload);
}

function isOnlineForUpdates(): boolean {
  const { systemOnline } = useConnectivityStore.getState();
  const preference = useSettingsStore.getState().connectivityPreference;
  return resolveEffectiveConnectivity(preference, systemOnline) === "online";
}

export async function checkForAppUpdate(options?: {
  skipIfOffline?: boolean;
}): Promise<UpdateCheckResult> {
  if (options?.skipIfOffline !== false && !isOnlineForUpdates()) {
    return { status: "skipped", reason: "offline" };
  }

  try {
    const [currentVersion, latest] = await Promise.all([
      getCurrentAppVersion(),
      fetchLatestRelease(),
    ]);

    if (compareSemver(currentVersion, latest.version) >= 0) {
      return { status: "up-to-date", currentVersion, latest };
    }

    return { status: "update-available", currentVersion, latest };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: "error", message };
  }
}

export function formatReleaseDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
