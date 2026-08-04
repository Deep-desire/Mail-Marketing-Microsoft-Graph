interface Props {
  status: string;
  size?: 'sm' | 'md';
}

const statusColors: Record<string, string> = {
  // Contact statuses
  valid: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  invalid: 'bg-red-500/15 text-red-400 border-red-500/20',
  duplicate: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  unsubscribed: 'bg-gray-500/15 text-gray-400 border-gray-500/20',

  // Campaign statuses
  idle: 'bg-slate-500/15 text-slate-400 border-slate-500/20',
  draft: 'bg-slate-500/15 text-slate-400 border-slate-500/20',
  scheduled: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  processing: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  completed: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  failed: 'bg-red-500/15 text-red-400 border-red-500/20',

  // Recipient statuses
  pending: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  sent: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  skipped: 'bg-gray-500/15 text-gray-400 border-gray-500/20',
};

export default function StatusBadge({ status, size = 'sm' }: Props) {
  const colors = statusColors[status] || 'bg-gray-500/15 text-gray-400 border-gray-500/20';
  const sizeClass = size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm';

  return (
    <span
      className={`inline-flex items-center font-medium rounded-lg border ${colors} ${sizeClass} capitalize`}
    >
      {status === 'processing' && (
        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse-soft mr-1.5" />
      )}
      {status}
    </span>
  );
}
