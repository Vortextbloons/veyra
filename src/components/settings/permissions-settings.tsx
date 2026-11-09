import { useEffect, useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Toggle } from "@/components/toggle";
import { getProviderAdapter } from "@/lib/providers";
import { useProviderStore } from "@/stores/provider-store";
import { useSettingsStore } from "@/stores/settings-store";
import { usePermissionStore } from "@/modules/permissions/permission-store";
import {
  MCP_PROTECTED_CAPABILITY_ID,
  PERMISSION_TOOL_CATALOGUE,
  TOGGLEABLE_NATIVE_TOOLS,
  permissionModeDescription,
  permissionModeLabel,
} from "@/modules/permissions/permission-policy";
import type { PermissionMode } from "@/stores/slices/permissions-slice";
import {
  settingsButtonClass,
  SettingRow,
  SettingsCallout,
  SettingsCard,
  SettingsHeader,
  SettingsPanel,
  SettingsRows,
  settingsInputClass,
} from "./settings-ui";

const MODE_ORDER: PermissionMode[] = ["ask", "auto", "full"];

/** Copy for the built-in tools that have a global switch. */
const NATIVE_TOOL_SETTINGS_LABEL: Record<string, string> = {
  bash: "Bash commands",
};

const NATIVE_TOOL_SETTINGS_DESCRIPTION: Record<string, string> = {
  bash: "Run shell commands inside an attached project. Protected by the gate above by default.",
};

