import { useState } from "react";
import {
  Brain,
  Cpu,
  Globe2,
  MessageCircle,
  Puzzle,
  Settings,
  Shield,
  Sparkles,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { GeneralSettings } from "./general-settings";
import { PrivacyConnectivitySettings } from "./privacy-connectivity-settings";
import { ChatSettings } from "./chat-settings";
import { ModelsSettings } from "./models-settings";
import { ToolsSettings } from "./tools-settings";
import { ExtensionsSettings } from "./extensions-settings";
import { SkillsLibrarySettings } from "./skills-library-settings";
import { MemorySettings } from "@/modules/memory/components/memory-settings";

type SettingsTab =
  | "general"
  | "chat"
  | "models"
  | "tools"
  | "skills"
  | "memory"
  | "privacy"
  | "extensions";

const TABS: { id: SettingsTab; label: string; blurb: string; icon: LucideIcon }[] = [
  { id: "general", label: "General", blurb: "Appearance, layout, and updates", icon: Settings },
  { id: "chat", label: "Chat", blurb: "Prompt, behavior, and automation", icon: MessageCircle },
  { id: "models", label: "Models", blurb: "Providers, favorites, and sampling", icon: Cpu },
  { id: "tools", label: "Tools", blurb: "Web search and page extraction", icon: Wrench },
  { id: "skills", label: "Skills", blurb: "Reusable instructions for a task", icon: Sparkles },
  { id: "memory", label: "Memory", blurb: "Facts Veyra keeps about you", icon: Brain },
  { id: "privacy", label: "Privacy", blurb: "Connectivity and data boundaries", icon: Shield },
  { id: "extensions", label: "Extensions", blurb: "MCP servers and approvals", icon: Puzzle },
];

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  return (
    <main className="flex h-full min-w-0 flex-1 flex-col bg-[var(--color-bg)]">
      <div className="flex min-h-0 flex-1">
        <nav
          aria-label="Settings sections"
          className="flex w-[228px] shrink-0 flex-col border-r border-[var(--color-border)] px-3 py-5 max-[900px]:w-[68px]"
        >
          <div className="mb-4 px-2 max-[900px]:px-0">
            <p className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-white max-[900px]:justify-center">
              <Globe2 className="hidden size-4 text-[var(--color-text-dim)] max-[900px]:block" />
              <span className="max-[900px]:hidden">Settings</span>
            </p>
          </div>
          <div className="space-y-1">
            {TABS.map((tab) => {
              const selected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  aria-current={selected ? "page" : undefined}
                  aria-label={tab.label}
                  title={tab.blurb}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex min-h-10 w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[13.5px] transition-colors max-[900px]:justify-center max-[900px]:px-2 ${
                    selected
                      ? "bg-[var(--color-accent-soft)] font-medium text-white"
                      : "text-[var(--color-text-dim)] hover:bg-white/[0.04] hover:text-white"
                  }`}
                >
                  <tab.icon
                    className={`size-[17px] shrink-0 ${
                      selected ? "text-[var(--color-accent)]" : "text-[var(--color-text-dim)]"
                    }`}
                  />
                  <span className="min-w-0 flex-1 truncate max-[900px]:hidden">{tab.label}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-auto hidden px-2.5 text-[11.5px] leading-relaxed text-[var(--color-text-dim)]/70 max-[900px]:hidden">
            Changes save automatically.
          </p>
        </nav>

        <div className="settings-content min-w-0 flex-1 overflow-y-auto">
          <div className="w-full px-8 pb-16 pt-7 max-[900px]:px-5">
            {activeTab === "general" && <GeneralSettings />}
            {activeTab === "chat" && <ChatSettings />}
            {activeTab === "models" && <ModelsSettings />}
            {activeTab === "tools" && <ToolsSettings />}
            {activeTab === "skills" && <SkillsLibrarySettings />}
            {activeTab === "memory" && <MemorySettings />}
            {activeTab === "privacy" && <PrivacyConnectivitySettings />}
            {activeTab === "extensions" && <ExtensionsSettings />}
          </div>
        </div>
      </div>
    </main>
  );
}

export default SettingsPage;
