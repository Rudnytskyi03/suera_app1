import React, { useEffect, useMemo, useState } from 'react';
import { Activity, ArchiveRestore, Layers, PlusCircle } from 'lucide-react';
import clsx from 'clsx';
import {
  fetchFinishedHistory,
  fetchFinishedInventory,
  fetchSizeSalesStats,
  recordProduction
} from '../services/finishedGoodsService';
import { fetchProducts } from '../services/productsService';
import { FinishedBatch, FinishedComponentType, FinishedInventoryEntry, FinishedSizeStat, Product } from '../types';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/ToastProvider';

const FINISHED_COMPONENTS: FinishedComponentType[] = ['bra', 'panties', 'belt', 'garter'];

const COMPONENT_LABELS: Record<FinishedComponentType, string> = {
  bra: 'Бра',
  panties: 'Трусики',
  belt: 'Пояс',
  garter: 'Гартер'
};

type ProductionFormState = {
  productId: number;
  size: string;
  sets: number;
  producedAt: string;
  note: string;
  components: Record<FinishedComponentType, number>;
};

const defaultFormState: ProductionFormState = {
  productId: 0,
  size: '',
  sets: 0,
  producedAt: '',
  note: '',
  components: {
    bra: 0,
    panties: 0,
    belt: 0,
    garter: 0
  }
};

