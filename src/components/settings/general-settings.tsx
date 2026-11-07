import { useCallback, useEffect, useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { Toggle } from "@/components/toggle";
import { useSettingsStore } from "@/stores/settings-store";
import {
  getUiScale,
  setUiScale,
  UI_SCALE_DEFAULT,
  UI_SCALE_MAX,
  UI_SCALE_MIN,
} from "@/lib/ui-scale";
import { AboutUpdateSettings } from "./about-update-settings";
import {
  SettingRow,
  SettingsCard,
  SettingsHeader,
  SettingsPanel,
  SettingsRows,
  SettingValue,
  settingsButtonClass,
} from "./settings-ui";

const SCALE_STEP = 0.1;

export function GeneralSettings() {
  const recentChatsCollapsed = useSettingsStore((s) => s.recentChatsCollapsed);
  const setRecentChatsCollapsed = useSettingsStore((s) => s.setRecentChatsCollapsed);

  const [scale, setScale] = useState(() => getUiScale());

  useEffect(() => {
    setScale(getUiScale());
  }, []);

  const applyScale = useCallback(async (next: number) => {
    const clamped = Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, next));
    const rounded = Math.round(clamped * 100) / 100;
    setScale(rounded);
    await setUiScale(rounded);
  }, []);

  return (
    <div className="space-y-8">
      <SettingsHeader
        title="General"
        description="Appearance, layout, and application updates."
      />

      <SettingsPanel
        title="Appearance"
        description="Scaling is applied by the desktop shell, so overlays and hit targets stay aligned."
      >
        <SettingsCard>
          <SettingsRows>
            <SettingRow
              label="Interface scale"
              description="Ctrl + Plus, Ctrl + Minus, and Ctrl + 0 also change the scale. Ctrl + scroll adjusts it anywhere in the app."
            >
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-label="Zoom out"
                  onClick={() => void applyScale(scale - SCALE_STEP)}
                  disabled={scale <= UI_SCALE_MIN}
                  className={`${settingsButtonClass} size-8 p-0`}
                >
                  <Minus className="size-3.5" />
                </button>
                <SettingValue>{Math.round(scale * 100)}%</SettingValue>
                <button
                  type="button"
                  aria-label="Zoom in"
                  onClick={() => void applyScale(scale + SCALE_STEP)}
                  disabled={scale >= UI_SCALE_MAX}
                  className={`${settingsButtonClass} size-8 p-0`}
                >
                  <Plus className="size-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Reset interface scale"
                  title="Reset to 100%"
                  onClick={() => void applyScale(UI_SCALE_DEFAULT)}
                  disabled={scale === UI_SCALE_DEFAULT}
                  className={`${settingsButtonClass} size-8 p-0`}
                >
                  <RotateCcw className="size-3.5" />
                </button>
              </div>
            </SettingRow>
            <SettingRow
              label="Recent chats sidebar"
              description="Keep the conversation list open beside chat. You can still collapse it from the sidebar."
            >
              <Toggle
                ariaLabel="Recent chats sidebar"
                on={!recentChatsCollapsed}
                onChange={(on) => setRecentChatsCollapsed(!on)}
              />
            </SettingRow>
          </SettingsRows>
        </SettingsCard>
      </SettingsPanel>

      <AboutUpdateSettings />
    </div>
  );
}
