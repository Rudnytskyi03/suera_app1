import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

type Toast = {
  id: string;
  title: string;
  description?: string;
  type?: 'success' | 'error' | 'info';
};

type ToastContextValue = {
  toasts: Toast[];
  showToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Date.now().toString();
      setToasts((prev) => [...prev, { ...toast, id }]);
      setTimeout(() => removeToast(id), 4000);
    },
    [removeToast]
  );

  const value = useMemo(() => ({ toasts, showToast, removeToast }), [toasts, showToast, removeToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-6 right-6 space-y-3 z-50">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`rounded-xl shadow-2xl backdrop-blur bg-white/90 border border-white/40 px-4 py-3 transition-all flex flex-col gap-1 ${
              toast.type === 'success'
                ? 'border-emerald-200'
                : toast.type === 'error'
                ? 'border-rose-200'
                : 'border-indigo-200'
            }`}
          >
            <span className="font-semibold text-slate-900">{toast.title}</span>
            {toast.description && <span className="text-sm text-slate-600">{toast.description}</span>}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}
