import { ReactNode } from 'react';

interface Props {
  title: string;
  value: string | number;
  icon: ReactNode;
  color: 'indigo' | 'emerald' | 'amber' | 'rose';
  subtitle?: string;
  onClick?: () => void;
  isActive?: boolean;
}

const colorMap = {
  indigo: {
    bg: 'from-brand-600/20 to-brand-800/20',
    border: 'border-brand-500/20',
    icon: 'bg-brand-500/20 text-brand-400',
    glow: 'shadow-brand-500/5',
  },
  emerald: {
    bg: 'from-emerald-600/20 to-emerald-800/20',
    border: 'border-emerald-500/20',
    icon: 'bg-emerald-500/20 text-emerald-400',
    glow: 'shadow-emerald-500/5',
  },
  amber: {
    bg: 'from-amber-600/20 to-amber-800/20',
    border: 'border-amber-500/20',
    icon: 'bg-amber-500/20 text-amber-400',
    glow: 'shadow-amber-500/5',
  },
  rose: {
    bg: 'from-rose-600/20 to-rose-800/20',
    border: 'border-rose-500/20',
    icon: 'bg-rose-500/20 text-rose-400',
    glow: 'shadow-rose-500/5',
  },
};

export default function StatsCard({ title, value, icon, color, subtitle, onClick, isActive }: Props) {
  const c = colorMap[color];

  const borderClass = isActive
    ? {
      indigo: 'border-brand-500 ring-2 ring-brand-500/20 bg-brand-600/10',
      emerald: 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-600/10',
      amber: 'border-amber-500 ring-2 ring-amber-500/20 bg-amber-600/10',
      rose: 'border-rose-500 ring-2 ring-rose-500/20 bg-rose-600/10',
    }[color]
    : c.border;

  return (
    <div
      onClick={onClick}
      className={`glass-card bg-gradient-to-br ${c.bg} border ${borderClass} p-6 shadow-lg ${c.glow} 
                  transition-all duration-300 hover:scale-[1.02] hover:shadow-xl ${onClick ? 'cursor-pointer select-none active:scale-[0.98]' : ''
        }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-400">{title}</p>
          <p className="text-3xl font-bold text-white mt-2">{value.toLocaleString()}</p>
          {subtitle && (
            <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
          )}
        </div>
        <div className={`p-3 rounded-xl ${c.icon}`}>{icon}</div>
      </div>
    </div>
  );
}
