import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { OverlayPreferences, OverlayState } from "./types";
import { Companion } from "./Companion";

export type ResizeDirection =
  | "n"
  | "ne"
  | "e"
  | "se"
  | "s"
  | "sw"
  | "w"
  | "nw";

export const resizeDirections: ResizeDirection[] = [
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
  "nw",
];

export function OverlayApp() {
  const [overlay, setOverlay] = useState<OverlayState | null>(null);
  const [companionNow, setCompanionNow] = useState(Date.now() / 1000);
  useEffect(() => {
    const timer = window.setInterval(() => setCompanionNow(Date.now() / 1000), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  const [preferences, setPreferences] = useState<OverlayPreferences>({
    enabled: true,
    opacity: 0.9,
    locked: true,
    bounds: null,
  });
  const resizing = useRef(false);
  useEffect(() => {
    document.body.classList.add("overlay-body");
    void window.allowance?.getOverlayState().then(setOverlay);
    void window.allowance
      ?.getOverlayPreferences()
      .then(setPreferences);
    const removeState = window.allowance?.onOverlayState(setOverlay);
    const removePreferences =
      window.allowance?.onOverlayPreferences(setPreferences);
    return () => {
      removeState?.();
      removePreferences?.();
      document.body.classList.remove("overlay-body");
    };
  }, []);
  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!resizing.current) return;
      void window.allowance?.updateOverlayResize({
        x: event.screenX,
        y: event.screenY,
      });
    };
    const finish = () => {
      if (!resizing.current) return;
      resizing.current = false;
      void window.allowance
        ?.endOverlayResize()
        .then(setPreferences);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, []);
  const beginResize = (
    direction: ResizeDirection,
    event: ReactPointerEvent<HTMLSpanElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizing.current = true;
    void window.allowance?.beginOverlayResize(direction, {
      x: event.screenX,
      y: event.screenY,
    });
  };
  const keyboardAdjust = async (event: React.KeyboardEvent, direction?: ResizeDirection) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault(); const step = event.shiftKey ? 40 : 10;
    const delta = { x: event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0,
      y: event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0 };
    if (!window.allowance) return;
    if (direction) {
      await window.allowance.beginOverlayResize(direction, { x: 0, y: 0 });
      await window.allowance.updateOverlayResize(delta);
      setPreferences(await window.allowance.endOverlayResize());
    } else setPreferences(await window.allowance.moveOverlay(delta));
  };
  const updatePreferences = async (
    patch: Partial<Pick<OverlayPreferences, "opacity" | "locked">>,
  ) => {
    if (!window.allowance) {
      setPreferences((current) => ({ ...current, ...patch }));
      return;
    }
    setPreferences(
      await window.allowance.setOverlayPreferences(patch),
    );
  };
  const minimum = overlay?.minimumRemaining;
  const tone =
    minimum === null || minimum === undefined
      ? "waiting"
      : minimum <= 10
        ? "danger"
        : minimum <= 30
          ? "warning"
          : "healthy";
  return (
    <div
      className={
        "overlay-shell overlay-shell--" +
        tone +
        (preferences.locked ? "" : " overlay-shell--editing")
      }
    >
      {!preferences.locked && (
        <div className="overlay-edit-bar">
          <span className="overlay-drag-handle" role="button" tabIndex={0} aria-label="Move overlay with arrow keys. Hold Shift for larger steps." onKeyDown={event => void keyboardAdjust(event)}>Move overlay</span>
          <label className="overlay-opacity">
            <span>{Math.round(preferences.opacity * 100)}%</span>
            <input
              type="range"
              min={20}
              max={100}
              step={1}
              value={Math.round(preferences.opacity * 100)}
              onChange={(event) =>
                void updatePreferences({
                  opacity: Number(event.target.value) / 100,
                })
              }
              aria-label="Overlay opacity"
            />
          </label>
          <button
            type="button"
            onClick={() =>
              void updatePreferences({ locked: true })
            }
          >
            Done
          </button>
        </div>
      )}
      <div className="overlay-main">
        <div className="overlay-brand">
          {overlay?.companion && overlay.companion !== "none"
            ? <Companion kind={overlay.companion} remaining={minimum ?? null} resetAt={overlay.lastResetAt} now={companionNow}
                custom={overlay.customCompanion} size={overlay.companionSize} animated={overlay.companionAnimated} />
            : null}
          <span>Allowance</span>
        </div>
        <div className="overlay-total" aria-live="polite">
          <strong>
            {minimum === null || minimum === undefined
              ? "—"
              : Math.round(minimum) + "%"}
          </strong>
          <span>{overlay?.minimumLabel || "Minimum remaining"}</span>
        </div>
      </div>
      <div className="overlay-providers">
        {(overlay?.providers || []).map((provider, index) => (
          <span
            className={
              "overlay-provider overlay-provider--" +
              (index === 0 ? "codex" : "claude")
            }
            key={provider.name}
          >
            {provider.name}{" "}
            <strong>
              {provider.remaining === null
                ? "—"
                : Math.round(provider.remaining) + "%"}
            </strong>
          </span>
        ))}
      </div>
      {!preferences.locked && (
        <span className="overlay-resize-hint" aria-hidden="true" />
      )}
      {!preferences.locked &&
        resizeDirections.map((direction) => (
          <span
            className={
              "overlay-resize-handle overlay-resize-handle--" +
              direction
            }
            key={direction}
            onPointerDown={(event) => beginResize(direction, event)}
            role="button" tabIndex={0} aria-label={`Resize overlay ${direction}. Use arrow keys; hold Shift for larger steps.`}
            onKeyDown={event => void keyboardAdjust(event, direction)}
          />
        ))}
    </div>
  );
}
