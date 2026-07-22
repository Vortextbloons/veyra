import { useSettingsStore } from "@/stores/settings-store";
import { Toggle } from "@/components/toggle";

export function StudioSettingsSection() {
  const studioModeEnabled = useSettingsStore((s) => s.studioModeEnabled);
  const setStudioModeEnabled = useSettingsStore((s) => s.setStudioModeEnabled);

  return (
    <div className="space-y-3">
      <Toggle label="Enable Studio Mode" on={studioModeEnabled} onChange={setStudioModeEnabled} />
      <p className="text-[11px] text-[var(--color-text-dim)]">
        Opt-in preview for chat and character conversations. Turn this on, then use the Studio presentation
        toggle in the composer to render isolated HTML and CSS visual artifacts.
      </p>
    </div>
  );
}
