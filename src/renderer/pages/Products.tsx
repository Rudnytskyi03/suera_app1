import React, { useEffect, useMemo, useState } from 'react';
import { BadgePercent, ImagePlus, PackagePlus, PlusCircle, Search, ShoppingBag, Trash2, X } from 'lucide-react';
import { fetchProducts, saveProduct, deleteProduct } from '../services/productsService';
import { fetchMaterials } from '../services/materialsService';
import { DiscountType, Material, Product, ProductExpense, ProductPhoto } from '../types';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/ToastProvider';

const DEFAULT_EXPENSE_LABELS = ['Пошив', 'Упаковка', 'Логістика', 'Реклама'];
const UNIT_LABELS: Record<Material['unit'], string> = {
  meters: 'м',
  pieces: 'шт'
};

type PendingPhoto = {
  file: File;
  preview: string;
};

const createDefaultExpenses = (): ProductExpense[] =>
  DEFAULT_EXPENSE_LABELS.map((label) => ({ label, amount: 0 }));

const withDefaultExpenses = (expenses: ProductExpense[]): ProductExpense[] => {
  const normalized = [...expenses];
  for (const label of DEFAULT_EXPENSE_LABELS) {
    if (!normalized.some((expense) => expense.label.toLowerCase() === label.toLowerCase())) {
      normalized.push({ label, amount: 0 });
    }
  }
  return normalized;
};

type ProductFormState = {
  id?: number;
  name: string;
  description: string;
  salePrice: number;
  discountType: DiscountType;
  discountValue: number;
  materials: Array<{ materialId: number; quantity: number }>;
  additionalExpenses: ProductExpense[];
  existingPhotos: ProductPhoto[];
  newPhotos: PendingPhoto[];
};

const createEmptyFormState = (): ProductFormState => ({
  name: '',
  description: '',
  salePrice: 0,
  discountType: 'none',
  discountValue: 0,
  materials: [],
  additionalExpenses: createDefaultExpenses(),
  existingPhotos: [],
  newPhotos: []
});

const ProductsPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formState, setFormState] = useState<ProductFormState>(createEmptyFormState());
  const { showToast } = useToast();

  const loadData = async () => {
    const [productsData, materialsData] = await Promise.all([fetchProducts(), fetchMaterials()]);
    setProducts(productsData);
    setMaterials(materialsData);
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => product.name.toLowerCase().includes(search.toLowerCase()));
  }, [products, search]);

  const mapMaterials = (selected: Product['materials']) =>
    selected.map((item) => ({ materialId: item.id, quantity: item.quantity }));

  const openModal = (product?: Product) => {
    if (product) {
      setFormState({
        id: product.id,
        name: product.name,
        description: product.description,
        salePrice: product.salePrice,
        discountType: product.discountType ?? 'none',
        discountValue: product.discountValue ?? 0,
        materials: mapMaterials(product.materials),
        additionalExpenses: withDefaultExpenses(
          product.additionalExpenses.map((expense) => ({ ...expense }))
        ),
        existingPhotos: product.photos.map((photo) => ({ ...photo })),
        newPhotos: []
      });
    } else {
      setFormState(createEmptyFormState());
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setFormState((previous) => {
      previous.newPhotos.forEach((photo) => URL.revokeObjectURL(photo.preview));
      return createEmptyFormState();
    });
  };

  const selectedMaterialDetails = useMemo(() => {
    return formState.materials.map((item) => {
      const material = materials.find((m) => m.id === item.materialId);
      const pricePerUnit = material?.pricePerUnit ?? 0;
      const stock = material?.quantity ?? 0;
      return {
        ...item,
        material,
        pricePerUnit,
        cost: pricePerUnit * item.quantity,
        available: stock
      };
    });
  }, [formState.materials, materials]);

  const materialsCost = selectedMaterialDetails.reduce((acc, item) => acc + item.cost, 0);
  const additionalExpensesTotal = formState.additionalExpenses.reduce(
    (acc, expense) => acc + (Number(expense.amount) || 0),
    0
  );
  const costPrice = materialsCost + additionalExpensesTotal;
  const discountAmount =
    formState.discountType === 'percent'
      ? Math.max(0, Math.min(100, formState.discountValue)) * formState.salePrice * 0.01
      : formState.discountType === 'fixed'
      ? Math.max(0, formState.discountValue)
      : 0;
  const effectiveSalePrice = Math.max(0, formState.salePrice - discountAmount);
  const profit = effectiveSalePrice - costPrice;
  const capacityCandidates = selectedMaterialDetails
    .filter((item) => item.quantity > 0)
    .map((item) => Math.floor(item.available / item.quantity) || 0);
  const maxAssemblies = capacityCandidates.length ? Math.min(...capacityCandidates) : 0;

  const handleMaterialChange = (index: number, field: 'materialId' | 'quantity', value: string) => {
    setFormState((prev) => {
      const updated = [...prev.materials];
      if (field === 'materialId') {
        updated[index] = { ...updated[index], materialId: Number(value) };
      } else {
        updated[index] = { ...updated[index], quantity: Number(value) };
      }
      return { ...prev, materials: updated };
    });
  };

  const addMaterialRow = () => {
    if (materials.length === 0) {
      showToast({ title: 'Додайте спочатку матеріали', type: 'info' });
      return;
    }
    setFormState((prev) => ({ ...prev, materials: [...prev.materials, { materialId: materials[0].id, quantity: 1 }] }));
  };

  const removeMaterialRow = (index: number) => {
    setFormState((prev) => ({ ...prev, materials: prev.materials.filter((_, idx) => idx !== index) }));
  };

  const handleExpenseChange = (index: number, field: 'label' | 'amount', value: string) => {
    setFormState((prev) => {
      const updated = [...prev.additionalExpenses];
      if (field === 'label') {
        updated[index] = { ...updated[index], label: value };
      } else {
        updated[index] = { ...updated[index], amount: Number(value) };
      }
      return { ...prev, additionalExpenses: updated };
    });
  };

  const addExpenseRow = () => {
    setFormState((prev) => ({
      ...prev,
      additionalExpenses: [...prev.additionalExpenses, { label: '', amount: 0 }]
    }));
  };

  const removeExpenseRow = (index: number) => {
    setFormState((prev) => ({
      ...prev,
      additionalExpenses: prev.additionalExpenses.filter((_, idx) => idx !== index)
    }));
  };

  const handlePhotoSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    const pending = files.map((file) => ({
      file,
      preview: URL.createObjectURL(file)
    }));
    setFormState((prev) => ({
      ...prev,
      newPhotos: [...prev.newPhotos, ...pending]
    }));
    event.target.value = '';
  };

  const removeExistingPhoto = (photoId: number) => {
    setFormState((prev) => ({
      ...prev,
      existingPhotos: prev.existingPhotos.filter((photo) => photo.id !== photoId)
    }));
  };

  const removeNewPhoto = (index: number) => {
    setFormState((prev) => {
      const updated = [...prev.newPhotos];
      const [removed] = updated.splice(index, 1);
      if (removed) {
        URL.revokeObjectURL(removed.preview);
      }
      return { ...prev, newPhotos: updated };
    });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const materialPayload = formState.materials
        .filter((item) => item.materialId)
        .map((item) => {
          const material = materials.find((m) => m.id === item.materialId);
          return {
            id: item.materialId,
            quantity: item.quantity,
            pricePerUnit: material?.pricePerUnit ?? 0
          };
        });

      const newPhotosPayload = formState.newPhotos.map(({ file }) => {
        const fileWithPath = file as File & { path?: string };
        if (!fileWithPath.path) {
          throw new Error(
            'Не вдалося отримати шлях до локального файлу. Запустіть застосунок як Electron-додаток і оберіть файли заново.'
          );
        }
        return {
          originalName: file.name,
          filePath: fileWithPath.path
        };
      });

      const payload = {
        id: formState.id,
        name: formState.name,
        description: formState.description,
        salePrice: formState.salePrice,
        discount: { type: formState.discountType, value: formState.discountValue },
        materials: materialPayload,
        additionalExpenses: formState.additionalExpenses
          .filter((expense) => expense.label.trim())
          .map((expense) => ({
            label: expense.label.trim(),
            amount: Number(expense.amount) || 0
          })),
        photosToKeep: formState.existingPhotos.map((photo) => photo.id),
        newPhotos: newPhotosPayload
      };
      await saveProduct(payload);
      showToast({ title: formState.id ? 'Товар оновлено' : 'Товар створено', type: 'success' });
      closeModal();
      await loadData();
    } catch (error: any) {
      showToast({ title: 'Помилка збереження', description: error.message, type: 'error' });
    }
  };

  const handleDelete = async (product: Product) => {
    const confirmed = window.confirm(`Видалити товар «${product.name}»?`);
    if (!confirmed) return;
    try {
      await deleteProduct(product.id);
      showToast({ title: 'Товар видалено', type: 'info' });
      await loadData();
    } catch (error: any) {
      showToast({ title: 'Помилка видалення', description: error.message, type: 'error' });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ShoppingBag}
        title="Товары"
        description="Створюйте та керуйте товарами, розраховуйте собівартість та прибуток."
        actions={
          <button
            onClick={() => openModal()}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:shadow-2xl"
          >
            <PackagePlus className="h-4 w-4" /> Добавить товар
          </button>
        }
      />

      <div className="rounded-3xl bg-white/80 p-6 shadow-xl backdrop-blur">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <label className="flex w-full items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm focus-within:border-purple-400 focus-within:ring-2 focus-within:ring-purple-200 md:max-w-sm">
            <Search className="h-4 w-4 text-purple-500" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Пошук по товарам"
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>
        </div>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {filteredProducts.map((product) => (
            <div
              key={product.id}
              className="group flex h-full flex-col rounded-3xl border border-slate-100 bg-white p-6 shadow-lg transition hover:-translate-y-1 hover:shadow-2xl"
            >
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-pink-100 via-purple-100 to-indigo-100">
                {product.photos.length > 0 ? (
                  <img
                    src={product.photos[0].url}
                    alt={product.name}
                    className="h-48 w-full object-cover transition duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-48 w-full items-center justify-center text-4xl">🛍️</div>
                )}
              </div>
              <div className="mt-5 flex flex-1 flex-col gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{product.name}</h3>
                  <p className="mt-1 text-sm text-slate-500 line-clamp-3">{product.description}</p>
                </div>

                <div className="grid gap-3 rounded-2xl bg-purple-50/60 p-4 text-sm text-slate-700 sm:grid-cols-2">
                  <div>
                    <span className="text-xs uppercase text-purple-500">Собівартість</span>
                    <p className="text-base font-semibold text-slate-900">{product.costPrice.toLocaleString()} ₴</p>
                    <p className="text-xs text-slate-500">Матеріали: {product.materialsCost.toLocaleString()} ₴</p>
                  </div>
                  <div>
                    <span className="text-xs uppercase text-purple-500">Додаткові витрати</span>
                    <p className="text-base font-semibold text-slate-900">{product.additionalCost.toLocaleString()} ₴</p>
                  </div>
                  <div>
                    <span className="text-xs uppercase text-purple-500">Ціна продажу</span>
                    <p className="text-base font-semibold text-slate-900">{product.salePrice.toLocaleString()} ₴</p>
                    {product.discountType !== 'none' ? (
                      <p className="mt-1 flex items-center gap-1 text-xs text-rose-500">
                        <BadgePercent className="h-3 w-3" />
                        Знижка{' '}
                        {product.discountType === 'percent'
                          ? `${product.discountValue}%`
                          : `${product.discountValue.toLocaleString()} ₴`}{' '}
                        (−{product.discountAmount.toLocaleString()} ₴)
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-slate-500">Без знижки</p>
                    )}
                    <p className="text-xs text-emerald-600">
                      Ціна зі знижкою: {product.effectiveSalePrice.toLocaleString()} ₴
                    </p>
                  </div>
                  <div>
                    <span className="text-xs uppercase text-purple-500">Очікуваний прибуток</span>
                    <p
                      className={`text-base font-semibold ${
                        product.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {product.profit.toLocaleString()} ₴
                    </p>
                    <p className="text-xs text-slate-500">
                      Макс. комплектів: {product.maxProductionQuantity}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-100 bg-white/70 p-4 shadow-inner">
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase text-purple-500">Матеріали</span>
                    <span className="text-xs font-medium text-slate-500">Використано: {product.materials.length}</span>
                  </div>
                  <ul className="mt-3 space-y-2 text-sm text-slate-600">
                    {product.materials.length > 0 ? (
                      product.materials.map((material) => (
                        <li
                          key={material.id}
                          className="flex items-center justify-between rounded-xl bg-purple-50/40 px-3 py-2"
                        >
                          <span className="font-medium text-slate-800">{material.name}</span>
                          <span className="text-xs text-slate-500">
                            {material.quantity} {UNIT_LABELS[material.unit]} • залишок {material.availableQuantity}{' '}
                            {UNIT_LABELS[material.unit]}
                          </span>
                        </li>
                      ))
                    ) : (
                      <li className="text-xs text-slate-400">Матеріали не додані</li>
                    )}
                  </ul>
                </div>

                <div className="rounded-2xl border border-slate-100 bg-white/70 p-4 shadow-inner">
                  <span className="text-xs uppercase text-purple-500">Додаткові витрати</span>
                  {product.additionalExpenses.length > 0 ? (
                    <ul className="mt-3 space-y-2 text-sm text-slate-600">
                      {product.additionalExpenses.map((expense, index) => (
                        <li key={`${expense.label}-${index}`} className="flex items-center justify-between">
                          <span>{expense.label}</span>
                          <span className="font-medium text-slate-800">{expense.amount.toLocaleString()} ₴</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-slate-400">Додаткові витрати відсутні</p>
                  )}
                </div>

                <div className="mt-auto flex gap-2">
                  <button
                    onClick={() => openModal(product)}
                    className="flex-1 rounded-xl bg-purple-600/90 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-purple-600"
                  >
                    Редагувати
                  </button>
                  <button
                    onClick={() => handleDelete(product)}
                    className="rounded-xl bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-500 shadow-sm transition hover:bg-rose-100"
                  >
                    Видалити
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filteredProducts.length === 0 && (
          <div className="mt-12 rounded-2xl border border-dashed border-purple-200 bg-purple-50/40 p-12 text-center text-sm text-slate-500">
            Немає товарів за вашим запитом.
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl rounded-3xl bg-white p-8 shadow-2xl">
            <h2 className="text-xl font-semibold text-slate-900">{formState.id ? 'Редагування товару' : 'Новий товар'}</h2>
            <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-600">Назва</span>
                  <input
                    value={formState.name}
                    onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
                    required
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-600">Ціна продажу</span>
                  <input
                    type="number"
                    min={0}
                    value={formState.salePrice}
                    onChange={(event) => setFormState((prev) => ({ ...prev, salePrice: Number(event.target.value) }))}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
                    required
                  />
                </label>
              </div>
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-600">Опис</span>
                <textarea
                  value={formState.description}
                  onChange={(event) => setFormState((prev) => ({ ...prev, description: event.target.value }))}
                  className="h-24 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
                />
              </label>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-700">Композиція матеріалів</h3>
                  <button
                    type="button"
                    onClick={addMaterialRow}
                    className="flex items-center gap-2 rounded-xl bg-purple-50 px-3 py-2 text-xs font-semibold text-purple-600 transition hover:bg-purple-100"
                  >
                    <PlusCircle className="h-4 w-4" /> Додати матеріал
                  </button>
                </div>
                <div className="space-y-3">
                  {formState.materials.map((item, index) => (
                    <div key={index} className="grid gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm md:grid-cols-[1.5fr_1fr_auto]">
                      <select
                        value={item.materialId}
                        onChange={(event) => handleMaterialChange(index, 'materialId', event.target.value)}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
                      >
                        {materials.map((material) => (
                          <option key={material.id} value={material.id}>
                            {material.name} ({material.pricePerUnit} ₴)
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={item.quantity}
                        onChange={(event) => handleMaterialChange(index, 'quantity', event.target.value)}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
                      />
                      <button
                        type="button"
                        onClick={() => removeMaterialRow(index)}
                        className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-500 shadow-sm transition hover:bg-rose-100"
                      >
                        <Trash2 className="mr-1 inline h-4 w-4" />
                        Видалити
                      </button>
                      <div className="md:col-span-3 flex flex-col gap-1 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                        <span>Собівартість: {selectedMaterialDetails[index]?.cost.toFixed(2)} ₴</span>
                        {selectedMaterialDetails[index]?.material && (
                          <span>
                            Залишок: {selectedMaterialDetails[index]?.available}{' '}
                            {UNIT_LABELS[selectedMaterialDetails[index]?.material?.unit ?? 'шт']}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {formState.materials.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-purple-200 bg-purple-50/40 p-6 text-center text-xs text-slate-500">
                      Додайте матеріали для розрахунку собівартості
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-600">Тип знижки</span>
                  <select
                    value={formState.discountType}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, discountType: event.target.value as DiscountType }))
                    }
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
                  >
                    <option value="none">Без знижки</option>
                    <option value="percent">Відсоток</option>
                    <option value="fixed">Фіксована сума</option>
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-600">Розмір знижки</span>
                  <input
                    type="number"
                    min={0}
                    max={formState.discountType === 'percent' ? 100 : undefined}
                    value={formState.discountValue}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, discountValue: Number(event.target.value) }))
                    }
                    disabled={formState.discountType === 'none'}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200 disabled:cursor-not-allowed disabled:bg-slate-100"
                  />
                </label>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-700">Додаткові витрати</h3>
                  <button
                    type="button"
                    onClick={addExpenseRow}
                    className="flex items-center gap-2 rounded-xl bg-purple-50 px-3 py-2 text-xs font-semibold text-purple-600 transition hover:bg-purple-100"
                  >
                    <PlusCircle className="h-4 w-4" /> Додати витрату
                  </button>
                </div>
                <div className="space-y-3">
                  {formState.additionalExpenses.map((expense, index) => (
                    <div
                      key={index}
                      className="grid gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm md:grid-cols-[1.5fr_1fr_auto]"
                    >
                      <input
                        value={expense.label}
                        onChange={(event) => handleExpenseChange(index, 'label', event.target.value)}
                        placeholder="Назва витрати"
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
                      />
                      <input
                        type="number"
                        min={0}
                        value={expense.amount}
                        onChange={(event) => handleExpenseChange(index, 'amount', event.target.value)}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
                      />
                      <button
                        type="button"
                        onClick={() => removeExpenseRow(index)}
                        className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-500 shadow-sm transition hover:bg-rose-100"
                      >
                        <Trash2 className="mr-1 inline h-4 w-4" /> Видалити
                      </button>
                    </div>
                  ))}
                  {formState.additionalExpenses.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-purple-200 bg-purple-50/40 p-6 text-center text-xs text-slate-500">
                      Додайте витрати, щоб врахувати логістику, упаковку та інші роботи
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-sm font-medium text-slate-600">Фото товару</span>
                <div className="flex flex-wrap gap-3">
                  {formState.existingPhotos.map((photo) => (
                    <div
                      key={photo.id}
                      className="relative h-24 w-24 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-sm"
                    >
                      <img src={photo.url} alt="Фото товару" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeExistingPhoto(photo.id)}
                        className="absolute right-1 top-1 rounded-full bg-black/50 p-1 text-white transition hover:bg-black/70"
                        aria-label="Видалити фото"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {formState.newPhotos.map((photo, index) => (
                    <div
                      key={`new-${index}`}
                      className="relative h-24 w-24 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-sm"
                    >
                      <img src={photo.preview} alt="Нове фото" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeNewPhoto(index)}
                        className="absolute right-1 top-1 rounded-full bg-black/50 p-1 text-white transition hover:bg-black/70"
                        aria-label="Прибрати фото"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <label className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-purple-300 bg-purple-50/40 text-xs font-medium text-purple-500 transition hover:border-purple-400 hover:bg-purple-50">
                    <ImagePlus className="h-5 w-5" />
                    Додати
                    <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoSelect} />
                  </label>
                </div>
                <p className="text-xs text-slate-400">
                  Зображення копіюються до локальної директорії додатку та доступні без інтернету.
                </p>
              </div>

              <div className="grid gap-4 rounded-2xl bg-purple-50/40 p-4 text-sm text-slate-700 md:grid-cols-4">
                <div>
                  <span className="text-xs uppercase text-purple-500">Матеріали</span>
                  <p className="text-lg font-semibold text-slate-900">{materialsCost.toFixed(2)} ₴</p>
                </div>
                <div>
                  <span className="text-xs uppercase text-purple-500">Додаткові витрати</span>
                  <p className="text-lg font-semibold text-slate-900">{additionalExpensesTotal.toFixed(2)} ₴</p>
                </div>
                <div>
                  <span className="text-xs uppercase text-purple-500">Собівартість</span>
                  <p className="text-lg font-semibold text-slate-900">{costPrice.toFixed(2)} ₴</p>
                </div>
                <div>
                  <span className="text-xs uppercase text-purple-500">Очікуваний прибуток</span>
                  <p className={profit >= 0 ? 'text-lg font-semibold text-emerald-600' : 'text-lg font-semibold text-rose-600'}>
                    {profit.toFixed(2)} ₴
                  </p>
                </div>
              </div>

              <div className="grid gap-4 rounded-2xl bg-indigo-50/40 p-4 text-sm text-slate-700 md:grid-cols-3">
                <div>
                  <span className="text-xs uppercase text-purple-500">Базова ціна</span>
                  <p className="text-lg font-semibold text-slate-900">{formState.salePrice.toFixed(2)} ₴</p>
                </div>
                <div>
                  <span className="text-xs uppercase text-purple-500">Знижка</span>
                  <p className="text-lg font-semibold text-rose-500">
                    {formState.discountType === 'none'
                      ? '0.00 ₴'
                      : `−${discountAmount.toFixed(2)} ₴`}
                  </p>
                  {formState.discountType !== 'none' ? (
                    <p className="text-xs text-slate-500">
                      {formState.discountType === 'percent'
                        ? `Застосовано ${formState.discountValue}%`
                        : `Фіксована знижка ${formState.discountValue} ₴`}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-500">Без знижки</p>
                  )}
                </div>
                <div>
                  <span className="text-xs uppercase text-purple-500">Ціна зі знижкою</span>
                  <p className="text-lg font-semibold text-slate-900">{effectiveSalePrice.toFixed(2)} ₴</p>
                </div>
              </div>

              <div className="rounded-2xl border border-dashed border-purple-200 bg-purple-50/40 p-4 text-sm text-slate-600">
                Можна зібрати{' '}
                <span className="font-semibold text-slate-900">{Number.isFinite(maxAssemblies) ? maxAssemblies : 0}</span>{' '}
                комплектів з поточних запасів.
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
                >
                  Скасувати
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-lg transition hover:shadow-2xl"
                >
                  Зберегти товар
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductsPage;
