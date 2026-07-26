/**
 * Conversation presentation/response expectations within normal chat.
 * Distinct from `ChatMode` (operational system).
 */
export type ConversationExperience = "standard" | "studio";

/** Identifies the conversation domain for specialized Studio integration. */
export type StudioContextMode = "chat" | "character" | "research" | "project" | "document";

export type StudioValidationIssue = {
  code: string;
  message: string;
};

export type StudioThemeFont = "system" | "mono" | "serif" | "rounded";
export type StudioThemeEffect = "none" | "glow" | "grid" | "scanlines";
export type StudioThemeIntensity = "subtle" | "balanced" | "bold";
export type StudioThemeStyles = Partial<Record<
  "window" | "header" | "messages" | "assistantMessage" | "userMessage" | "composer",
  string
>>;
export type StudioThemePalette = Partial<Pick<
  StudioTheme,
  "background" | "surface" | "panel" | "composer" | "text" | "muted" | "accent" | "border"
>>;

/** Validated host-chrome styling authored by Studio, scoped to the chat panel. */
export type StudioTheme = {
  name: string;
  background: string;
  surface: string;
  panel: string;
  composer: string;
  text: string;
  muted: string;
  accent: string;
  border: string;
  font: StudioThemeFont;
  effect: StudioThemeEffect;
  /** Validated declaration blocks applied only to fixed chat-panel regions. */
  styles?: StudioThemeStyles;
};

/** Compact model-facing direction; Veyra derives the complete safe palette. */
export type StudioThemeRequest = {
  vibe: string;
  intensity: StudioThemeIntensity;
  accent?: string;
  effect?: StudioThemeEffect;
  palette?: StudioThemePalette;
  font?: StudioThemeFont;
  styles?: StudioThemeStyles;
};

/** Message-owned Studio response status. */
export type StudioResponseStatus =
  | "generating"
  | "validating"
  | "ready"
  | "rejected"
  | "render_error";

/** Immutable validated source for one revision of a message-owned Studio response. */
export type StudioResponseRevision = {
  revision: number;
  title: string;
  html: string;
  css: string;
  /** Optional interaction code executed only inside the sandboxed Studio frame. */
  javascript?: string;
  /** Optional scoped chat-window theme activated by this revision. */
  theme?: StudioTheme;
  createdAt: number;
};

/** Studio response owned by a single assistant message. */
export type StudioResponse = {
  id: string;
  title: string;
  currentRevision: number;
  latestRevision: number;
  revisions: StudioResponseRevision[];
  status: StudioResponseStatus;
  error?: StudioValidationIssue[];
  createdAt: number;
  updatedAt: number;
};

export type StudioTransition = "none" | "fade" | "dissolve" | "slide";

export type StudioScene = {
  id: string;
  assistantMessageId: string;
  title: string;
  html: string;
  css: string;
  javascript?: string;
  caption?: string;
  transition: StudioTransition;
  lineageId: string;
  revision: number;
  createdAt: number;
};

export type StudioWorkspaceStatus = "idle" | "generating" | "validating" | "transitioning" | "rejected" | "render_error";

export type StudioWorkspace = {
  id: string;
  currentSceneId?: string;
  latestSceneId?: string;
  scenes: StudioScene[];
  status: StudioWorkspaceStatus;
  pendingAssistantMessageId?: string;
  error?: StudioValidationIssue[];
  createdAt: number;
  updatedAt: number;
};
