import React, { useEffect, useState } from 'react';
import { BarChart3, TrendingUp, Trophy, Wallet } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, BarChart, Bar } from 'recharts';
import { fetchOverview } from '../services/reportsService';
import { PageHeader } from '../components/PageHeader';

const COLORS = ['#ec4899', '#9333ea', '#6366f1', '#22c55e', '#f59e0b'];

const ReportsPage: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = async () => {
    try {
      setIsLoading(true);
      const overview = await fetchOverview();
      setData(overview);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={BarChart3}
        title="Отчеты и аналитика"
        description="Відстежуйте показники бізнесу, продажі та ефективність."
      />

      {isLoading ? (
        <div className="flex justify-center rounded-3xl bg-white/80 p-10 shadow-xl">
          <div className="flex items-center gap-3">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-purple-200 border-t-purple-500" />
            <span className="text-sm text-slate-500">Завантаження аналітики...</span>
          </div>
        </div>
      ) : !data ? (
        <div className="rounded-3xl bg-white/80 p-10 text-center text-sm text-slate-500 shadow-xl">
          Не вдалося завантажити аналітику. Спробуйте пізніше.
        </div>
      ) : (
        data && (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="rounded-2xl bg-white/80 p-5 shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wide text-slate-400">Дохід</span>
                  <Wallet className="h-4 w-4 text-purple-500" />
                </div>
                <p className="mt-3 text-2xl font-semibold text-slate-900">{data.revenue.toLocaleString()} ₴</p>
              </div>
              <div className="rounded-2xl bg-white/80 p-5 shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wide text-slate-400">Замовлення</span>
                  <TrendingUp className="h-4 w-4 text-purple-500" />
                </div>
                <p className="mt-3 text-2xl font-semibold text-slate-900">
                  {data.ordersByStatus.reduce((acc: number, item: any) => acc + item.count, 0)}
                </p>
                <p className="text-xs text-slate-500">з них виконано: {data.ordersByStatus.find((item: any) => item.status === 'completed')?.count ?? 0}</p>
              </div>
              <div className="rounded-2xl bg-white/80 p-5 shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wide text-slate-400">Товари</span>
                  <Trophy className="h-4 w-4 text-purple-500" />
                </div>
                <p className="mt-3 text-2xl font-semibold text-slate-900">{data.productCount}</p>
                <p className="text-xs text-slate-500">Матеріалів: {data.materialStats.count}</p>
              </div>
              <div className="rounded-2xl bg-white/80 p-5 shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wide text-slate-400">Запаси матеріалів</span>
                  <Trophy className="h-4 w-4 text-purple-500" />
                </div>
                <p className="mt-3 text-2xl font-semibold text-slate-900">{data.materialStats.value.toLocaleString()} ₴</p>
                <p className="text-xs text-slate-500">Загальна вартість запасів</p>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-3xl bg-white/80 p-6 shadow-xl">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-800">Графік продажів</h3>
                  <span className="text-xs text-slate-400">по місяцях</span>
                </div>
                <div className="mt-4 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.salesTrend}>
                      <XAxis dataKey="period" stroke="#94a3b8" />
                      <YAxis stroke="#94a3b8" tickFormatter={(value) => `${value / 1000}k`} />
                      <Tooltip formatter={(value: number) => `${value.toLocaleString()} ₴`} />
                      <Line type="monotone" dataKey="total" stroke="#9333ea" strokeWidth={3} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-3xl bg-white/80 p-6 shadow-xl">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-800">Розподіл витрат</h3>
                </div>
                <div className="mt-4 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={data.expenseBreakdown} dataKey="value" nameKey="label" cx="50%" cy="50%" outerRadius={90}>
                        {data.expenseBreakdown.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => `${value.toLocaleString()} ₴`} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-3xl bg-white/80 p-6 shadow-xl">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-800">ТОП товари</h3>
                  <span className="text-xs text-slate-400">за кількістю продажів</span>
                </div>
                <ul className="mt-4 space-y-3">
                  {data.topProducts.map((product: any, index: number) => (
                    <li key={product.name} className="flex items-center justify-between rounded-2xl bg-purple-50/40 px-4 py-3 text-sm">
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-pink-400 via-purple-500 to-indigo-600 text-sm font-semibold text-white">
                          {index + 1}
                        </span>
                        <span className="font-medium text-slate-800">{product.name}</span>
                      </div>
                      <span className="text-sm font-semibold text-slate-700">{product.total_sales} продажів</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-3xl bg-white/80 p-6 shadow-xl">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-800">Прибутковість товарів</h3>
                </div>
                <div className="mt-4 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.profitability}>
                      <XAxis dataKey="name" stroke="#94a3b8" tick={{ fontSize: 12 }} />
                      <YAxis stroke="#94a3b8" tickFormatter={(value) => `${value / 1000}k`} />
                      <Tooltip formatter={(value: number) => `${value.toLocaleString()} ₴`} />
                      <Bar dataKey="profit" fill="#ec4899" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
};

export default ReportsPage;
