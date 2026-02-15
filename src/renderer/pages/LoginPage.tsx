import React, { useState } from 'react';
import { Lock, Mail, ShieldCheck } from 'lucide-react';
import { signIn } from '../services/authService';
import { useToast } from '../components/ToastProvider';

type LoginPageProps = {
  onLoginSuccess: (user: { email: string }) => void;
};

const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('admin@lingeriedashboard.app');
  const [password, setPassword] = useState('admin123');
  const [isLoading, setIsLoading] = useState(false);
  const { showToast } = useToast();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email || !password) {
      showToast({ title: 'Перевірте поля', description: 'Email та пароль є обов\'язковими', type: 'error' });
      return;
    }

    try {
      setIsLoading(true);
      const user = await signIn(email, password);
      showToast({ title: 'Вітаємо!', description: 'Ви успішно увійшли в систему', type: 'success' });
      onLoginSuccess(user);
    } catch (error: any) {
      showToast({ title: 'Помилка входу', description: error.message ?? 'Невдала спроба входу', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-pink-100 via-purple-100 to-indigo-100 p-6">
      <div className="grid w-full max-w-5xl gap-8 rounded-3xl bg-white/70 p-10 shadow-2xl backdrop-blur-xl md:grid-cols-2">
        <div className="flex flex-col justify-between rounded-2xl bg-gradient-to-br from-pink-400 via-purple-500 to-indigo-600 p-8 text-white shadow-2xl">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-1 text-sm font-medium">
              <ShieldCheck className="h-4 w-4" />
              Захищений доступ
            </span>
            <h2 className="mt-6 text-3xl font-bold">🎁 Lingerie Brand</h2>
            <p className="mt-3 text-sm text-purple-100">Система управління для авторизованих співробітників бренду.</p>
          </div>
          <div className="rounded-2xl bg-white/10 p-5 shadow-inner backdrop-blur">
            <h3 className="text-lg font-semibold">ℹ️ Інформація</h3>
            <p className="mt-2 text-sm text-purple-100">
              Доступ тільки для авторизованих співробітників. Будь ласка, використовуйте корпоративні облікові дані.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6 rounded-2xl border border-slate-100 bg-white/80 p-8 shadow-xl">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-slate-900">Вхід до системи</h1>
            <p className="text-sm text-slate-500">Введіть корпоративний email та пароль для доступу.</p>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-600" htmlFor="email">
              Email
            </label>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm focus-within:border-purple-400 focus-within:ring-2 focus-within:ring-purple-200">
              <Mail className="h-4 w-4 text-purple-500" />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full bg-transparent text-sm outline-none"
                placeholder="you@company.com"
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-600" htmlFor="password">
              Пароль
            </label>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm focus-within:border-purple-400 focus-within:ring-2 focus-within:ring-purple-200">
              <Lock className="h-4 w-4 text-purple-500" />
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full bg-transparent text-sm outline-none"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="group flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:shadow-2xl focus:outline-none focus:ring-4 focus:ring-purple-200 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isLoading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"></span>
                Зачекайте...
              </>
            ) : (
              <>
                Увійти
                <span className="transition-transform group-hover:translate-x-1">🔐</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
