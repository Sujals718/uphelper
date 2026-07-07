export function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-ink-900/50 p-6 backdrop-blur-sm ${className}`}>
      {children}
    </div>
  );
}
