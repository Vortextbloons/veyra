// Browser integration fixture: synthetic content, isolated storage, no model/network calls.
import { createRoot } from "react-dom/client";
import { useChatStore } from "@/stores/chat-store";
import { useSettingsStore } from "@/stores/settings-store";
import { ChatPanel } from "@/app/components/chat-panel";
import { parseStudioUpdateArguments } from "@/modules/chat/studio/studio-update-tool";
import { selectedStudioEntry } from "@/modules/chat/studio/studio-environment";
import { validateStudioRender } from "@/modules/chat/studio/studio-validator";
import { buildStudioDocument } from "@/modules/chat/studio/studio-document-builder";
import { executeStudioCallWithFeedback } from "@/modules/chat/studio/studio-runtime";
import type { StudioResponseRevision } from "@/modules/chat/studio/studio-types";
import "@/app/index.css";

const initial: Omit<StudioResponseRevision, "revision" | "createdAt"> = {
  title: "Where the budget goes", summary: "Explore the cost of each category, then change the scenario.",
  data: { labels: ["Hosting", "Tools", "Support"], values: [42, 28, 30] },
  html: '<main><header><span>PROJECT ECONOMICS</span><h1>Where the budget goes</h1><p>Select a category to explore it. Adjust the scenario to see another perspective.</p></header><section data-studio-region="chart"><div id="chart"></div></section><label>Scenario <input aria-label="Scenario" type="range" name="scenario" min="0" max="100" value="30"></label><output id="selection">Choose a category</output><input type="password" name="secret" aria-label="Secret" /></main>',
  css: 'body{background:#10121b;color:#e5e7ef;font:15px system-ui}main{max-width:960px;margin:auto;padding:48px}header span{font-size:11px;letter-spacing:.16em;color:#a9a3ff}h1{font-size:42px;letter-spacing:-.04em;font-weight:500;margin:18px 0}p{color:#9ca3b3;line-height:1.7}#chart{margin:38px 0}label{display:flex;gap:20px;align-items:center}output{display:block;margin-top:24px;color:#a9a3ff}input[type=password]{display:none}svg [role=button]:focus{outline:2px solid white;outline-offset:4px}@media(max-width:640px){main{padding:24px}h1{font-size:30px}}',
  javascript: "studio.chart('#chart',{type:'bar',labels:studio.data.labels,values:studio.data.values,onSelect:point=>document.querySelector('#selection').textContent=point.label+': '+point.value}); window.renderCount=(window.renderCount||0)+1;",
};
useSettingsStore.setState({ studioModeEnabled: true, studioPresentation: "auto" });
useChatStore.setState({ activeConversationId: "fixture", conversations: [{ id: "fixture", title: "Studio", experience: "studio", messages: [{ id: "answer", role: "assistant", content: "Explore the chart and ask a follow-up.", timestamp: 1, studioResponse: { id: "response", title: initial.title, currentRevision: 1, latestRevision: 1, revisions: [{ ...initial, revision: 1, createdAt: 1 }], status: "ready", createdAt: 1, updatedAt: 1 } }], createdAt: 1, updatedAt: 1 }] });

const harness = {
  store: useChatStore,
  commit: (javascript?: string) => useChatStore.getState().commitStudioResponseRevision("fixture", "answer", { ...initial, title: "Updated budget", ...(javascript !== undefined ? { javascript } : {}) }),
  update: (region: string, html: string) => {
    const conversation = useChatStore.getState().conversations[0];
    if (!conversation) throw new Error("Missing fixture");
    const entry = selectedStudioEntry(conversation);
    const result = parseStudioUpdateArguments({ id: "update", name: "studio_update", arguments: { base: entry?.key, region, html } }, entry);
    if (result.ok) return { parsed: result, validated: validateStudioRender(result.value) };
    return { parsed: result };
  },
  buildStudioDocument,
  run: (javascript: string) => executeStudioCallWithFeedback({ id: crypto.randomUUID(), name: "studio_render", arguments: { ...initial, javascript } }, { conversationId: "fixture", assistantMessageId: "answer" }),
  ask: () => useChatStore.setState({ streamingBuffer: { conversationId: "fixture", messageId: "answer", content: "", reasoning: "", toolStates: [{ id: "question", name: "ask_question", label: "Question", phase: "running" }], pendingQuestion: { toolCallId: "question", questions: [{ text: "Which scenario should we explore?", options: ["Baseline", "Growth"] }], answers: {} } } }),
};
declare global { interface Window { studioTest: typeof harness } }
window.studioTest = harness;

export function Preview() {
  const conversation = useChatStore((state) => state.conversations[0]);
  const buffer = useChatStore((state) => state.streamingBuffer);
  const messages = conversation?.messages.map((message) => message.id === buffer?.messageId ? { ...message, content: buffer.content, toolStates: buffer.toolStates } : message);
  return <div style={{ height: "100vh", display: "flex" }}><ChatPanel title="Studio" messages={messages} experience="studio" isStreaming={Boolean(buffer)} streamingMessageId={buffer?.messageId} onSend={() => {}} onStop={() => useChatStore.getState().clearStreamingBuffer()} /></div>;
}
createRoot(document.getElementById("root") as HTMLElement).render(<Preview />);
