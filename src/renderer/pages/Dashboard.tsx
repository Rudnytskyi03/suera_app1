import React, { useCallback, useMemo, useState } from 'react';
import { BarChart3, LogOut, Menu, Package, ShoppingBag, ShoppingCart, X } from 'lucide-react';
import clsx from 'clsx';
import MaterialsPage from './Materials';
import ProductsPage from './Products';
import OrdersPage from './Orders';
import ReportsPage from './Reports';

const navigation = [
  { id: 'materials', name: 'Материалы', icon: Package },
  { id: 'products', name: 'Товары', icon: ShoppingBag },
  { id: 'orders', name: 'Заказы', icon: ShoppingCart },
  { id: 'reports', name: 'Отчеты', icon: BarChart3 }
] as const;

type DashboardProps = {
  email: string;
  onLogout: () => void;
};

const Dashboard: React.FC<DashboardProps> = ({ email, onLogout }) => {
  const [activePage, setActivePage] = useState<(typeof navigation)[number]['id']>('materials');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pageKey, setPageKey] = useState(() => `${activePage}-${Date.now()}`);

  const handleNavigation = useCallback((id: (typeof navigation)[number]['id']) => {
    setActivePage(id);
    setPageKey(`${id}-${Date.now()}`);
    setSidebarOpen(false);
  }, []);

  const renderPage = useMemo(() => {
    switch (activePage) {
      case 'materials':
        return <MaterialsPage key={pageKey} />;
      case 'products':
        return <ProductsPage key={pageKey} />;
      case 'orders':
        return <OrdersPage key={pageKey} />;
      case 'reports':
        return <ReportsPage key={pageKey} />;
      default:
        return null;
    }
  }, [activePage, pageKey]);

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-pink-50 via-purple-50 to-indigo-100">
      <div className="sticky top-0 hidden min-h-screen w-72 flex-shrink-0 bg-sidebar-gradient p-6 text-white shadow-2xl md:flex md:flex-col">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-white/20 p-3 text-2xl">🎁</div>
          <div>
            <p className="text-xs uppercase tracking-widest text-white/60">Lingerie Brand</p>
            <h2 className="text-lg font-semibold">Система управления</h2>
          </div>
        </div>
        <nav className="mt-10 flex flex-1 flex-col gap-2">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = activePage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavigation(item.id)}
                className={clsx(
                  'group flex items-center gap-4 rounded-2xl px-4 py-3 text-left text-sm font-medium transition-all',
                  active
                    ? 'bg-white/20 text-white shadow-lg backdrop-blur'
                    : 'text-white/80 hover:bg-white/10 hover:text-white'
                )}
              >
                <Icon className="h-5 w-5" />
                {item.name}
              </button>
            );
          })}
        </nav>
        <div className="rounded-2xl bg-white/10 p-4 text-sm text-white/80">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-lg font-semibold">
              {email.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1">
              <p className="text-xs uppercase tracking-wide text-white/60">Користувач</p>
              <p className="text-sm font-medium text-white">{email}</p>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-white/20 px-4 py-2 text-sm font-semibold text-white shadow-inner transition hover:bg-white/30"
          >
            <LogOut className="h-4 w-4" /> Вийти
          </button>
        </div>
      </div>

      <div className="flex w-full flex-col">
        <header className="sticky top-0 z-40 border-b border-white/60 bg-white/70 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
            <div className="flex items-center gap-3 md:hidden">
              <button
                onClick={() => setSidebarOpen((prev) => !prev)}
                className="rounded-xl bg-gradient-to-br from-pink-400 via-purple-500 to-indigo-600 p-2 text-white shadow-lg"
              >
                {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
              <div>
                <p className="text-xs uppercase tracking-widest text-slate-400">Lingerie Brand</p>
                <h1 className="text-lg font-semibold text-slate-800">Система управления</h1>
              </div>
            </div>
            <div className="hidden md:flex md:flex-col">
              <span className="text-xs uppercase tracking-[0.4em] text-slate-400">Lingerie Brand</span>
              <h1 className="text-xl font-semibold text-slate-800">Панель адміністратора</h1>
            </div>
            <button
              onClick={onLogout}
              className="hidden items-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:shadow-2xl md:flex"
            >
              <LogOut className="h-4 w-4" /> Вийти
            </button>
          </div>
        </header>

        {sidebarOpen && (
          <div className="fixed inset-0 z-30 flex md:hidden">
            <div className="w-72 bg-sidebar-gradient p-6 text-white shadow-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-widest text-white/60">Lingerie Brand</p>
                  <h2 className="text-lg font-semibold">Меню</h2>
                </div>
                <button onClick={() => setSidebarOpen(false)} className="rounded-xl bg-white/20 p-2">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <nav className="mt-6 flex flex-col gap-2">
                {navigation.map((item) => {
                  const Icon = item.icon;
                  const active = activePage === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNavigation(item.id)}
                      className={clsx(
                        'flex items-center gap-4 rounded-2xl px-4 py-3 text-left text-sm font-medium transition-all',
                        active
                          ? 'bg-white/20 text-white shadow-lg backdrop-blur'
                          : 'text-white/80 hover:bg-white/10 hover:text-white'
                      )}
                    >
                      <Icon className="h-5 w-5" />
                      {item.name}
                    </button>
                  );
                })}
              </nav>
            </div>
            <div className="flex-1 bg-black/20" onClick={() => setSidebarOpen(false)} />
          </div>
        )}

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
          <div className="space-y-6">{renderPage}</div>
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
