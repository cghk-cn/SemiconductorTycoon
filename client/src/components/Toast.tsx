
export interface ToastMessage {
  id: string;
  message: string;
  tone: "info" | "success" | "error";
}

const TONE_STYLES: Record<ToastMessage["tone"], string> = {
  info: "border-neonBlue/50 text-neonBlue shadow-neon-blue",
  success: "border-neonGreen/50 text-neonGreen shadow-neon-green",
  error: "border-neonPink/50 text-neonPink shadow-neon-pink",
};

const TONE_ICONS: Record<ToastMessage["tone"], string> = {
  info: "ℹ️",
  success: "✅",
  error: "⚠️",
};

export const Toast = ({ toasts }: { toasts: ToastMessage[] }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${TONE_STYLES[t.tone]}`}>
          <span aria-hidden="true">{TONE_ICONS[t.tone]}</span>
          <span className="flex-1">{t.message}</span>
        </div>
      ))}
    </div>
  );
};
