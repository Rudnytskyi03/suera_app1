import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Tag, UploadCloud, Edit, Trash2, ArrowDownToLine, ImagePlus, X } from 'lucide-react';
import {
  createMaterial,
  deleteMaterial,
  fetchMaterials,
  recordMaterialReceipt,
  updateMaterial
} from '../services/materialsService';
import type { MaterialSaveInput } from '../services/materialsService';
import { Material } from '../types';
import { useToast } from '../components/ToastProvider';
import { PageHeader } from '../components/PageHeader';

const units: Array<{ value: Material['unit']; label: string }> = [
  { value: 'meters', label: 'Метри' },
  { value: 'pieces', label: 'Шт.' }
];

const categories = ['Усі категорії', 'Модал', 'Бейка', 'Гумка', 'Аксесуари'];

type MaterialFormState = {
  name: string;
  category: string;
  unit: Material['unit'];
  quantity: string;
  pricePerUnit: string;
  braUnderwireSizes: string;
  underwireUnitsPerBra: string;
};

const defaultForm: MaterialFormState = {
  name: '',
  category: 'Модал',
  unit: 'meters',
  quantity: '',
  pricePerUnit: '',
  braUnderwireSizes: '',
  underwireUnitsPerBra: ''
};

type PendingPhoto = {
  file: File;
  preview: string;
};

const createDefaultReceiptForm = () => ({
  quantity: '',
  unitPrice: '',
  comment: '',
  date: new Date().toISOString().split('T')[0]
});

