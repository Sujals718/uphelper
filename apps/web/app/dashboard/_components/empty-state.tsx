export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/10 px-6 py-16 text-center">
      <p className="font-display text-lg text-white/80">{title}</p>
      <p className="max-w-sm text-sm text-white/40">{description}</p>
      {action}
    </div>
  );
}
