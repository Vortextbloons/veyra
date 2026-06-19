export type FetchStatus =
  | "ok"
  | "timeout"
  | "http"
  | "extraction"
  | "network"
  | "ssrf_blocked"
  | "too_large"
  | "unsupported"
  | "invalid_url";
