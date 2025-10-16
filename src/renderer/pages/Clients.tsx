import React, { useEffect, useMemo, useState } from 'react';
import { differenceInCalendarDays, format, isBefore, parseISO, setYear, startOfDay } from 'date-fns';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Calendar, Filter, Gift, Search, TrendingUp, Users } from 'lucide-react';
import { fetchClients, fetchClientSalesStats } from '../services/clientsService';
import { Client, ClientSalesStat } from '../types';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/ToastProvider';

const sortOptions = [
  { value: 'name', label: 'За іменем' },
  { value: 'orders', label: 'За кількістю замовлень' },
  { value: 'recent', label: 'За останнім замовленням' },
  { value: 'birthday', label: 'Найближчі дні народження' }
] as const;

type SortOption = (typeof sortOptions)[number]['value'];

type UpcomingBirthday = {
  client: Client;
  daysUntil: number;
  nextDate: Date;
};

const getDaysUntilBirthday = (birthDate?: string | null) => {
  if (!birthDate) return Number.POSITIVE_INFINITY;
  try {
    const birth = parseISO(birthDate);
    const today = startOfDay(new Date());
    let next = setYear(birth, today.getFullYear());
    if (isBefore(next, today)) {
      next = setYear(next, next.getFullYear() + 1);
    }
    return differenceInCalendarDays(next, today);
  } catch (error) {
    return Number.POSITIVE_INFINITY;
  }
};

const formatPhoneDisplay = (value?: string | null) => {
  if (!value) return '';
  const digits = value.replace(/\D/g, '');
  if (digits.length === 0) {
    return value;
  }
  if (digits.length === 12 && digits.startsWith('38')) {
    return `+${digits}`;
  }
  if (digits.length === 10) {
    return `+38${digits}`;
  }
  if (value.startsWith('+')) {
    return value;
  }
  return `+${digits}`;
};

const formatBirthDate = (value?: string | null) => {
  if (!value) return '';
  try {
    return format(parseISO(value), 'dd MMM');
  } catch (error) {
    return '';
  }
};

