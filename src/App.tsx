import { lazy, Suspense } from "react";
const DashboardApp = lazy(() => import("./DashboardApp").then(module => ({ default: module.DashboardApp })));
const CompactApp = lazy(() => import("./CompactApp").then(module => ({ default: module.CompactApp })));
const OverlayApp = lazy(() => import("./OverlayApp").then(module => ({ default: module.OverlayApp })));
export default function App() {
  const mode = new URLSearchParams(window.location.search).get("mode");
  return <Suspense fallback={null}>{mode === "overlay" ? <OverlayApp /> : mode === "compact" ? <CompactApp /> : <DashboardApp />}</Suspense>;
}
