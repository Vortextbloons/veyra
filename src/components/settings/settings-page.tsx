import { useState } from "react";
import { GeneralSettings } from "./general-settings";
import { PrivacyConnectivitySettings } from "./privacy-connectivity-settings";
import { ChatSettings } from "./chat-settings";
import { MemoriesSettings } from "./memories-settings";
import { ModelsSettings } from "./models-settings";
import { ToolsSettings } from "./tools-settings";
import { CharacterSettings } from "./character-settings";
import { ResearchSettings } from "./research-settings";
import { ExtensionsSettings } from "./extensions-settings";
type SettingsTab =
  | "general"
  | "privacy"
  | "chat"
  | "memories"
  | "models"
  | "tools"
  | "characters"
  | "research"
  | "extensions";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "privacy", label: "Privacy" },
  { id: "chat", label: "Chat" },
  { id: "memories", label: "Memories" },
  { id: "models", label: "Models" },
  { id: "tools", label: "Tools" },
  { id: "research", label: "Research" },
  { id: "characters", label: "Characters" },
  { id: "extensions", label: "Extensions" },
];

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  return (
    <main className="flex h-full min-w-0 flex-1 flex-col bg-[var(--color-bg)]">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--color-border)] px-5">
        <h1 className="text-[13px] font-semibold text-white">Settings</h1>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav aria-label="Settings sections" className="w-48 shrink-0 border-r border-[var(--color-border)] p-2 max-[900px]:w-14">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-current={activeTab === tab.id ? "page" : undefined}
              aria-label={tab.label}
              onClick={() => setActiveTab(tab.id)}
              className={`flex min-h-9 w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors max-[900px]:justify-center max-[900px]:px-2 ${
                activeTab === tab.id
                  ? "bg-[var(--color-accent-soft)] font-medium text-white"
                  : "text-[var(--color-text-dim)] hover:bg-white/[0.03] hover:text-white"
              }`}
            >
              <span className="max-[900px]:hidden">{tab.label}</span>
            </button>
          ))}
        </nav>

        <div className="settings-content flex-1 overflow-y-auto p-6 max-[900px]:p-4">
          {activeTab === "general" && <GeneralSettings />}
          {activeTab === "privacy" && <PrivacyConnectivitySettings />}
          {activeTab === "chat" && <ChatSettings />}
          {activeTab === "memories" && <MemoriesSettings />}
          {activeTab === "models" && <ModelsSettings />}
          {activeTab === "tools" && <ToolsSettings />}
          {activeTab === "research" && <ResearchSettings />}
          {activeTab === "characters" && <CharacterSettings />}
          {activeTab === "extensions" && <ExtensionsSettings />}
        </div>
      </div>
    </main>
  );
}

export default SettingsPage;
