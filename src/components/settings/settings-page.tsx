import { useState } from "react";
import { Brain, Cpu, FlaskConical, MessageCircle, Puzzle, Settings, Shield, Users, Wrench, type LucideIcon } from "lucide-react";
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

const TABS: { id: SettingsTab; label: string; icon: LucideIcon }[] = [
  { id: "general", label: "General", icon: Settings },
  { id: "privacy", label: "Privacy", icon: Shield },
  { id: "chat", label: "Chat", icon: MessageCircle },
  { id: "memories", label: "Memories", icon: Brain },
  { id: "models", label: "Models", icon: Cpu },
  { id: "tools", label: "Tools", icon: Wrench },
  { id: "research", label: "Research", icon: FlaskConical },
  { id: "characters", label: "Characters", icon: Users },
  { id: "extensions", label: "Extensions", icon: Puzzle },
];

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  return (
    <main className="flex h-full min-w-0 flex-1 flex-col bg-[var(--color-bg)]">
      <header className="flex h-16 shrink-0 items-center gap-3 px-6">
        <h1 className="text-[18px] font-medium tracking-tight text-white">Settings</h1>
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
              className={`flex min-h-10 w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-[13px] transition-colors max-[900px]:justify-center max-[900px]:px-2 ${
                activeTab === tab.id
                  ? "bg-[var(--color-accent-soft)] font-medium text-white"
                  : "text-[var(--color-text-dim)] hover:bg-white/[0.03] hover:text-white"
              }`}
            >
              <tab.icon className="size-4 shrink-0" />
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
