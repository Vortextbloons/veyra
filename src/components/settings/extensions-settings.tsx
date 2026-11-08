import { ShieldCheck, Trash2 } from "lucide-react";
import { useExtensionsStore } from "@/modules/extensions/extensions-store";
import { McpServerSettings } from "@/modules/extensions/components/mcp-server-settings";
import {
  EmptyState,
  SettingRow,
  SettingsCallout,
  SettingsCard,
  SettingsHeader,
  SettingsPanel,
  SettingsRows,
  settingsButtonClass,
} from "./settings-ui";

const FEATURE_FLAGS = [
  ["mcp", "MCP execution", "Any tool exposed by an MCP server."],
  ["stdio", "Local MCP servers", "Servers Veyra starts as a child process on this machine."],
  ["streamableHttp", "Remote MCP servers", "Servers reached over HTTP from a remote host."],
] as const;

/** MCP servers and capability approvals. Skills live in their own tab. */
export function ExtensionsSettings() {
  const diagnostics = useExtensionsStore((state) => state.diagnostics);
  const grants = useExtensionsStore((state) => state.grants);
  const clearDiagnostics = useExtensionsStore((state) => state.clearDiagnostics);
  const revokeGrant = useExtensionsStore((state) => state.revokeGrant);
  const featureFlags = useExtensionsStore((state) => state.featureFlags);
  const setFeatureFlag = useExtensionsStore((state) => state.setFeatureFlag);
  const activeGrants = grants.filter((grant) => !grant.revokedAt && grant.decision === "allow").length;
  const activePermissions = grants.filter((grant) => !grant.revokedAt);

  return (
    <div className="space-y-8">
      <SettingsHeader
        title="Extensions"
        description="MCP servers add tools a chat can call. Every capability stays off until you approve it."
        actions={
          <span className="rounded-full border border-[var(--color-border)] px-3 py-1 text-[12px] text-[var(--color-text-dim)]">
            {activeGrants} active {activeGrants === 1 ? "approval" : "approvals"}
          </span>
        }
      />

      <SettingsPanel
        title="Safety controls"
        description="Turning a control off removes it from new chat tool snapshots immediately."
      >
        <SettingsCard>
          <SettingsRows>
            {FEATURE_FLAGS.map(([flag, label, description]) => (
              <SettingRow key={flag} label={label} description={description} className="py-3.5">
                <input
                  type="checkbox"
                  aria-label={label}
                  checked={featureFlags[flag]}
                  onChange={(event) => setFeatureFlag(flag, event.target.checked)}
                  className="size-4 accent-[var(--color-accent)]"
                />
              </SettingRow>
            ))}
          </SettingsRows>
        </SettingsCard>
      </SettingsPanel>

      <McpServerSettings />

      <SettingsPanel
        title="Permissions"
        description="Approvals are tied to a server capability and expire automatically when that server changes."
      >
        <SettingsCard>
          {activePermissions.length === 0 ? (
            <EmptyState
              icon={<ShieldCheck className="size-5" />}
              title="No active approvals"
              description="Approvals appear here when an extension asks for a capability you allow."
            />
          ) : (
            <div className="divide-y divide-[var(--color-border)]">
              {activePermissions
                .slice()
                .reverse()
                .map((grant) => (
                  <div key={grant.id} className="flex items-center gap-3 px-5 py-3.5">
                    <span
                      className={`size-2 shrink-0 rounded-full ${
                        grant.decision === "allow" ? "bg-emerald-400" : "bg-rose-400"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] text-white">{grant.capabilityId}</p>
                      <p className="mt-0.5 text-[11.5px] text-[var(--color-text-dim)]">
                        {grant.projectId ? "This project" : grant.chatId ? "This chat" : "All chats"}
                        {" · "}
                        {grant.category.replaceAll("_", " ")}
                        {grant.expiresAt ? ` · expires ${new Date(grant.expiresAt).toLocaleString()}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => revokeGrant(grant.id)}
                      className="shrink-0 rounded-lg border border-rose-400/20 px-2.5 py-1 text-[11.5px] text-rose-200 transition-colors hover:bg-rose-400/10"
                    >
                      Revoke
                    </button>
                  </div>
                ))}
            </div>
          )}
        </SettingsCard>
      </SettingsPanel>

      {diagnostics.length > 0 && (
        <SettingsPanel
          title="Diagnostics"
          description="Redacted local errors and suggested next actions."
          actions={
            <button type="button" onClick={() => clearDiagnostics()} className={settingsButtonClass}>
              <Trash2 className="size-3.5" />
              Clear
            </button>
          }
        >
          <SettingsCard>
            <div className="divide-y divide-[var(--color-border)]">
              {diagnostics
                .slice(-5)
                .reverse()
                .map((item) => (
                  <div key={item.id} className="px-5 py-3">
                    <p className="text-[12.5px] text-amber-100">{item.message}</p>
                    {item.remediation && (
                      <p className="mt-0.5 text-[12px] text-[var(--color-text-dim)]">
                        {item.remediation}
                      </p>
                    )}
                  </div>
                ))}
            </div>
          </SettingsCard>
        </SettingsPanel>
      )}

      <SettingsCallout tone="info">
        MCP servers connect through the local host service. Tools from a server only reach a chat
        after you approve that capability.
      </SettingsCallout>
    </div>
  );
}
