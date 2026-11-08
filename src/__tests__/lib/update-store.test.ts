import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUpdateStore } from "@/stores/update-store";
import { prepareAppUpdate, installAppUpdate, type AppReleaseInfo } from "@/lib/app-update";

vi.mock("@/lib/app-update", () => ({
  prepareAppUpdate: vi.fn(), installAppUpdate: vi.fn(),
  getCurrentAppVersion: vi.fn(), checkForAppUpdate: vi.fn(),
}));
const release: AppReleaseInfo = {
  version: "9.0.0", tagName: "v9.0.0", name: "Veyra", htmlUrl: "", publishedAt: "",
  releaseNotes: "", downloadUrl: "https://github.com/setup.exe", downloadAssetName: "setup.exe",
  sha256: "a".repeat(64),
};
beforeEach(() => {
  vi.resetAllMocks();
  useUpdateStore.setState({ downloading: false, installing: false, preparedRelease: null, installError: null });
});
describe("staged updates", () => {
  it("prepares an update without installing or restarting", async () => {
    await useUpdateStore.getState().installUpdate(release);
    expect(prepareAppUpdate).toHaveBeenCalledOnce();
    expect(installAppUpdate).not.toHaveBeenCalled();
    expect(useUpdateStore.getState().preparedRelease).toEqual(release);
    expect(useUpdateStore.getState().downloading).toBe(false);
  });
  it("allows retry after preparation fails", async () => {
    vi.mocked(prepareAppUpdate).mockRejectedValueOnce(new Error("Interrupted"));
    await expect(useUpdateStore.getState().downloadUpdate(release)).rejects.toThrow("Interrupted");
    expect(useUpdateStore.getState().installError).toBe("Interrupted");
    expect(useUpdateStore.getState().preparedRelease).toBeNull();
    await useUpdateStore.getState().downloadUpdate(release);
    expect(useUpdateStore.getState().installError).toBeNull();
    expect(useUpdateStore.getState().preparedRelease).toEqual(release);
  });
  it("prevents concurrent downloads", async () => {
    let finish!: () => void;
    vi.mocked(prepareAppUpdate).mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    const pending = useUpdateStore.getState().downloadUpdate(release);
    await useUpdateStore.getState().downloadUpdate(release);
    expect(prepareAppUpdate).toHaveBeenCalledOnce();
    finish();
    await pending;
  });
});
