import type {
  DashboardState,
  DiagnosticsState,
  OverlayState,
  OverlayPreferences,
  TrayState,
  UpdateState,
} from "./types";

declare global {
  interface Window {
    allowance?: {
      getDashboardState(): Promise<DashboardState>;
      getDiagnostics(): Promise<DiagnosticsState>;
      uninstallClaudeHook(): Promise<string>;
      installClaudeHook(): Promise<string>;
      notify(title: string, body: string): Promise<void>;
      getStartupEnabled(): Promise<boolean>;
      setStartupEnabled(enabled: boolean): Promise<boolean>;
      exportData(kind: "json" | "csv", content: string, suggestedName: string): Promise<{ canceled: boolean; filePath?: string }>;
      importData(): Promise<{ canceled: boolean; content?: string; filePath?: string }>;
      copyText(text: string): Promise<void>;
      checkForUpdates(): Promise<UpdateState>;
      installUpdate(): Promise<void>;
      getUpdateState(): Promise<UpdateState>;
      setTrayState(state: TrayState): Promise<void>;
      getOverlayState(): Promise<OverlayState>;
      getOverlayPreferences(): Promise<OverlayPreferences>;
      setOverlayEnabled(enabled: boolean): Promise<boolean>;
      setOverlayPreferences(preferences: Partial<Pick<OverlayPreferences, "opacity" | "locked">>): Promise<OverlayPreferences>;
      resetOverlayBounds(): Promise<OverlayPreferences>;
      beginOverlayResize(direction: "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw", point: { x: number; y: number }): Promise<boolean>;
      updateOverlayResize(point: { x: number; y: number }): Promise<boolean>;
      moveOverlay(delta: { x: number; y: number }): Promise<OverlayPreferences>;
      endOverlayResize(): Promise<OverlayPreferences>;
      openDashboard(): Promise<void>;
      closeCompact(): Promise<void>;
      onRefresh(callback: () => void): () => void;
      onDashboardState(callback: (state: DashboardState) => void): () => void;
      onUpdateState(callback: (state: UpdateState) => void): () => void;
      onOverlayState(callback: (state: OverlayState) => void): () => void;
      onOverlayPreferences(callback: (preferences: OverlayPreferences) => void): () => void;
      onOverlayToggle(callback: (enabled: boolean) => void): () => void;
      platform: string;
      appVersion: string;
    };
  }
}

export {};
