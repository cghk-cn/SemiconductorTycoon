import { useEffect } from "react";

const KEYFRAMES = `
@keyframes euv-scan {
  0% { transform: translateY(0); opacity: 0.8; }
  50% { transform: translateY(-6px); opacity: 1; }
  100% { transform: translateY(0); opacity: 0.8; }
}
@keyframes euv-pulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}
@keyframes plasma-glow {
  0%, 100% { opacity: 0.4; filter: blur(2px); }
  50% { opacity: 1; filter: blur(0px); }
}
@keyframes plasma-flicker {
  0%, 100% { transform: scale(1); }
  25% { transform: scale(1.05); }
  50% { transform: scale(0.98); }
  75% { transform: scale(1.02); }
}
@keyframes bonder-tap {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}
@keyframes wafer-spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
@keyframes lot-flow {
  0% { transform: translateX(-100%); opacity: 0; }
  50% { opacity: 1; }
  100% { transform: translateX(100%); opacity: 0; }
}
`;

let injected = false;
function injectKeyframes() {
  if (injected || typeof document === "undefined") return;
  const style = document.createElement("style");
  style.textContent = KEYFRAMES;
  document.head.appendChild(style);
  injected = true;
}

export function AnimatedEquipmentIcons() {
  useEffect(() => {
    injectKeyframes();
  }, []);
  return null;
}

export function EUVScannerAnim({ size = 48 }: { size?: number }) {
  useEffect(() => injectKeyframes(), []);
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className="inline-block" aria-hidden="true">
      <rect x="8" y="10" width="32" height="28" rx="3" fill="#1a1a2e" stroke="#9d4edd" strokeWidth="1.5" />
      <circle cx="24" cy="16" r="5" fill="none" stroke="#00d4ff" strokeWidth="1.5" />
      <circle cx="24" cy="16" r="2" fill="#9d4edd" style={{ animation: "euv-pulse 1.5s ease-in-out infinite" }} />
      <rect x="22" y="22" width="4" height="12" rx="1" fill="url(#euv-beam)" style={{ animation: "euv-scan 2s ease-in-out infinite" }} />
      <defs>
        <linearGradient id="euv-beam" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9d4edd" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#00d4ff" stopOpacity="0.2" />
        </linearGradient>
      </defs>
      <rect x="6" y="38" width="36" height="4" rx="1" fill="#333" />
    </svg>
  );
}

export function EtchMachineAnim({ size = 48 }: { size?: number }) {
  useEffect(() => injectKeyframes(), []);
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className="inline-block" aria-hidden="true">
      <rect x="6" y="8" width="36" height="32" rx="4" fill="#0a0a1a" stroke="#ff6b35" strokeWidth="1.5" />
      <ellipse cx="24" cy="24" rx="12" ry="8" fill="#00ff88" opacity="0.3" style={{ animation: "plasma-glow 1.8s ease-in-out infinite" }} />
      <ellipse cx="24" cy="24" rx="8" ry="5" fill="#00d4ff" opacity="0.4" style={{ animation: "plasma-flicker 2s ease-in-out infinite" }} />
      <circle cx="24" cy="24" r="6" fill="none" stroke="#aaa" strokeWidth="1" strokeDasharray="2 2" />
      <rect x="4" y="40" width="40" height="3" rx="1" fill="#333" />
    </svg>
  );
}

export function BonderAnim({ size = 48 }: { size?: number }) {
  useEffect(() => injectKeyframes(), []);
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className="inline-block" aria-hidden="true">
      <rect x="4" y="36" width="40" height="6" rx="2" fill="#333" />
      <rect x="20" y="12" width="8" height="20" rx="2" fill="#555" style={{ animation: "bonder-tap 1.2s ease-in-out infinite", transformOrigin: "24px 32px" }} />
      <circle cx="24" cy="12" r="4" fill="#ff2e88" style={{ animation: "bonder-tap 1.2s ease-in-out infinite" }} />
      <rect x="10" y="30" width="28" height="4" rx="1" fill="#00d4ff" opacity="0.6" />
    </svg>
  );
}

export function WaferLotAnim({ size = 32 }: { size?: number }) {
  useEffect(() => injectKeyframes(), []);
  return (
    <div className="relative inline-block" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 32 32" className="inline-block" aria-hidden="true">
        <circle cx="16" cy="16" r="12" fill="none" stroke="#00d4ff" strokeWidth="1.5" />
        <circle cx="16" cy="16" r="8" fill="none" stroke="#00d4ff" strokeWidth="0.5" opacity="0.5" />
        <rect x="14" y="3" width="4" height="2" fill="#00d4ff" />
        <g style={{ animation: "wafer-spin 3s linear infinite", transformOrigin: "16px 16px" }}>
          <line x1="16" y1="4" x2="16" y2="8" stroke="#00ff88" strokeWidth="1.5" />
        </g>
      </svg>
      <div className="absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-transparent via-neonBlue to-transparent w-full" style={{ animation: "lot-flow 2s ease-in-out infinite" }} />
    </div>
  );
}

export function AnimatedEquipmentIcon({ type, size = 48 }: { type: "euv" | "etch" | "bonder" | "lot"; size?: number }) {
  useEffect(() => injectKeyframes(), []);
  switch (type) {
    case "euv":
      return <EUVScannerAnim size={size} />;
    case "etch":
      return <EtchMachineAnim size={size} />;
    case "bonder":
      return <BonderAnim size={size} />;
    case "lot":
      return <WaferLotAnim size={size} />;
    default:
      return null;
  }
}
