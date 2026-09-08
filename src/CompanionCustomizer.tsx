import { useId, useRef, useState } from "react";
import { Companion } from "./Companion";
import { importCompanionGif } from "./companion-assets";
import type { CompanionKind, InsightData } from "./insights";

export function CompanionCustomizer({ data, remaining, now, overlayEnabled, onChange, onOverlay }: {
  data: InsightData; remaining: number | null; now: number; overlayEnabled: boolean;
  onChange: (patch: Partial<InsightData>) => void; onOverlay: (enabled: boolean) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const custom = data.companion === "custom";
  const chooseGif = async (file?: File) => {
    if (!file || busy) return;
    setBusy(true); setError("");
    try {
      const asset = await importCompanionGif(file);
      onChange({ companion: "custom", customCompanion: asset });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not import this GIF."); }
    finally { setBusy(false); if (fileInput.current) fileInput.current.value = ""; }
  };
  return <article className="planning-card companion-card">
    <div><p className="eyebrow">Optional</p><h3>Desktop companion</h3><p>{custom ? "Bring any character to your desktop with a GIF." : "Choose a companion, or bring your own GIF."}</p></div>
    {data.companion !== "none" && <Companion kind={data.companion} remaining={remaining} resetAt={data.lastResetAt} now={now}
      custom={data.customCompanion} size={data.companionSize} animated={data.companionAnimated} />}
    <div className="companion-controls">
      <label>Companion<select disabled={busy} value={data.companion} onChange={e => { setError(""); onChange({ companion: e.target.value as CompanionKind }); }}>
        <option value="none">Off</option><option value="cat">Cat</option><option value="robot">Robot</option><option value="plant">Plant</option><option value="custom">Custom GIF</option>
      </select></label>
      <label className="planner-check"><input type="checkbox" checked={overlayEnabled} onChange={e => onOverlay(e.target.checked)} />Show desktop overlay</label>
    </div>
    <div className="gif-customizer">
      <input ref={fileInput} id={id} className="sr-only" type="file" accept="image/gif,.gif" aria-label="Choose companion GIF" disabled={busy} onChange={e => void chooseGif(e.target.files?.[0])} />
      <div className="gif-picker-row">
        <button className="button button--secondary" type="button" disabled={busy} onClick={() => fileInput.current?.click()}>{busy ? "Importing…" : data.customCompanion ? "Replace GIF" : "Choose GIF"}</button>
        {data.customCompanion && <button className="gif-remove" type="button" disabled={busy} onClick={() => { setError(""); onChange({ customCompanion: null, ...(custom ? { companion: "none" as const } : {}) }); }}>Remove GIF</button>}
        <span className="gif-file-name" title={data.customCompanion?.name}>{data.customCompanion?.name || "GIF · up to 20 MB"}</span>
      </div>
      {custom && data.customCompanion && <div className="gif-options">
        <label className="gif-size">Overlay size <span>{Math.round(data.companionSize / 64 * 100)}%</span><input type="range" min="40" max="96" step="4" value={data.companionSize} aria-label="Custom companion size" onChange={e => onChange({ companionSize: Number(e.target.value) })} /></label>
        <label className="planner-check"><input type="checkbox" checked={data.companionAnimated} onChange={e => onChange({ companionAnimated: e.target.checked })} />Play animation</label>
      </div>}
      {error && <p className="gif-error" role="alert">{error}</p>}
      <p className="planner-note">{custom ? "GIF size scales with the overlay. Animation and transparency are preserved; reduced motion shows a still frame." : "Imported GIFs stay on this device and travel with your JSON backups."}</p>
    </div>
  </article>;
}