export function PermissionsSettings() {
  const permissionMode = useSettingsStore((state) => state.permissionMode);
  const setPermissionMode = useSettingsStore((state) => state.setPermissionMode);
  const protectedToolIds = useSettingsStore((state) => state.protectedToolIds);
  const setProtectedToolIds = useSettingsStore((state) => state.setProtectedToolIds);
  const autoReviewProviderId = useSettingsStore((state) => state.autoReviewProviderId);
  const autoReviewModelId = useSettingsStore((state) => state.autoReviewModelId);
  const setAutoReviewReviewer = useSettingsStore((state) => state.setAutoReviewReviewer);
  const disabledNativeToolIds = useSettingsStore((state) => state.disabledNativeToolIds);
  const setNativeToolEnabled = useSettingsStore((state) => state.setNativeToolEnabled);
  const history = usePermissionStore((state) => state.history);
  const clearHistory = usePermissionStore((state) => state.clearHistory);
  const providers = useProviderStore((state) => state.providers);
  const selectedProvider = useProviderStore((state) => state.selectedProvider);
  const selectedModel = useProviderStore((state) => state.selectedModel);
  const models = useProviderStore((state) => state.models);

  // Reviewer models are read once per provider change; the reviewer never
  // shares the chat's session, but it does use Veyra's provider adapters.
  const [loadedReviewer, setLoadedReviewer] = useState<{
    providerId: string;
    models: string[];
    error: string | null;
  }>({ providerId: "", models: [], error: null });

  // Derived, not stored: the provider may already be connected, in which case
  // the chat's own model list is authoritative and nothing needs fetching.
  const reviewerProviderReady = Boolean(autoReviewProviderId) && Boolean(getProviderAdapter(autoReviewProviderId));
  const useChatModels = reviewerProviderReady
    && useProviderStore.getState().selectedProvider === autoReviewProviderId;

  useEffect(() => {
    if (!reviewerProviderReady || useChatModels) return;
    const adapter = getProviderAdapter(autoReviewProviderId);
    if (!adapter) return;
    let cancelled = false;
    adapter.fetchModels()
      .then((fetched) => {
        if (cancelled) return;
        setLoadedReviewer({ providerId: autoReviewProviderId, models: fetched.map((model) => model.id), error: null });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadedReviewer({
          providerId: autoReviewProviderId,
          models: [],
          error: error instanceof Error ? error.message : "Could not list models for this provider.",
        });
      });
    return () => { cancelled = true; };
  }, [autoReviewProviderId, reviewerProviderReady, useChatModels]);

  // Derive from the loaded provider so a stale list is never offered.
  const reviewerModels = useChatModels
    ? models.map((model) => model.id)
    : loadedReviewer.providerId === autoReviewProviderId
      ? loadedReviewer.models
      : [];
  const reviewerError = !autoReviewProviderId
    ? null
    : !reviewerProviderReady
      ? "This provider is no longer configured."
      : useChatModels
        ? null
        : loadedReviewer.providerId === autoReviewProviderId
          ? loadedReviewer.error
          : null;
  const loadingModels = reviewerProviderReady && !useChatModels
    && loadedReviewer.providerId !== autoReviewProviderId;

  const reviewerReady = Boolean(autoReviewProviderId && autoReviewModelId);
  const lastDecisions = useMemo(() => history.slice(0, 8), [history]);

  return (
    <div className="space-y-8">
      <SettingsHeader
        title="Permissions"
        description="Which tool calls must be cleared before they run. Bash is protected by default because it can run any command with this app's own permissions."
      />

      <SettingsPanel
        title="Default mode"
        description="Applies to new chats. Each chat can switch modes next to its composer."
      >
        <SettingsCard>
          <SettingsRows>
            {MODE_ORDER.map((mode) => {
              const selected = mode === permissionMode;
              return (
                <SettingRow key={mode} label={permissionModeLabel(mode)} description={permissionModeDescription(mode)}>
                  <label className="inline-flex cursor-pointer items-center gap-2 text-[12px] text-[var(--color-text-dim)]">
                    <input
                      type="radio"
                      name="default-permission-mode"
                      value={mode}
                      checked={selected}
                      onChange={() => setPermissionMode(mode)}
                      className="size-3.5 accent-[var(--color-accent)]"
                    />
                    <span>{selected ? "Selected" : "Use"}</span>
                  </label>
                </SettingRow>
              );
            })}
          </SettingsRows>
        </SettingsCard>
        {permissionMode === "full" && (
          <div className="mt-3">
            <SettingsCallout tone="warning" title="Full access runs protected tools immediately">
              Disabled tools and MCP capability approvals still apply, so this does not grant a capability
              you turned off. Approval requests already waiting in a chat are cleared when you switch it to
              Full access.
            </SettingsCallout>
          </div>
        )}
      </SettingsPanel>

      <SettingsPanel
        title="Built-in tools"
        description="Tools Pi ships with. Turning one off removes it from every chat, and no permission mode can turn it back on."
      >
        <SettingsCard>
          <SettingsRows>
            {TOGGLEABLE_NATIVE_TOOLS.map((toolId) => {
              const enabled = !disabledNativeToolIds.includes(toolId);
              return (
                <SettingRow
                  key={toolId}
                  label={NATIVE_TOOL_SETTINGS_LABEL[toolId] ?? toolId}
                  description={NATIVE_TOOL_SETTINGS_DESCRIPTION[toolId] ?? ""}
                >
                  <Toggle
                    ariaLabel={NATIVE_TOOL_SETTINGS_LABEL[toolId] ?? toolId}
                    on={enabled}
                    onChange={(next) => setNativeToolEnabled(toolId, next)}
                  />
                </SettingRow>
              );
            })}
          </SettingsRows>
        </SettingsCard>
        <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--color-text-dim)]">
          This is the default for new chats. Each chat can switch Bash off for itself from the control next
          to its composer; a chat cannot switch on a tool that is off here.
        </p>
        {disabledNativeToolIds.includes("bash") && (
          <div className="mt-3">
            <SettingsCallout tone="warning" title="Bash is off everywhere">
              The assistant will not offer shell commands in any chat. Re-enable it above to let it run
              commands in a project.
            </SettingsCallout>
          </div>
        )}
      </SettingsPanel>

      <SettingsPanel
        title="Protected tools"
        description="Only the tools selected here pass through the permission gate. Everything else runs as before."
      >
        <SettingsCard>
          <SettingsRows>
            {PERMISSION_TOOL_CATALOGUE.map((tool) => {
              const checked = protectedToolIds.includes(tool.id);
              return (
                <SettingRow key={tool.id} label={tool.label} description={tool.description} className="py-3.5">
                  <input
                    type="checkbox"
                    aria-label={tool.label}
                    checked={checked}
                    onChange={(event) => {
                      const next = event.target.checked
                        ? [...protectedToolIds, tool.id]
                        : protectedToolIds.filter((id) => id !== tool.id);
                      setProtectedToolIds(next);
                    }}
                    className="size-4 accent-[var(--color-accent)]"
                  />
                </SettingRow>
              );
            })}
          </SettingsRows>
        </SettingsCard>
        <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--color-text-dim)]">
          The MCP entry covers every MCP-backed tool ({MCP_PROTECTED_CAPABILITY_ID}__*) without listing each
          server. Native file tools only exist while a project folder is attached.
        </p>
      </SettingsPanel>

      <SettingsPanel
        title="Auto reviewer"
        description="Auto asks a separate model to allow or deny each protected call. The reviewer gets only the tool name, its exact arguments, and the working directory."
      >
        <SettingsCard>
          <SettingsRows>
            <SettingRow label="Reviewer provider" description="Uses Veyra's existing provider configuration." stack>
              <select
                aria-label="Reviewer provider"
                value={autoReviewProviderId}
                onChange={(event) => {
                  const next = event.target.value;
                  setAutoReviewReviewer(next, "");
                }}
                className={settingsInputClass}
              >
                <option value="">Not configured — Auto asks you instead</option>
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                    {provider.status === "connected" ? "" : " (disconnected)"}
                  </option>
                ))}
              </select>
            </SettingRow>
            <SettingRow label="Reviewer model" description="A small, reliable model is usually enough for single calls." stack>
              {reviewerModels.length > 0 ? (
                <select
                  aria-label="Reviewer model"
                  value={autoReviewModelId}
                  onChange={(event) => setAutoReviewReviewer(autoReviewProviderId, event.target.value)}
                  className={settingsInputClass}
                >
                  <option value="">Choose a model</option>
                  {reviewerModels.map((model) => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>
              ) : (
                <input
                  aria-label="Reviewer model"
                  value={autoReviewModelId}
                  placeholder={loadingModels ? "Loading models…" : "Model id"}
                  onChange={(event) => setAutoReviewReviewer(autoReviewProviderId, event.target.value)}
                  className={settingsInputClass}
                />
              )}
            </SettingRow>
          </SettingsRows>
        </SettingsCard>

        {reviewerError && (
          <div className="mt-3">
            <SettingsCallout tone="warning" title="Reviewer models unavailable">{reviewerError}</SettingsCallout>
          </div>
        )}

        {!reviewerReady && (
          <div className="mt-3">
            <SettingsCallout tone="warning" title="Auto has no reviewer yet">
              Until a reviewer is chosen, every Auto call waits for your decision. It never runs unreviewed.
            </SettingsCallout>
          </div>
        )}

        <div className="mt-3 rounded-lg border border-[var(--color-border)] bg-white/[0.02] px-4 py-3">
          <p className="text-[12px] font-medium text-white">What the reviewer sees</p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--color-text-dim)]">
            A fixed review policy, the tool name, the exact arguments or command, and the execution
            metadata (working directory, and the shell for Bash). It never receives conversation history,
            your messages, the assistant's reasoning, earlier tool output, project files, Skills, or memory.
            It has no tools and cannot execute anything, and its output must be a structured decision with
            one short reason. Command text is treated as untrusted data.
          </p>
          {selectedProvider && autoReviewProviderId === selectedProvider && (
            <p className="mt-2 text-[11px] text-[var(--color-text-dim)]/80">
              The reviewer is a separate request from your chat. Using {getProviderAdapter(selectedProvider)?.name ?? selectedProvider} here means
              the command details leave this machine exactly as they would from the chat itself.
            </p>
          )}
          {autoReviewProviderId && autoReviewProviderId !== "lm-studio" && (
            <p className="mt-2 text-[11px] leading-relaxed text-amber-200/85">
              Command text and arguments are sent to {getProviderAdapter(autoReviewProviderId)?.name ?? autoReviewProviderId} for this decision.
              Choose LM Studio to keep the review on this machine.
            </p>
          )}
          {!autoReviewProviderId && selectedModel && (
            <button
              type="button"
              className={`mt-2 ${settingsButtonClass}`}
              onClick={() => setAutoReviewReviewer(selectedProvider, selectedModel)}
            >
              Use the chat's current provider and model
            </button>
          )}
        </div>
      </SettingsPanel>

      <SettingsPanel
        title="Recent decisions"
        description="A local record of what was allowed or denied. Command text and tool arguments are never stored here."
        actions={history.length > 0 ? (
          <button type="button" className={settingsButtonClass} onClick={clearHistory}>Clear</button>
        ) : undefined}
      >
        <SettingsCard>
          {lastDecisions.length === 0 ? (
            <p className="px-5 py-6 text-center text-[12px] text-[var(--color-text-dim)]">
              No decisions yet. Protected calls appear here after a chat asks for one.
            </p>
          ) : (
            <SettingsRows>
              {lastDecisions.map((decision) => (
                <div key={decision.id} className="flex items-start gap-3 px-5 py-3">
                  <ShieldCheck
                    aria-hidden
                    className={`mt-0.5 size-3.5 shrink-0 ${
                      decision.outcome === "allow" ? "text-emerald-300" : "text-rose-300"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] text-white">
                      {decision.outcome === "allow" ? "Allowed" : "Denied"} {" "}
                      <span className="font-mono text-[11.5px] text-[var(--color-text-dim)]">{decision.toolName}</span>
                      {" · "}
                      <span className="text-[11.5px] text-[var(--color-text-dim)]">{decision.source}</span>
                    </p>
                    {decision.reason && (
                      <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-[var(--color-text-dim)]">
                        {decision.reason}
                      </p>
                    )}
                    <p className="mt-0.5 font-mono text-[10px] text-[var(--color-text-dim)]/70">
                      {new Date(decision.at).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </SettingsRows>
          )}
        </SettingsCard>
      </SettingsPanel>
    </div>
  );
}

/** Exposed for the settings page tab list. */
export const PERMISSIONS_SETTINGS_ICON = ShieldCheck;
