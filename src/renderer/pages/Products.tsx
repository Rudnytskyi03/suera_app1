import React, { useEffect, useMemo, useState } from 'react';
import { PackagePlus, PlusCircle, Search, ShoppingBag, Trash2 } from 'lucide-react';
import { fetchProducts, saveProduct, deleteProduct } from '../services/productsService';
import { fetchMaterials } from '../services/materialsService';
import { Material, Product } from '../types';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/ToastProvider';

const defaultCosts = {
  sewingCost: 0,
  packagingCost: 0,
  shippingCost: 0,
  advertisingCost: 0
};

type ProductFormState = {
  id?: number;
  name: string;
  description: string;
  salePrice: number;
  sewingCost: number;
  packagingCost: number;
  shippingCost: number;
  advertisingCost: number;
  materials: Array<{ materialId: number; quantity: number }>;
  photos: string;
};

const defaultFormState: ProductFormState = {
  name: '',
  description: '',
  salePrice: 0,
  ...defaultCosts,
  materials: [],
  photos: ''
};

const ProductsPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formState, setFormState] = useState<ProductFormState>(defaultFormState);
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
        sewingCost: product.sewingCost,
        packagingCost: product.packagingCost,
        shippingCost: product.shippingCost,
        advertisingCost: product.advertisingCost,
        materials: mapMaterials(product.materials),
        photos: product.photos.join('\n')
      });
    } else {
      setFormState({ ...defaultFormState });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setFormState({ ...defaultFormState });
  };

  const selectedMaterialDetails = useMemo(() => {
    return formState.materials.map((item) => {
      const material = materials.find((m) => m.id === item.materialId);
      return {
        ...item,
        material,
        cost: material ? material.pricePerUnit * item.quantity : 0
      };
    });
  }, [formState.materials, materials]);

  const costPrice = selectedMaterialDetails.reduce((acc, item) => acc + item.cost, 0);
  const totalCost =
    costPrice + formState.sewingCost + formState.packagingCost + formState.shippingCost + formState.advertisingCost;
  const profit = formState.salePrice - totalCost;

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

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const payload = {
        ...formState,
        materials: formState.materials
          .filter((item) => item.materialId)
          .map((item) => {
            const material = materials.find((m) => m.id === item.materialId);
            return {
              id: item.materialId,
              quantity: item.quantity,
              pricePerUnit: material?.pricePerUnit ?? 0
            };
          }),
        photos: formState.photos
          .split('\n')
          .map((url) => url.trim())
          .filter(Boolean)
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
            <div key={product.id} className="group flex h-full flex-col rounded-3xl border border-slate-100 bg-white p-6 shadow-lg transition hover:-translate-y-1 hover:shadow-2xl">
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-pink-100 via-purple-100 to-indigo-100">
                {product.photos.length > 0 ? (
                  <img src={product.photos[0]} alt={product.name} className="h-48 w-full object-cover transition duration-500 group-hover:scale-105" />
                ) : (
                  <div className="flex h-48 w-full items-center justify-center text-4xl">🛍️</div>
                )}
              </div>
              <div className="mt-5 flex flex-1 flex-col">
                <h3 className="text-lg font-semibold text-slate-900">{product.name}</h3>
                <p className="mt-1 text-sm text-slate-500 line-clamp-3">{product.description}</p>

                <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-purple-50/60 p-4 text-sm text-slate-700">
                  <div>
                    <span className="text-xs uppercase text-purple-500">Собівартість</span>
                    <p className="text-base font-semibold text-slate-900">{product.costPrice.toLocaleString()} ₴</p>
                  </div>
                  <div>
                    <span className="text-xs uppercase text-purple-500">Ціна продажу</span>
                    <p className="text-base font-semibold text-slate-900">{product.salePrice.toLocaleString()} ₴</p>
                  </div>
                  <div>
                    <span className="text-xs uppercase text-purple-500">Прибуток</span>
                    <p className="text-base font-semibold text-emerald-600">{product.profit.toLocaleString()} ₴</p>
                  </div>
                  <div>
                    <span className="text-xs uppercase text-purple-500">Матеріали</span>
                    <p className="text-base font-semibold text-slate-900">{product.materials.length}</p>
                  </div>
                </div>

                <div className="mt-5 flex gap-2">
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
                      <div className="md:col-span-3 text-xs text-slate-500">
                        Собівартість: {selectedMaterialDetails[index]?.cost.toFixed(2)} ₴
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
                {(['sewingCost', 'packagingCost', 'shippingCost', 'advertisingCost'] as const).map((field) => (
                  <label key={field} className="space-y-2">
                    <span className="text-sm font-medium text-slate-600">
                      {
                        {
                          sewingCost: 'Пошив',
                          packagingCost: 'Упаковка',
                          shippingCost: 'Доставка',
                          advertisingCost: 'Реклама'
                        }[field]
                      }
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={formState[field]}
                      onChange={(event) =>
                        setFormState((prev) => ({ ...prev, [field]: Number(event.target.value) }))
                      }
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
                    />
                  </label>
                ))}
              </div>

              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-600">Фото (по одному URL в рядок)</span>
                <textarea
                  value={formState.photos}
                  onChange={(event) => setFormState((prev) => ({ ...prev, photos: event.target.value }))}
                  className="h-24 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
                />
              </label>

              <div className="grid gap-4 rounded-2xl bg-purple-50/40 p-4 text-sm text-slate-700 md:grid-cols-3">
                <div>
                  <span className="text-xs uppercase text-purple-500">Собівартість</span>
                  <p className="text-lg font-semibold text-slate-900">{costPrice.toFixed(2)} ₴</p>
                </div>
                <div>
                  <span className="text-xs uppercase text-purple-500">Загальні витрати</span>
                  <p className="text-lg font-semibold text-slate-900">{totalCost.toFixed(2)} ₴</p>
                </div>
                <div>
                  <span className="text-xs uppercase text-purple-500">Прибуток</span>
                  <p className={profit >= 0 ? 'text-lg font-semibold text-emerald-600' : 'text-lg font-semibold text-rose-600'}>
                    {profit.toFixed(2)} ₴
                  </p>
                </div>
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
