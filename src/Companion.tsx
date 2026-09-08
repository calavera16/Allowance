import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { CompanionKind } from "./insights";
import type { CustomCompanion } from "./types";
import { readCompanionGif } from "./companion-assets";

function CustomGif({ asset, size, animated }: { asset: CustomCompanion | null; size: number; animated: boolean }) {
  const [source, setSource] = useState<{ id: string; url: string } | null>(null);
  const [error, setError] = useState("");
  const still = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let canceled = false, url = "";
    setSource(null); setError("");
    if (asset) void readCompanionGif(asset.id).then(blob => {
      if (canceled) return;
      url = URL.createObjectURL(blob);
      setSource({ id: asset.id, url });
    }).catch(cause => { if (!canceled) setError(cause instanceof Error ? cause.message : "Could not load this GIF."); });
    return () => { canceled = true; if (url) URL.revokeObjectURL(url); };
  }, [asset?.id]);
  const url = source?.id === asset?.id ? source?.url : null;
  return <div className="companion companion--custom" data-animated={animated} style={{ "--custom-companion-scale": size / 64 } as CSSProperties}
    role="img" aria-label={error || asset?.name || "Choose a custom GIF"} title={error || asset?.name || "Choose a custom GIF"}>
    {url && !error ? <>
      <img className="custom-gif-animation" src={url} alt="" onError={() => setError("This GIF could not be displayed. Choose it again.")} onLoad={event => {
        const image = event.currentTarget, canvas = still.current;
        if (!canvas) return;
        canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
        canvas.getContext("2d")?.drawImage(image, 0, 0);
      }} />
      <canvas ref={still} className="custom-gif-still" aria-hidden="true" />
    </> : <span className="custom-gif-placeholder">{error ? "GIF missing" : asset ? "Loading GIF…" : "Your GIF"}</span>}
  </div>;
}

export function Companion({ kind, remaining, resetAt = 0, now = Date.now() / 1000, custom = null, size = 64, animated = true }: {
  kind: CompanionKind; remaining: number | null; resetAt?: number; now?: number;
  custom?: CustomCompanion | null; size?: number; animated?: boolean;
}) {
  if (kind === "none") return null;
  if (kind === "custom") return <CustomGif asset={custom} size={size} animated={animated} />;
  const mood = remaining === null ? "waiting" : now - resetAt < 60 ? "waking" : remaining <= 10 ? "sleeping" : remaining <= 30 ? "tired" : "happy";
  const asleep = mood === "sleeping" || mood === "waiting";
  const label = { waiting: "Waiting for fresh usage", waking: "A fresh allowance!", sleeping: "Resting until reset", tired: "Taking it slowly", happy: "Ready to code" }[mood];
  return <div className={`companion companion--${mood}`} role="img" aria-label={`${kind}: ${label}`} title={label}>
    <svg viewBox="0 0 100 100" fill="none" aria-hidden="true">
      <ellipse cx="50" cy="89" rx="31" ry="5" fill="currentColor" opacity=".12" />
      <g className="companion__body" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        {kind === "cat" && <>
          <path d="M72 78c24 0 23-24 13-24" /><path d="M22 44 20 17 39 30Q50 25 61 30L80 17 78 44Q86 84 50 85 14 84 22 44Z" fill="currentColor" fillOpacity=".13" />
          <path d="m26 51-12-3m12 11-12 2m60-10 12-3M74 59l12 2" opacity=".6" />
        </>}
        {kind === "robot" && <>
          <path d="M50 28V17m-25 33h-7v17h7m50-17h7v17h-7M39 82v5m22-5v5" /><circle cx="50" cy="12" r="4" />
          <rect x="25" y="29" width="50" height="53" rx="14" fill="currentColor" fillOpacity=".13" />
          <path d="M40 74h20" opacity=".4" />
        </>}
        {kind === "plant" && <>
          <path d="M50 51V28C30 29 23 14 27 13 43 10 50 24 50 28 50 13 64 9 76 13 76 28 64 34 50 34" fill="currentColor" fillOpacity=".2" />
          <path d="M25 45h50l-7 38H32Z" fill="currentColor" fillOpacity=".13" />
        </>}
        {asleep ? <path d="m35 55 7 2 4-2m10 0 4 2 7-2" /> : <><path d="M40 51v6m20-6v6" /><path d={mood === "tired" ? "M46 66h8" : "M44 63q6 7 12 0"} /></>}
      </g>
      {asleep && <text x="77" y="24" fill="currentColor" stroke="none" fontSize="15">z</text>}
      {mood === "waking" && <path d="m12 24 2-6 2 6 6 2-6 2-2 6-2-6-6-2Z" fill="currentColor" />}
    </svg>
  </div>;
}
