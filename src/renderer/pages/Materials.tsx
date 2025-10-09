import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Tag, UploadCloud, Edit, Trash2, ArrowDownToLine } from 'lucide-react';
import {
  createMaterial,
  deleteMaterial,
  fetchMaterials,
  recordMaterialReceipt,
  updateMaterial
} from '../services/materialsService';
import { Material } from '../types';
import { useToast } from '../components/ToastProvider';
import { PageHeader } from '../components/PageHeader';

const units: Array<{ value: Material['unit']; label: string }> = [
  { value: 'meters', label: 'Метры' },
  { value: 'pieces', label: 'Штуки' }
];

const categories = ['Все категории', 'Модал', 'Бейка', 'Резинка', 'Аксессуары'];

const defaultForm = {
  name: '',
  category: 'Модал',
  unit: 'meters' as Material['unit'],
  quantity: 0,
  pricePerUnit: 0,
  photo: ''
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
  const [category, setCategory] = useState('Все категории');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formState, setFormState] = useState(defaultForm);
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
      const matchesCategory = category === 'Все категории' || material.category === category;
      return matchesSearch && matchesCategory;
    });
  }, [materials, search, category]);

  const handleOpenModal = (material?: Material) => {
    if (material) {
      setEditingMaterial(material);
      setFormState({
        name: material.name,
        category: material.category,
        unit: material.unit,
        quantity: material.quantity,
        pricePerUnit: material.pricePerUnit,
        photo: material.photo ?? ''
      });
    } else {
      setEditingMaterial(null);
      setFormState({ ...defaultForm });
    }
    setIsModalOpen(true);
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
      if (editingMaterial) {
        await updateMaterial(editingMaterial.id, formState);
        showToast({ title: 'Матеріал оновлено', type: 'success' });
      } else {
        await createMaterial(formState as any);
        showToast({ title: 'Матеріал додано', type: 'success' });
      }
      setIsModalOpen(false);
      setFormState({ ...defaultForm });
      setEditingMaterial(null);
      await loadMaterials();
    } catch (error: any) {
      showToast({ title: 'Помилка збереження', description: error.message, type: 'error' });
    }
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

    const quantity = Number(receiptForm.quantity);
    const unitPrice = Number(receiptForm.unitPrice);

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
        title="Материалы"
        description="Керуйте залишками матеріалів, ведіть облік та завантажуйте фото."
        actions={
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:shadow-2xl"
          >
            <Plus className="h-4 w-4" /> Добавить материал
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
              placeholder="Пошук по назві..."
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
                    {material.photo ? (
                      <img
                        src={material.photo}
                        alt={material.name}
                        className="h-12 w-12 rounded-xl object-cover shadow-inner"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-pink-100 via-purple-100 to-indigo-100 text-purple-500">
                        <UploadCloud className="h-5 w-5" />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800">{material.name}</td>
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
                        <ArrowDownToLine className="mr-1 inline h-4 w-4" /> Приход
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
          <div className="w-full max-w-lg rounded-3xl bg-white p-8 shadow-2xl">
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
                    step={0.01}
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
                    step={0.01}
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
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-3xl bg-white p-8 shadow-2xl">
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
                    step={0.1}
                    value={formState.quantity}
                    onChange={(event) => setFormState({ ...formState, quantity: Number(event.target.value) })}
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
                    step={0.1}
                    value={formState.pricePerUnit}
                    onChange={(event) => setFormState({ ...formState, pricePerUnit: Number(event.target.value) })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
                    required
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-600">URL фото</span>
                  <input
                    value={formState.photo}
                    onChange={(event) => setFormState({ ...formState, photo: event.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
                    placeholder="https://"
                  />
                </label>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
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
      )}
    </div>
  );
};

export default MaterialsPage;
