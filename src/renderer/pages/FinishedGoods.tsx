import React, { useEffect, useMemo, useState } from 'react';
import { Activity, ArchiveRestore, Layers, Pencil, PlusCircle, Trash2 } from 'lucide-react';
import {
  deleteProductionBatch,
  fetchFinishedHistory,
  fetchFinishedInventory,
  fetchSizeSalesStats,
  recordProduction,
  updateProductionBatch
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

const formatComponentSizeSummary = (
  sizes: Record<FinishedComponentType, string>,
  components: Record<FinishedComponentType, number>
) =>
  FINISHED_COMPONENTS.filter((component) => (components[component] ?? 0) > 0)
    .map((component) => {
      const size = sizes[component]?.trim();
      return size ? `${COMPONENT_LABELS[component]}: ${size}` : COMPONENT_LABELS[component];
    })
    .join(' · ');

type ComponentSizeBreakdown = {
  size: string;
  quantity: number;
};

type GroupedInventoryRow = {
  productId: number;
  productName: string;
  totalSets: number;
  totalsByComponent: Record<FinishedComponentType, number>;
  componentSizes: Record<FinishedComponentType, ComponentSizeBreakdown[]>;
};

type ProductionFormState = {
  productId: number;
  sets: number;
  producedAt: string;
  note: string;
  components: Record<FinishedComponentType, number>;
  componentSizes: Record<FinishedComponentType, string>;
  skipMaterialWriteOff: boolean;
};

const defaultFormState: ProductionFormState = {
  productId: 0,
  sets: 0,
  producedAt: '',
  note: '',
  components: {
    bra: 0,
    panties: 0,
    belt: 0,
    garter: 0
  },
  componentSizes: {
    bra: '',
    panties: '',
    belt: '',
    garter: ''
  },
  skipMaterialWriteOff: false
};

function toDateTimeLocalInput(value: string | null | undefined) {
  if (!value) {
    return '';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  const adjusted = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000);
  return adjusted.toISOString().slice(0, 16);
}

const FinishedGoodsPage: React.FC = () => {
  const [inventory, setInventory] = useState<FinishedInventoryEntry[]>([]);
  const [history, setHistory] = useState<FinishedBatch[]>([]);
  const [sizeStats, setSizeStats] = useState<FinishedSizeStat[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [formState, setFormState] = useState<ProductionFormState>(defaultFormState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingBatch, setEditingBatch] = useState<FinishedBatch | null>(null);
  const [editFormState, setEditFormState] = useState<ProductionFormState>(defaultFormState);
  const [isUpdatingBatch, setIsUpdatingBatch] = useState(false);
  const [batchToDelete, setBatchToDelete] = useState<FinishedBatch | null>(null);
  const [isDeletingBatch, setIsDeletingBatch] = useState(false);
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

  const groupedInventory = useMemo(() => {
    const groups = new Map<number, GroupedInventoryRow>();

    inventory.forEach((entry) => {
      if (!groups.has(entry.productId)) {
        groups.set(entry.productId, {
          productId: entry.productId,
          productName: entry.productName,
          totalSets: 0,
          totalsByComponent: {
            bra: 0,
            panties: 0,
            belt: 0,
            garter: 0
          },
          componentSizes: {
            bra: [],
            panties: [],
            belt: [],
            garter: []
          }
        });
      }

      const group = groups.get(entry.productId)!;

      FINISHED_COMPONENTS.forEach((component) => {
        const quantity = entry.components[component] ?? 0;
        if (quantity > 0) {
          const sizeEntries = group.componentSizes[component];
          const existingSize = sizeEntries.find((item) => item.size === entry.size);
          if (existingSize) {
            existingSize.quantity += quantity;
          } else {
            sizeEntries.push({ size: entry.size, quantity });
          }
        }
        group.totalsByComponent[component] += quantity;
      });
    });

    for (const group of groups.values()) {
      const componentTotals = FINISHED_COMPONENTS.map((component) => group.totalsByComponent[component] ?? 0);
      if (componentTotals.some((value) => value <= 0)) {
        group.totalSets = 0;
      } else {
        group.totalSets = Math.min(...componentTotals);
      }

      for (const component of FINISHED_COMPONENTS) {
        group.componentSizes[component].sort((a, b) => a.size.localeCompare(b.size, 'uk', { sensitivity: 'base' }));
      }
    }

    return Array.from(groups.values()).sort((a, b) =>
      a.productName.localeCompare(b.productName, 'uk', { sensitivity: 'base' })
    );
  }, [inventory]);

  const inventorySummary = useMemo(() => {
    const totals = groupedInventory.reduce(
      (acc, entry) => {
        const pieces = FINISHED_COMPONENTS.reduce(
          (sum, component) => sum + (entry.totalsByComponent[component] ?? 0),
          0
        );
        return {
          totalSets: acc.totalSets + entry.totalSets,
          totalPieces: acc.totalPieces + pieces
        };
      },
      { totalSets: 0, totalPieces: 0 }
    );

    return {
      totalProducts: groupedInventory.length,
      totalSets: totals.totalSets,
      totalPieces: totals.totalPieces
    };
  }, [groupedInventory]);

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

  const handleComponentSizeChange = (component: FinishedComponentType, value: string) => {
    setFormState((prev) => ({
      ...prev,
      componentSizes: {
        ...prev.componentSizes,
        [component]: value.toUpperCase()
      }
    }));
  };

  const handleEditFieldChange = <K extends keyof ProductionFormState>(
    key: K,
    value: ProductionFormState[K]
  ) => {
    setEditFormState((prev) => ({ ...prev, [key]: value }));
  };

  const handleEditComponentChange = (component: FinishedComponentType, value: number) => {
    setEditFormState((prev) => ({
      ...prev,
      components: {
        ...prev.components,
        [component]: Math.max(0, value)
      }
    }));
  };

  const handleEditComponentSizeChange = (component: FinishedComponentType, value: string) => {
    setEditFormState((prev) => ({
      ...prev,
      componentSizes: {
        ...prev.componentSizes,
        [component]: value.toUpperCase()
      }
    }));
  };

  const openEditModal = (batch: FinishedBatch) => {
    setEditingBatch(batch);
    setEditFormState({
      productId: batch.productId,
      sets: batch.sets,
      producedAt: toDateTimeLocalInput(batch.producedAt),
      note: batch.note ?? '',
      components: {
        bra: batch.components.bra,
        panties: batch.components.panties,
        belt: batch.components.belt,
        garter: batch.components.garter
      },
      componentSizes: {
        bra: batch.componentSizes.bra,
        panties: batch.componentSizes.panties,
        belt: batch.componentSizes.belt,
        garter: batch.componentSizes.garter
      },
      skipMaterialWriteOff: batch.skipMaterials
    });
    setIsEditModalOpen(true);
  };

  const closeEditModal = (force = false) => {
    if (!force && isUpdatingBatch) {
      return;
    }
    setIsEditModalOpen(false);
    setEditingBatch(null);
    setEditFormState(defaultFormState);
  };

  const handleEditSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingBatch) {
      return;
    }

    const components = { ...editFormState.components } as Record<FinishedComponentType, number>;
    const totalComponents = FINISHED_COMPONENTS.reduce(
      (sum, component) => sum + (components[component] || 0),
      0
    );

    if (totalComponents === 0) {
      showToast({ title: 'Вкажіть кількість хоча б для одного елементу', type: 'error' });
      return;
    }

    const missingSize = FINISHED_COMPONENTS.find(
      (component) => components[component] > 0 && !editFormState.componentSizes[component]?.trim()
    );
    if (missingSize) {
      showToast({ title: `Вкажіть розмір для компонента "${COMPONENT_LABELS[missingSize]}"`, type: 'error' });
      return;
    }

    setIsUpdatingBatch(true);
    try {
      await updateProductionBatch({
        batchId: editingBatch.id,
        productId: editingBatch.productId,
        sets: editFormState.sets,
        producedAt: editFormState.producedAt,
        note: editFormState.note,
        components,
        componentSizes: editFormState.componentSizes
      });
      showToast({ title: 'Партію оновлено', type: 'success' });
      closeEditModal(true);
      await loadData();
    } catch (error: any) {
      showToast({ title: 'Не вдалося оновити партію', description: error.message, type: 'error' });
    } finally {
      setIsUpdatingBatch(false);
    }
  };

  const handleDeleteRequest = (batch: FinishedBatch) => {
    setBatchToDelete(batch);
  };

  const handleCancelDelete = () => {
    if (isDeletingBatch) {
      return;
    }
    setBatchToDelete(null);
  };

  const handleConfirmDelete = async () => {
    if (!batchToDelete) {
      return;
    }

    setIsDeletingBatch(true);
    try {
      await deleteProductionBatch(batchToDelete.id);
      showToast({ title: 'Партію видалено', type: 'success' });
      setBatchToDelete(null);
      await loadData();
    } catch (error: any) {
      showToast({ title: 'Не вдалося видалити партію', description: error.message, type: 'error' });
    } finally {
      setIsDeletingBatch(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formState.productId) {
      showToast({ title: 'Оберіть товар', type: 'error' });
      return;
    }

    const components = { ...formState.components } as Record<FinishedComponentType, number>;
    const totalComponents = FINISHED_COMPONENTS.reduce((sum, component) => sum + (components[component] || 0), 0);

    if (totalComponents === 0) {
      showToast({ title: 'Вкажіть кількість хоча б для одного елементу', type: 'error' });
      return;
    }

    const missingSize = FINISHED_COMPONENTS.find(
      (component) => components[component] > 0 && !formState.componentSizes[component]?.trim()
    );
    if (missingSize) {
      showToast({ title: `Вкажіть розмір для компонента "${COMPONENT_LABELS[missingSize]}"`, type: 'error' });
      return;
    }

    setIsSubmitting(true);
    try {
      await recordProduction({
        productId: formState.productId,
        sets: formState.sets,
        producedAt: formState.producedAt,
        note: formState.note,
        components,
        componentSizes: formState.componentSizes,
        skipMaterialWriteOff: formState.skipMaterialWriteOff
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
        title="Відшиті вироби"
        description="Контролюйте склад готової продукції та оперативно додавайте нові партії."
      />

      <div className="grid gap-6 md:grid-cols-3">
        <div className="rounded-3xl bg-white/80 p-6 shadow-xl">
          <div className="text-sm font-medium text-slate-500">Загалом позицій</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{inventorySummary.totalProducts}</div>
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
                {groupedInventory.length} позицій
              </div>
            </div>
            <div className="overflow-hidden rounded-2xl border border-slate-100">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50/70 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Товар</th>
                    <th className="px-4 py-3 text-left">Розміри бра</th>
                    <th className="px-4 py-3 text-left">Розміри трусиків</th>
                    <th className="px-4 py-3 text-right">Комплектів</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {groupedInventory.map((entry) => (
                    <tr key={entry.productId} className="hover:bg-purple-50/40">
                      <td className="px-4 py-3 font-medium text-slate-800">{entry.productName}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {entry.componentSizes.bra.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {entry.componentSizes.bra.map((item) => (
                              <span
                                key={`bra-${entry.productId}-${item.size}`}
                                className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-600"
                              >
                                {item.size}: {item.quantity}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400">Немає даних</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {entry.componentSizes.panties.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {entry.componentSizes.panties.map((item) => (
                              <span
                                key={`panties-${entry.productId}-${item.size}`}
                                className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-600"
                              >
                                {item.size}: {item.quantity}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400">Немає даних</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-800">{entry.totalSets}</td>
                    </tr>
                  ))}
                  {groupedInventory.length === 0 && (
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
              {history.map((batch) => (
                <div
                  key={batch.id}
                  className="rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 text-sm">
                    <div>
                      <div className="font-semibold text-slate-800">{batch.productName}</div>
                      <div className="text-xs text-slate-500">
                        {formatComponentSizeSummary(batch.componentSizes, batch.components) || 'Розміри не вказані'}
                      </div>
                      {batch.skipMaterials && (
                        <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-700">
                          Матеріали не списані
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2 text-xs text-slate-500">
                      <span>{new Date(batch.producedAt).toLocaleString()}</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(batch)}
                          className="flex items-center gap-1 rounded-lg bg-purple-50 px-3 py-1 font-semibold text-purple-600 transition hover:bg-purple-100"
                        >
                          <Pencil className="h-4 w-4" /> Редагувати
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteRequest(batch)}
                          className="flex items-center gap-1 rounded-lg bg-rose-50 px-3 py-1 font-semibold text-rose-600 transition hover:bg-rose-100"
                        >
                          <Trash2 className="h-4 w-4" /> Видалити
                        </button>
                      </div>
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

            <div className="grid gap-4 md:grid-cols-2">
              {FINISHED_COMPONENTS.map((component) => (
                <div key={component} className="space-y-2 rounded-2xl border border-slate-100 bg-white px-4 py-3">
                  <div className="text-xs font-semibold text-slate-600">{COMPONENT_LABELS[component]}</div>
                  <label className="space-y-1">
                    <span className="text-[11px] font-medium text-slate-500">Розмір</span>
                    <input
                      value={formState.componentSizes[component] ?? ''}
                      onChange={(event) => handleComponentSizeChange(component, event.target.value)}
                      placeholder="Наприклад: 75B або S"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm uppercase outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] font-medium text-slate-500">Кількість</span>
                    <input
                      type="number"
                      min={0}
                      value={formState.components[component] ?? 0}
                      onChange={(event) => handleComponentChange(component, Number(event.target.value))}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
                    />
                  </label>
                </div>
              ))}
            </div>

            <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={formState.skipMaterialWriteOff}
                onChange={(event) => handleFormChange('skipMaterialWriteOff', event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-purple-600 focus:ring-purple-400"
              />
              <span>
                <span className="font-semibold text-slate-700">Не списувати матеріали зі складу</span>
                <br />
                Залишайте прапорець увімкненим, якщо виробничі матеріали вже обліковані вручну або не потребують списання.
              </span>
            </label>

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
                    <div className="text-sm font-semibold text-purple-600">{stat.sold} шт.</div>
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

      {isEditModalOpen && editingBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl">
            <div className="max-h-[calc(100vh-2rem)] overflow-y-auto rounded-3xl bg-white p-8 shadow-2xl">
              <h2 className="text-xl font-semibold text-slate-900">
                Редагувати партію · {editingBatch.productName}
              </h2>
              {editingBatch.skipMaterials && (
                <div className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-xs text-amber-700">
                  Матеріали для цієї партії не були списані зі складу під час відшиву.
                </div>
              )}
              <form className="mt-6 space-y-4" onSubmit={handleEditSubmit}>
                <div className="space-y-2">
                  <span className="text-sm font-medium text-slate-600">Товар</span>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                    {editingBatch.productName}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-slate-600">Комплектів</span>
                    <input
                      type="number"
                      min={0}
                      value={editFormState.sets}
                      onChange={(event) =>
                        handleEditFieldChange('sets', Math.max(0, Number(event.target.value)))
                      }
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
                    />
                  </label>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {FINISHED_COMPONENTS.map((component) => (
                    <div key={component} className="space-y-2 rounded-2xl border border-slate-100 bg-white px-4 py-3">
                      <div className="text-xs font-semibold text-slate-600">{COMPONENT_LABELS[component]}</div>
                      <label className="space-y-1">
                        <span className="text-[11px] font-medium text-slate-500">Розмір</span>
                        <input
                          value={editFormState.componentSizes[component] ?? ''}
                          onChange={(event) =>
                            handleEditComponentSizeChange(component, event.target.value)
                          }
                          placeholder="Наприклад: 75B або S"
                          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm uppercase outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-[11px] font-medium text-slate-500">Кількість</span>
                        <input
                          type="number"
                          min={0}
                          value={editFormState.components[component] ?? 0}
                          onChange={(event) =>
                            handleEditComponentChange(component, Number(event.target.value))
                          }
                          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
                        />
                      </label>
                    </div>
                  ))}
                </div>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-600">Дата відшиву</span>
                  <input
                    type="datetime-local"
                    value={editFormState.producedAt}
                    onChange={(event) => handleEditFieldChange('producedAt', event.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-600">Коментар</span>
                  <textarea
                    value={editFormState.note}
                    onChange={(event) => handleEditFieldChange('note', event.target.value)}
                    className="h-24 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
                    placeholder="Оновіть примітку до партії"
                  />
                </label>

                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={closeEditModal}
                    disabled={isUpdatingBatch}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Скасувати
                  </button>
                  <button
                    type="submit"
                    disabled={isUpdatingBatch}
                    className="rounded-xl bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-lg transition hover:shadow-2xl disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isUpdatingBatch ? 'Оновлення...' : 'Зберегти зміни'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {batchToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md">
            <div className="max-h-[calc(100vh-2rem)] overflow-y-auto rounded-3xl bg-white p-8 shadow-2xl">
              <h2 className="text-xl font-semibold text-slate-900">Видалити партію?</h2>
              <p className="mt-3 text-sm text-slate-600">
                Після видалення партії «{batchToDelete.productName}» (
                {formatComponentSizeSummary(batchToDelete.componentSizes, batchToDelete.components) ||
                  'розміри не вказані'}
                ) запаси готових виробів буде зменшено, а використані матеріали повернуться на склад.
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Переконайтеся, що вироби з цієї партії не використані у замовленнях. Якщо їх уже продано,
                перед видаленням скоригуйте замовлення або склад залишків.
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCancelDelete}
                  disabled={isDeletingBatch}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Скасувати
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={isDeletingBatch}
                  className="rounded-xl bg-gradient-to-r from-rose-500 via-pink-500 to-red-600 px-5 py-2 text-sm font-semibold text-white shadow-lg transition hover:shadow-2xl disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isDeletingBatch ? 'Видалення...' : 'Видалити партію'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FinishedGoodsPage;