const FinishedGoodsPage: React.FC = () => {
  const [inventory, setInventory] = useState<FinishedInventoryEntry[]>([]);
  const [history, setHistory] = useState<FinishedBatch[]>([]);
  const [sizeStats, setSizeStats] = useState<FinishedSizeStat[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [formState, setFormState] = useState<ProductionFormState>(defaultFormState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();

  const loadData = async () => {
    const [inventoryData, historyData, statsData, productsData] = await Promise.all([
      fetchFinishedInventory(),
      fetchFinishedHistory(),
      fetchSizeSalesStats(),
      fetchProducts()
    ]);
    setInventory(inventoryData);
    setHistory(historyData);
    setSizeStats(statsData);
    setProducts(productsData);

    if (productsData.length > 0 && !formState.productId) {
      setFormState((prev) => ({ ...prev, productId: productsData[0].id }));
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inventorySummary = useMemo(() => {
    return inventory.reduce(
      (acc, entry) => {
        const totalPieces = FINISHED_COMPONENTS.reduce((sum, component) => sum + entry.components[component], 0);
        return {
          totalEntries: acc.totalEntries + 1,
          totalSets: acc.totalSets + entry.totalSets,
          totalPieces: acc.totalPieces + totalPieces
        };
      },
      { totalEntries: 0, totalSets: 0, totalPieces: 0 }
    );
  }, [inventory]);

  const handleFormChange = <K extends keyof ProductionFormState>(key: K, value: ProductionFormState[K]) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
  };

  const handleComponentChange = (component: FinishedComponentType, value: number) => {
    setFormState((prev) => ({
      ...prev,
      components: {
        ...prev.components,
        [component]: Math.max(0, value)
      }
    }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formState.productId) {
      showToast({ title: 'Оберіть товар', type: 'error' });
      return;
    }
    if (!formState.size.trim()) {
      showToast({ title: 'Вкажіть розмір', type: 'error' });
      return;
    }

    const components = { ...formState.components } as Record<FinishedComponentType, number>;
    const totalComponents = FINISHED_COMPONENTS.reduce((sum, component) => sum + (components[component] || 0), 0);

    if (totalComponents === 0) {
      showToast({ title: 'Вкажіть кількість хоча б для одного елементу', type: 'error' });
      return;
    }

    setIsSubmitting(true);
    try {
      await recordProduction({
        productId: formState.productId,
        size: formState.size,
        sets: formState.sets,
        producedAt: formState.producedAt,
        note: formState.note,
        components
      });
      showToast({ title: 'Прихід готових виробів додано', type: 'success' });
      setFormState((prev) => ({
        ...defaultFormState,
        productId: prev.productId || (products[0]?.id ?? 0)
      }));
      await loadData();
    } catch (error: any) {
      showToast({ title: 'Помилка збереження', description: error.message, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Layers}
        title="Отшиті вироби"
        description="Контролюйте склад готової продукції та оперативно додавайте нові партії."
      />

      <div className="grid gap-6 md:grid-cols-3">
        <div className="rounded-3xl bg-white/80 p-6 shadow-xl">
          <div className="text-sm font-medium text-slate-500">Загалом позицій</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{inventorySummary.totalEntries}</div>
        </div>
        <div className="rounded-3xl bg-white/80 p-6 shadow-xl">
          <div className="text-sm font-medium text-slate-500">Доступних комплектів</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{inventorySummary.totalSets}</div>
        </div>
        <div className="rounded-3xl bg-white/80 p-6 shadow-xl">
          <div className="text-sm font-medium text-slate-500">Окремих виробів</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{inventorySummary.totalPieces}</div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-4">
          <div className="rounded-3xl bg-white/80 p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-800">Склад готової продукції</h3>
              <div className="rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-600">
                {inventory.length} позицій
              </div>
            </div>
            <div className="overflow-hidden rounded-2xl border border-slate-100">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50/70 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Товар</th>
                    <th className="px-4 py-3 text-left">Розмір</th>
                    <th className="px-4 py-3 text-left">Компоненти</th>
                    <th className="px-4 py-3 text-right">Комплектів</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {inventory.map((entry) => (
                    <tr key={`${entry.productId}-${entry.size}`} className="hover:bg-purple-50/40">
                      <td className="px-4 py-3 font-medium text-slate-800">{entry.productName}</td>
                      <td className="px-4 py-3 text-slate-600">{entry.size}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        <div className="flex flex-wrap gap-2">
                          {FINISHED_COMPONENTS.map((component) => (
                            <span
                              key={component}
                              className={clsx(
                                'rounded-full px-3 py-1 text-xs font-semibold',
                                entry.components[component] > 0
                                  ? 'bg-purple-100 text-purple-700'
                                  : 'bg-slate-100 text-slate-500'
                              )}
                            >
                              {COMPONENT_LABELS[component]}: {entry.components[component]}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-800">{entry.totalSets}</td>
                    </tr>
                  ))}
                  {inventory.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-500">
                        Немає готових виробів на складі.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-3xl bg-white/80 p-6 shadow-xl">
            <div className="mb-4 flex items-center gap-3">
              <ArchiveRestore className="h-5 w-5 text-purple-500" />
              <h3 className="text-lg font-semibold text-slate-800">Останні партії</h3>
            </div>
            <div className="space-y-3">
              {history.slice(0, 6).map((batch) => (
                <div
                  key={batch.id}
                  className="rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm"
                >
                  <div className="flex items-center justify-between text-sm">
                    <div>
                      <div className="font-semibold text-slate-800">{batch.productName}</div>
                      <div className="text-xs text-slate-500">Розмір: {batch.size}</div>
                    </div>
                    <div className="text-xs text-slate-500">
                      {new Date(batch.producedAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
                    {FINISHED_COMPONENTS.map((component) => (
                      <span key={component} className="rounded-full bg-purple-50 px-3 py-1 font-semibold text-purple-600">
                        {COMPONENT_LABELS[component]}: {batch.components[component]}
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    Комплектів: <span className="font-semibold text-slate-700">{batch.sets}</span>
                    {batch.note && <span className="ml-2 text-slate-400">• {batch.note}</span>}
                  </div>
                </div>
              ))}
              {history.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center text-sm text-slate-500">
                  Історія виробництва порожня.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <form onSubmit={handleSubmit} className="space-y-4 rounded-3xl bg-white/80 p-6 shadow-xl">
            <div className="mb-2 flex items-center gap-3">
              <PlusCircle className="h-5 w-5 text-purple-500" />
              <h3 className="text-lg font-semibold text-slate-800">Додати відшиту партію</h3>
            </div>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-600">Товар</span>
              <select
                value={formState.productId}
                onChange={(event) => handleFormChange('productId', Number(event.target.value))}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
              >
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-600">Розмір</span>
                <input
                  value={formState.size}
                  onChange={(event) => handleFormChange('size', event.target.value.toUpperCase())}
                  placeholder="Наприклад: S/M або 75B"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm uppercase outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-600">Комплектів</span>
                <input
                  type="number"
                  min={0}
                  value={formState.sets}
                  onChange={(event) => handleFormChange('sets', Math.max(0, Number(event.target.value)))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
                />
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {FINISHED_COMPONENTS.map((component) => (
                <label key={component} className="space-y-1">
                  <span className="text-xs font-medium text-slate-600">{COMPONENT_LABELS[component]}</span>
                  <input
                    type="number"
                    min={0}
                    value={formState.components[component] ?? 0}
                    onChange={(event) => handleComponentChange(component, Number(event.target.value))}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
                  />
                </label>
              ))}
            </div>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-600">Дата відшиву</span>
              <input
                type="datetime-local"
                value={formState.producedAt}
                onChange={(event) => handleFormChange('producedAt', event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-600">Коментар</span>
              <textarea
                value={formState.note}
                onChange={(event) => handleFormChange('note', event.target.value)}
                className="h-24 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
                placeholder="Додаткові деталі чи номер партії"
              />
            </label>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-xl bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:shadow-2xl disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? 'Збереження...' : 'Зберегти партію'}
            </button>
          </form>

          <div className="rounded-3xl bg-white/80 p-6 shadow-xl">
            <div className="mb-4 flex items-center gap-3">
              <Activity className="h-5 w-5 text-purple-500" />
              <h3 className="text-lg font-semibold text-slate-800">Продажі за розмірами</h3>
            </div>
            <div className="space-y-3">
              {sizeStats.slice(0, 8).map((stat) => (
                <div
                  key={`${stat.productId}-${stat.component}-${stat.size}`}
                  className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white px-4 py-3 text-sm shadow-sm"
                >
                  <div>
                    <div className="font-semibold text-slate-800">{stat.productName}</div>
                    <div className="text-xs text-slate-500">
                      {COMPONENT_LABELS[stat.component]} • {stat.size}
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-purple-600">{stat.sold} шт</div>
                </div>
              ))}
              {sizeStats.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center text-sm text-slate-500">
                  Дані про продажі ще не зібрані.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FinishedGoodsPage;