const ClientsPage: React.FC = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [stats, setStats] = useState<ClientSalesStat[]>([]);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('name');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [statsLoading, setStatsLoading] = useState(false);
  const { showToast } = useToast();

  const loadClients = async () => {
    try {
      const data = await fetchClients();
      setClients(data);
    } catch (error: any) {
      showToast({
        title: 'Не вдалося завантажити клієнтів',
        description: error?.message ?? 'Перевірте налаштування підключення до БД',
        type: 'error'
      });
    }
  };

  const loadStats = async (filters?: { startDate?: string; endDate?: string }) => {
    try {
      setStatsLoading(true);
      const data = await fetchClientSalesStats(filters ?? {});
      setStats(data);
    } catch (error: any) {
      showToast({
        title: 'Не вдалося завантажити звіт',
        description: error?.message ?? 'Спробуйте оновити сторінку пізніше',
        type: 'error'
      });
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    loadClients();
    loadStats();
  }, []);

  const filteredClients = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const digitsSearch = search.replace(/\D/g, '');
    const hasSearch = normalizedSearch.length > 0 || digitsSearch.length > 0;

    const filtered = clients.filter((client) => {
      if (!hasSearch) return true;
      const fullName = `${client.firstName} ${client.lastName ?? ''}`.toLowerCase();
      const instagram = (client.instagram ?? '').toLowerCase();
      const phone = client.phone ?? '';
      return (
        fullName.includes(normalizedSearch) ||
        instagram.includes(normalizedSearch) ||
        (digitsSearch.length >= 3 && phone.includes(digitsSearch))
      );
    });

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (sortBy) {
        case 'orders':
          return b.totalOrders - a.totalOrders;
        case 'recent': {
          const dateA = a.lastOrderAt ? new Date(a.lastOrderAt).getTime() : 0;
          const dateB = b.lastOrderAt ? new Date(b.lastOrderAt).getTime() : 0;
          return dateB - dateA;
        }
        case 'birthday': {
          const daysA = getDaysUntilBirthday(a.birthDate);
          const daysB = getDaysUntilBirthday(b.birthDate);
          return daysA - daysB;
        }
        case 'name':
        default: {
          const nameA = `${a.firstName} ${a.lastName ?? ''}`.trim().toLowerCase();
          const nameB = `${b.firstName} ${b.lastName ?? ''}`.trim().toLowerCase();
          return nameA.localeCompare(nameB, 'uk');
        }
      }
    });

    return sorted;
  }, [clients, search, sortBy]);

  const upcomingBirthdays = useMemo<UpcomingBirthday[]>(() => {
    return clients
      .map((client) => {
        const daysUntil = getDaysUntilBirthday(client.birthDate);
        if (!client.birthDate || daysUntil === Number.POSITIVE_INFINITY || daysUntil > 45) {
          return null;
        }
        const birth = parseISO(client.birthDate);
        const today = startOfDay(new Date());
        let next = setYear(birth, today.getFullYear());
        if (isBefore(next, today)) {
          next = setYear(next, next.getFullYear() + 1);
        }
        return { client, daysUntil, nextDate: next } as UpcomingBirthday;
      })
      .filter(Boolean)
      .sort((a, b) => (a!.daysUntil > b!.daysUntil ? 1 : -1))
      .slice(0, 5) as UpcomingBirthday[];
  }, [clients]);

  const statsSummary = useMemo(() => {
    return stats.reduce(
      (acc, stat) => {
        acc.orders += stat.orders;
        acc.revenue += stat.revenue;
        return acc;
      },
      { orders: 0, revenue: 0 }
    );
  }, [stats]);

  const overviewSummary = useMemo(() => {
    const totalRevenue = clients.reduce((acc, client) => acc + client.completedRevenue, 0);
    const totalOrders = clients.reduce((acc, client) => acc + client.totalOrders, 0);
    const birthdaysSoon = clients.filter((client) => getDaysUntilBirthday(client.birthDate) <= 30).length;
    return {
      clients: clients.length,
      orders: totalOrders,
      revenue: totalRevenue,
      birthdaysSoon
    };
  }, [clients]);

  const handleStatsSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await loadStats({
      startDate: startDate || undefined,
      endDate: endDate || undefined
    });
  };

  const resetFilters = () => {
    setStartDate('');
    setEndDate('');
    void loadStats();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Users}
        title="Клієнти"
        description="Актуальний реєстр клієнтів, продажі за період та найближчі дні народження."
      />

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-3xl bg-white/80 p-5 shadow-lg">
          <p className="text-xs uppercase tracking-wide text-slate-400">Клієнтів</p>
          <p className="mt-2 text-2xl font-semibold text-slate-800">{overviewSummary.clients}</p>
        </div>
        <div className="rounded-3xl bg-white/80 p-5 shadow-lg">
          <p className="text-xs uppercase tracking-wide text-slate-400">Замовлень</p>
          <p className="mt-2 text-2xl font-semibold text-slate-800">{overviewSummary.orders}</p>
        </div>
        <div className="rounded-3xl bg-white/80 p-5 shadow-lg">
          <p className="text-xs uppercase tracking-wide text-slate-400">Виручка</p>
          <p className="mt-2 text-2xl font-semibold text-slate-800">{overviewSummary.revenue.toLocaleString()} ₴</p>
        </div>
        <div className="rounded-3xl bg-gradient-to-br from-pink-100 via-purple-100 to-indigo-100 p-5 shadow-lg">
          <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-purple-500">
            <Gift className="h-4 w-4" /> Дні народження ≤ 30 днів
          </p>
          <p className="mt-2 text-2xl font-semibold text-purple-700">{overviewSummary.birthdaysSoon}</p>
        </div>
      </div>

      <div className="rounded-3xl bg-white/80 p-6 shadow-xl backdrop-blur">
        <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
          <label className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm focus-within:border-purple-400 focus-within:ring-2 focus-within:ring-purple-200">
            <Search className="h-4 w-4 text-purple-500" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Пошук за ім'ям, Instagram чи телефоном"
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>
          <label className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm focus-within:border-purple-400 focus-within:ring-2 focus-within:ring-purple-200">
            <Filter className="h-4 w-4 text-purple-500" />
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as SortOption)}
              className="w-full bg-transparent text-sm outline-none"
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Клієнт</th>
                <th className="px-4 py-3 text-left">Контакти</th>
                <th className="px-4 py-3 text-left">День народження</th>
                <th className="px-4 py-3 text-left">Замовлення</th>
                <th className="px-4 py-3 text-left">Виручка</th>
                <th className="px-4 py-3 text-left">Останнє замовлення</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredClients.map((client) => (
                <tr key={client.id} className="transition hover:bg-purple-50/40">
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="font-medium text-slate-800">
                        {client.firstName}
                        {client.lastName ? ` ${client.lastName}` : ''}
                      </span>
                      {client.instagram && <span className="text-xs text-purple-500">@{client.instagram}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {client.phone ? formatPhoneDisplay(client.phone) : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {client.birthDate ? formatBirthDate(client.birthDate) : '—'}
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-800">{client.totalOrders}</td>
                  <td className="px-4 py-3 font-semibold text-slate-800">{client.completedRevenue.toLocaleString()} ₴</td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {client.lastOrderAt ? format(new Date(client.lastOrderAt), 'dd.MM.yyyy') : '—'}
                  </td>
                </tr>
              ))}
              {filteredClients.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                    Клієнтів за запитом не знайдено.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-3xl bg-white/80 p-6 shadow-xl backdrop-blur">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-800">Продажі за датами</h3>
              <p className="text-xs text-slate-500">Кількість виконаних замовлень та виручка за обраний період</p>
            </div>
            <TrendingUp className="h-5 w-5 text-purple-500" />
          </div>

          <form className="mt-4 grid gap-3 md:grid-cols-[repeat(3,minmax(0,1fr))_auto]" onSubmit={handleStatsSubmit}>
            <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus-within:border-purple-400 focus-within:ring-2 focus-within:ring-purple-200">
              <Calendar className="h-4 w-4 text-purple-500" />
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="w-full bg-transparent outline-none"
              />
            </label>
            <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus-within:border-purple-400 focus-within:ring-2 focus-within:ring-purple-200">
              <Calendar className="h-4 w-4 text-purple-500" />
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                className="w-full bg-transparent outline-none"
              />
            </label>
            <button
              type="submit"
              className="rounded-2xl bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:shadow-2xl"
            >
              Застосувати
            </button>
            <button
              type="button"
              onClick={resetFilters}
              className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-purple-300 hover:text-purple-600"
            >
              Скинути
            </button>
          </form>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-purple-50/60 p-4 text-sm text-purple-700">
              <p className="text-xs uppercase tracking-wide text-purple-500">Замовлень</p>
              <p className="mt-1 text-2xl font-semibold">{statsSummary.orders}</p>
            </div>
            <div className="rounded-2xl bg-purple-50/60 p-4 text-sm text-purple-700">
              <p className="text-xs uppercase tracking-wide text-purple-500">Виручка</p>
              <p className="mt-1 text-2xl font-semibold">{statsSummary.revenue.toLocaleString()} ₴</p>
            </div>
          </div>

          <div className="mt-6 h-80">
            {statsLoading ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">Завантаження...</div>
            ) : stats.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                Дані за обраний період відсутні.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 12 }} />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload || payload.length === 0) {
                        return null;
                      }
                      const datum = payload[0].payload as ClientSalesStat;
                      return (
                        <div className="rounded-2xl border border-slate-100 bg-white px-3 py-2 text-xs text-slate-600 shadow-lg">
                          <p className="font-semibold text-slate-800">{label}</p>
                          <p>Замовлення: {datum.orders}</p>
                          <p>Виручка: {datum.revenue.toLocaleString()} ₴</p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="orders" name="Замовлення" radius={[12, 12, 0, 0]} fill="#a855f7" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl bg-white/80 p-6 shadow-xl backdrop-blur">
            <h3 className="text-lg font-semibold text-slate-800">Найближчі дні народження</h3>
            <p className="text-xs text-slate-500">Плануйте персональні пропозиції та знижки</p>

            <div className="mt-4 space-y-3">
              {upcomingBirthdays.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                  Найближчих днів народження не знайдено.
                </div>
              )}

              {upcomingBirthdays.map(({ client, daysUntil, nextDate }) => (
                <div key={client.id} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
                  <div>
                    <p className="font-medium text-slate-800">
                      {client.firstName}
                      {client.lastName ? ` ${client.lastName}` : ''}
                    </p>
                    <p className="text-xs text-purple-500">{formatBirthDate(client.birthDate)}</p>
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    <p>{format(nextDate, 'dd.MM.yyyy')}</p>
                    <p>{daysUntil === 0 ? 'сьогодні' : `через ${daysUntil} дн.`}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClientsPage;
