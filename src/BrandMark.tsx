const markUrl = new URL("../assets/icon.svg", import.meta.url).href;

export function BrandMark({ large = false }: { large?: boolean }) {
  return <img className={large ? "wizard-mark" : "brand__mark"}
    src={markUrl} width={large ? 64 : 38} height={large ? 64 : 38}
    alt="" aria-hidden="true" draggable={false} />;
}

export function SettingsIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true">
    <path d="m9.5 3-.6 2.5-1.4.8L5 5.6 2.5 9.9l1.9 1.8v1.6l-1.9 1.8L5 19.4l2.5-.7 1.4.8.6 2.5h5l.6-2.5 1.4-.8 2.5.7 2.5-4.3-1.9-1.8v-1.6l1.9-1.8L19 5.6l-2.5.7-1.4-.8L14.5 3Z" transform="translate(0 -.5)" />
    <circle cx="12" cy="12" r="3" />
  </svg>;
}

export function CloseIcon() {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
    <path d="m5 5 10 10M15 5 5 15" />
  </svg>;
}
