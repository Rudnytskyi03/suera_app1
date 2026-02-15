import { LucideIcon } from 'lucide-react';
import React from 'react';

export function PageHeader({
  icon: Icon,
  title,
  description,
  actions
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white/80 p-6 shadow-lg backdrop-blur">
      <div className="flex items-center gap-4">
        <div className="rounded-2xl bg-gradient-to-br from-pink-400 via-purple-500 to-indigo-600 p-3 text-white shadow-lg">
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          {description && <p className="text-sm text-slate-500">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}