const MaterialsPage: React.FC = () => {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Усі категорії');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formState, setFormState] = useState<MaterialFormState>({ ...defaultForm });
  const [existingPhoto, setExistingPhoto] = useState<{ url: string; path: string | null } | null>(null);
  const [pendingPhoto, setPendingPhoto] = useState<PendingPhoto | null>(null);
  const [originalPhotoPath, setOriginalPhotoPath] = useState<string | null>(null);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [receiptMaterial, setReceiptMaterial] = useState<Material | null>(null);
  const [receiptForm, setReceiptForm] = useState(createDefaultReceiptForm());
  const { showToast } = useToast();

  const loadMaterials = async () => {
    const data = await fetchMaterials();
    setMaterials(data);
  };

  useEffect(() => {
    loadMaterials();
  }, []);

  const filteredMaterials = useMemo(() => {
    return materials.filter((material) => {
      const matchesSearch = material.name.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = category === 'Усі категорії' || material.category === category;
      return matchesSearch && matchesCategory;
    });
  }, [materials, search, category]);

  const handleOpenModal = (material?: Material) => {
    setPendingPhoto((previous) => {
      if (previous) {
        URL.revokeObjectURL(previous.preview);
      }
      return null;
    });

    if (material) {
      setEditingMaterial(material);
      setFormState({
        name: material.name,
        category: material.category,
        unit: material.unit,
        quantity: material.quantity.toString(),
        pricePerUnit: material.pricePerUnit.toString(),
        braUnderwireSizes: material.braUnderwireSizes.join(', '),
        underwireUnitsPerBra: material.underwireUnitsPerBra?.toString() ?? ''
      });
      setExistingPhoto(
        material.photoUrl
          ? {
              url: material.photoUrl,
              path: material.photoPath ?? null
            }
          : null
      );
      setOriginalPhotoPath(material.photoPath ?? null);
    } else {
      setEditingMaterial(null);
      setFormState({ ...defaultForm });
      setExistingPhoto(null);
      setOriginalPhotoPath(null);
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingMaterial(null);
    setFormState({ ...defaultForm });
    setExistingPhoto(null);
    setOriginalPhotoPath(null);
    setPendingPhoto((previous) => {
      if (previous) {
        URL.revokeObjectURL(previous.preview);
      }
      return null;
    });
  };

  const handleOpenReceiptModal = (material: Material) => {
    setReceiptMaterial(material);
    setReceiptForm(createDefaultReceiptForm());
    setIsReceiptModalOpen(true);
  };

  const handleCloseReceiptModal = () => {
    setIsReceiptModalOpen(false);
    setReceiptMaterial(null);
    setReceiptForm(createDefaultReceiptForm());
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const quantity = Number(String(formState.quantity).replace(',', '.'));
      const pricePerUnit = Number(String(formState.pricePerUnit).replace(',', '.'));

      if (!Number.isFinite(quantity) || quantity < 0) {
        throw new Error('Будь ласка, введіть коректну кількість.');
      }

      if (!Number.isFinite(pricePerUnit) || pricePerUnit < 0) {
        throw new Error('Будь ласка, введіть коректну ціну.');
      }

      const underwireSizes = Array.from(
        new Set(
          formState.braUnderwireSizes
            .split(/[,;]/)
            .map((value) => value.trim().toUpperCase())
            .filter((value) => value.length > 0 && value !== 'UNSIZED')
        )
      );
      const hasUnderwire = underwireSizes.length > 0;
      const underwireUnitsValue = String(formState.underwireUnitsPerBra).replace(',', '.');
      const parsedUnderwireUnits = Number(underwireUnitsValue);

      if (hasUnderwire) {
        if (!Number.isFinite(parsedUnderwireUnits) || parsedUnderwireUnits <= 0) {
          throw new Error('Вкажіть кількість косточок на один бра.');
        }
      }

      const payload: MaterialSaveInput = {
        name: formState.name,
        category: formState.category,
        unit: formState.unit,
        quantity,
        pricePerUnit,
        underwireSizes: hasUnderwire ? underwireSizes : [],
        underwireUnitsPerBra: hasUnderwire ? parsedUnderwireUnits : null
      };

      if (pendingPhoto) {
        const fileWithPath = pendingPhoto.file as File & { path?: string };
        if (!fileWithPath.path) {
          throw new Error(
            'Не вдалося зчитати шлях до файлу. Запустіть застосунок як Electron-додаток та оберіть фото ще раз.'
          );
        }
        payload.newPhoto = {
          originalName: pendingPhoto.file.name,
          filePath: fileWithPath.path
        };
      }

      if (editingMaterial) {
        if (!pendingPhoto && !existingPhoto && originalPhotoPath) {
          payload.removePhoto = true;
        }
        await updateMaterial(editingMaterial.id, payload);
        showToast({ title: 'Матеріал оновлено', type: 'success' });
      } else {
        await createMaterial(payload);
        showToast({ title: 'Матеріал додано', type: 'success' });
      }

      handleCloseModal();
      await loadMaterials();
    } catch (error: any) {
      showToast({ title: 'Помилка збереження', description: error.message, type: 'error' });
    }
  };

  const handlePhotoSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const preview = URL.createObjectURL(file);
    setPendingPhoto((previous) => {
      if (previous) {
        URL.revokeObjectURL(previous.preview);
      }
      return { file, preview };
    });
    event.target.value = '';
  };

  const handleRemovePendingPhoto = () => {
    setPendingPhoto((previous) => {
      if (previous) {
        URL.revokeObjectURL(previous.preview);
      }
      return null;
    });
  };

  const handleRemoveExistingPhoto = () => {
    setExistingPhoto(null);
  };

  const handleDelete = async (material: Material) => {
    const confirmed = window.confirm(`Видалити матеріал «${material.name}»?`);
    if (!confirmed) return;
    try {
      await deleteMaterial(material.id);
      showToast({ title: 'Матеріал видалено', type: 'info' });
      await loadMaterials();
    } catch (error: any) {
      showToast({ title: 'Помилка видалення', description: error.message, type: 'error' });
    }
  };

  const handleReceiptSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!receiptMaterial) {
      return;
    }

    const quantity = Number(String(receiptForm.quantity).replace(',', '.'));
    const unitPrice = Number(String(receiptForm.unitPrice).replace(',', '.'));

    if (!Number.isFinite(quantity) || quantity <= 0) {
      showToast({ title: 'Кількість повинна бути більшою за 0', type: 'error' });
      return;
    }

    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      showToast({ title: 'Ціна за одиницю повинна бути невідʼємною', type: 'error' });
      return;
    }

    try {
      await recordMaterialReceipt(receiptMaterial.id, {
        quantity,
        unitPrice,
        comment: receiptForm.comment?.trim() ? receiptForm.comment.trim() : undefined,
        date: receiptForm.date
      });
      showToast({ title: 'Прихід додано', description: 'Середню ціну оновлено', type: 'success' });
      handleCloseReceiptModal();
      await loadMaterials();
    } catch (error: any) {
      showToast({ title: 'Не вдалося додати прихід', description: error.message, type: 'error' });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Tag}
        title="Матеріали"
        description="Керуйте залишками матеріалів, ведіть облік та завантажуйте фото."
        actions={
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:shadow-2xl"
          >
            <Plus className="h-4 w-4" /> Додати матеріал
          </button>
        }
      />

      <div className="grid gap-4 rounded-3xl bg-white/80 p-6 shadow-xl backdrop-blur">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <label className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm focus-within:border-purple-400 focus-within:ring-2 focus-within:ring-purple-200">
            <Search className="h-4 w-4 text-purple-500" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Пошук за назвою..."
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>

          <label className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm focus-within:border-purple-400 focus-within:ring-2 focus-within:ring-purple-200">
            <Tag className="h-4 w-4 text-purple-500" />
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="w-full bg-transparent text-sm outline-none"
            >
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Фото</th>
                <th className="px-4 py-3 text-left">Назва</th>
                <th className="px-4 py-3 text-left">Категорія</th>
                <th className="px-4 py-3 text-left">Од.</th>
                <th className="px-4 py-3 text-left">Кількість</th>
                <th className="px-4 py-3 text-left">Ціна</th>
                <th className="px-4 py-3 text-right">Дії</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredMaterials.map((material) => (
                <tr key={material.id} className="transition hover:bg-purple-50/40">
                  <td className="px-4 py-3">
                    {material.photoUrl ? (
                      <img
                        src={material.photoUrl}
                        alt={material.name}
                        className="h-12 w-12 rounded-xl object-cover shadow-inner"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-pink-100 via-purple-100 to-indigo-100 text-purple-500">
                        <UploadCloud className="h-5 w-5" />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{material.name}</div>
                    {material.braUnderwireSizes.length > 0 && (
                      <div className="mt-1 text-xs font-semibold text-purple-600">
                        Косточки {material.braUnderwireSizes.join(', ')}
                        {material.underwireUnitsPerBra !== null
                          ? ` · ${material.underwireUnitsPerBra} / бра`
                          : ''}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{material.category}</td>
                  <td className="px-4 py-3 text-slate-500">{units.find((u) => u.value === material.unit)?.label}</td>
                  <td className="px-4 py-3 text-slate-500">{material.quantity}</td>
                  <td className="px-4 py-3 text-slate-500">{material.pricePerUnit.toLocaleString()} ₴</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handleOpenReceiptModal(material)}
                        className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-600 shadow-sm transition hover:bg-emerald-100"
                      >
                        <ArrowDownToLine className="mr-1 inline h-4 w-4" /> Прихід
                      </button>
                      <button
                        onClick={() => handleOpenModal(material)}
                        className="rounded-xl bg-purple-50 px-3 py-2 text-xs font-semibold text-purple-600 shadow-sm transition hover:bg-purple-100"
                      >
                        <Edit className="mr-1 inline h-4 w-4" /> Редагувати
                      </button>
                      <button
                        onClick={() => handleDelete(material)}
                        className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-500 shadow-sm transition hover:bg-rose-100"
                      >
                        <Trash2 className="mr-1 inline h-4 w-4" /> Видалити
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredMaterials.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                    Немає матеріалів за вашим запитом.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isReceiptModalOpen && receiptMaterial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg">
            <div className="max-h-[calc(100vh-2rem)] overflow-y-auto rounded-3xl bg-white p-8 shadow-2xl">
              <h2 className="text-xl font-semibold text-slate-900">
                Новий прихід · {receiptMaterial.name}
              </h2>
              <form className="mt-6 space-y-4" onSubmit={handleReceiptSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-600">Кількість</span>
                  <input
                    type="number"
                    min={0.01}
                    step="any"
                    value={receiptForm.quantity}
                    onChange={(event) => setReceiptForm({ ...receiptForm, quantity: event.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
                    required
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-600">Ціна за одиницю</span>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={receiptForm.unitPrice}
                    onChange={(event) => setReceiptForm({ ...receiptForm, unitPrice: event.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
                    required
                  />
                </label>
              </div>
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-600">Коментар</span>
                <textarea
                  value={receiptForm.comment}
                  onChange={(event) => setReceiptForm({ ...receiptForm, comment: event.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
                  rows={3}
                  placeholder="Наприклад: нова партія від постачальника"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-600">Дата</span>
                <input
                  type="date"
                  value={receiptForm.date}
                  onChange={(event) => setReceiptForm({ ...receiptForm, date: event.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
                  required
                />
              </label>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleCloseReceiptModal}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
                >
                  Скасувати
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-gradient-to-r from-emerald-500 via-green-500 to-teal-600 px-5 py-2 text-sm font-semibold text-white shadow-lg transition hover:shadow-2xl"
                >
                  Зберегти
                </button>
              </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl">
            <div className="max-h-[calc(100vh-2rem)] overflow-y-auto rounded-3xl bg-white p-8 shadow-2xl">
              <h2 className="text-xl font-semibold text-slate-900">
                {editingMaterial ? 'Редагувати матеріал' : 'Новий матеріал'}
              </h2>
              <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-600">Назва</span>
                  <input
                    value={formState.name}
                    onChange={(event) => setFormState({ ...formState, name: event.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
                    required
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-600">Категорія</span>
                  <input
                    value={formState.category}
                    onChange={(event) => setFormState({ ...formState, category: event.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
                    required
                  />
                </label>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-600">Одиниця виміру</span>
                  <select
                    value={formState.unit}
                    onChange={(event) => setFormState({ ...formState, unit: event.target.value as Material['unit'] })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
                  >
                    {units.map((unit) => (
                      <option key={unit.value} value={unit.value}>
                        {unit.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-600">Кількість</span>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={formState.quantity}
                    onChange={(event) => setFormState({ ...formState, quantity: event.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
                    required
                  />
                </label>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-600">Ціна за одиницю</span>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={formState.pricePerUnit}
                    onChange={(event) => setFormState({ ...formState, pricePerUnit: event.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
                    required
                  />
                </label>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-600">Розміри бра для косточок</span>
                  <input
                    value={formState.braUnderwireSizes}
                    onChange={(event) => {
                      const nextValue = event.target.value.toUpperCase();
                      setFormState({
                        ...formState,
                        braUnderwireSizes: nextValue,
                        underwireUnitsPerBra: nextValue.trim() ? formState.underwireUnitsPerBra : ''
                      });
                    }}
                    placeholder="Наприклад: 75B, 80A, 70C"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm uppercase outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-600">Косточки на 1 бра</span>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={formState.underwireUnitsPerBra}
                    onChange={(event) =>
                      setFormState({ ...formState, underwireUnitsPerBra: event.target.value })
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200 disabled:opacity-50"
                    disabled={!formState.braUnderwireSizes.trim()}
                  />
                </label>
              </div>
              <p className="text-xs text-slate-400">
                Якщо залишити ці поля порожніми, матеріал не буде використовуватись як косточки для бра.
              </p>
              <div className="space-y-2">
                <span className="text-sm font-medium text-slate-600">Фото матеріалу</span>
                <div className="flex flex-wrap gap-3">
                  {existingPhoto && (
                    <div className="relative h-20 w-20 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-sm">
                      <img src={existingPhoto.url} alt="Фото матеріалу" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={handleRemoveExistingPhoto}
                        className="absolute right-1 top-1 rounded-full bg-black/50 p-1 text-white transition hover:bg-black/70"
                        aria-label="Видалити фото"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                  {pendingPhoto && (
                    <div className="relative h-20 w-20 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-sm">
                      <img src={pendingPhoto.preview} alt="Нове фото" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={handleRemovePendingPhoto}
                        className="absolute right-1 top-1 rounded-full bg-black/50 p-1 text-white transition hover:bg-black/70"
                        aria-label="Скасувати нове фото"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                  <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-purple-300 bg-purple-50/40 text-[10px] font-medium text-purple-600 transition hover:border-purple-400 hover:bg-purple-50">
                    <ImagePlus className="h-5 w-5" />
                    Додати
                    <input type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
                  </label>
                </div>
                <p className="text-xs text-slate-400">Фото зберігається локально у даних застосунку та доступне без інтернету.</p>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
                >
                  Скасувати
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-lg transition hover:shadow-2xl"
                >
                  Зберегти
                </button>
              </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MaterialsPage;
