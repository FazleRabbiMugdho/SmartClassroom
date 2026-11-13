import { CameraOff } from "lucide-react";

export function CameraFaultOverlay({ state, labels }: { state: "OK" | "COVERED" | "MOVED"; labels: Record<string, string> }) {
  if (state === "OK") return null;
  return (
    <div role="alert" className="absolute inset-x-0 top-0 flex items-center gap-2 bg-danger px-3 py-2 text-white">
      <CameraOff className="size-4 shrink-0" aria-hidden />
      <span className="text-sm font-semibold">{labels.cameraFault}: {state === "COVERED" ? labels.covered : labels.moved}</span>
    </div>
  );
}
