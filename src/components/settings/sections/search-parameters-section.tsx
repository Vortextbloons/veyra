import { SettingsCard, SettingsPanel, SettingsRows, SettingRow } from "../settings-ui";
import { SliderControl } from "@/components/ui/slider-control";

interface SearchParametersSectionProps {
  webSearchMaxResults: number;
  setWebSearchMaxResults: (v: number) => void;
  webSearchContextTokenLimit: number;
  setWebSearchContextTokenLimit: (v: number) => void;
}

export function SearchParametersSection({
  webSearchMaxResults,
  setWebSearchMaxResults,
  webSearchContextTokenLimit,
  setWebSearchContextTokenLimit,
}: SearchParametersSectionProps) {
  return (
    <SettingsPanel
      title="Search parameters"
      description="How much of the web reaches the model each time it searches."
    >
      <SettingsCard>
        <SettingsRows>
          <SettingRow
            stack
            label="Results per search"
            description="Ranked results collected per search. More results widen coverage but cost time."
          >
            <SliderControl
              label="Results"
              value={webSearchMaxResults}
              onChange={setWebSearchMaxResults}
              min={1}
              max={12}
              step={1}
              formatValue={(n) => `${n}`}
            />
          </SettingRow>
          <SettingRow
            stack
            label="Result token budget"
            description="Maximum tokens of search material injected into the conversation."
          >
            <SliderControl
              label="Token budget"
              value={webSearchContextTokenLimit}
              onChange={setWebSearchContextTokenLimit}
              min={500}
              max={8000}
              step={250}
              formatValue={(n) => n.toLocaleString()}
            />
          </SettingRow>
        </SettingsRows>
      </SettingsCard>
    </SettingsPanel>
  );
}
