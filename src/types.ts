export type UsageWindow = {
  id: string;
  label: string;
  usedPercent: number;
  remainingPercent: number;
  resetsAt?: number | null;
  windowMinutes?: number | null;
};

export type CreditInfo = {
  balance?: number | null;
  hasCredits?: boolean | null;
  unlimited?: boolean | null;
};

export type ProviderState = {
  provider: "codex" | "claude";
  displayName: string;
  status: "connected" | "fallback" | "stale" | "setup-required" | string;
  source: string;
  plan?: string | null;
  version?: string | null;
  observedAt: number;
  stale: boolean;
  windows: UsageWindow[];
  credits?: CreditInfo | null;
  error?: string | null;
};

export type DashboardState = {
  providers: ProviderState[];
  refreshedAt: number;
  claudeHookInstalled: boolean;
  claudeHookCommand?: string | null;
};

export type HistoryPoint = {
  at: number;
  codex?: number;
  claude?: number;
};

export type DiagnosticItem = {
  id: string;
  label: string;
  status: "ok" | "warning" | "error" | "info";
  summary: string;
  detail?: string | null;
};

export type DiagnosticsState = {
  recentErrors?: string[];
  checkedAt: number;
  appVersion: string;
  platform: string;
  architecture: string;
  packaged: boolean;
  dataDirectory: string;
  items: DiagnosticItem[];
};

export type UpdateState = {
  status:
    | "idle"
    | "checking"
    | "available"
    | "downloading"
    | "downloaded"
    | "current"
    | "not-configured"
    | "error";
  message: string;
  version?: string | null;
  progress?: number | null;
};

export type CustomCompanion = {
  id: string;
  name: string;
  width: number;
  height: number;
  bytes: number;
};

export type TrayState = {
  profileName: string;
  minimumRemaining: number | null;
  minimumLabel?: string;
  companion?: "none" | "cat" | "robot" | "plant" | "custom";
  customCompanion?: CustomCompanion | null;
  companionSize?: number;
  companionAnimated?: boolean;
  lastResetAt?: number;
  providers: Array<{
    name: string;
    remaining: number | null;
    status: string;
  }>;
};

export type OverlayState = TrayState;

export type OverlayPreferences = {
  enabled: boolean;
  opacity: number;
  locked: boolean;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
};
