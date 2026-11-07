import { SettingsHeader } from "./settings-ui";
import { WebSearchSettings } from "./web-search-settings";

export function ToolsSettings() {
  return (
    <div className="space-y-8">
      <SettingsHeader
        title="Tools"
        description="What Veyra can do beyond talking: search the web and read pages. Each tool is exposed to the model only while enabled here."
      />

      <WebSearchSettings />
    </div>
  );
}
