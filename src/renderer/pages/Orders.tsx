import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, FilePlus2, Filter, PackageSearch, Search, ShoppingCart, Trash2 } from 'lucide-react';
import { fetchOrders, saveOrder, deleteOrder, generateOrderNumber } from '../services/ordersService';
import { fetchProducts } from '../services/productsService';
import { Order, Product } from '../types';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/ToastProvider';
import { format } from 'date-fns';

const statuses = [
  { value: 'all', label: 'Все статусы' },
  { value: 'new', label: '🆕 Нове' },
  { value: 'shipped', label: '📦 Відправлено' },
  { value: 'returned', label: '↩️ Повернуто' },
  { value: 'completed', label: '✅ Виконано' }
] as const;

type OrderFormState = {
  id?: number;
  orderNumber: string;
  customerFirstName: string;
  customerLastName: string;
  customerInstagram: string;
  deliveryAddress: string;
  status: Order['status'];
  items: Array<{ productId: number; quantity: number; price: number; discount: number }>;
};

const defaultForm: OrderFormState = {
  orderNumber: '',
  customerFirstName: '',
  customerLastName: '',
  customerInstagram: '',
  deliveryAddress: '',
  status: 'new',
  items: []
};

const OrdersPage: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<(typeof statuses)[number]['value']>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formState, setFormState] = useState<OrderFormState>(defaultForm);
  const { showToast } = useToast();

  const loadData = async () => {
    const [ordersData, productsData] = await Promise.all([fetchOrders(), fetchProducts()]);
    setOrders(ordersData);
    setProducts(productsData);
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesSearch =
        order.order_number?.toLowerCase().includes(search.toLowerCase()) ||
        `${order.customer_first_name} ${order.customer_last_name}`
          .toLowerCase()
          .includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [orders, search, statusFilter]);

  const openModal = async (order?: Order) => {
    if (order) {
      setFormState({
        id: order.id,
        orderNumber: order.order_number,
        customerFirstName: order.customer_first_name,
        customerLastName: order.customer_last_name,
        customerInstagram: order.customer_instagram ?? '',
        deliveryAddress: order.delivery_address ?? '',
        status: order.status,
        items: order.items.map((item) => ({
          productId: item.id,
          quantity: item.quantity,
          price: item.price,
          discount: item.discount
        }))
      });
    } else {
      const number = await generateOrderNumber();
      setFormState({ ...defaultForm, orderNumber: number });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setFormState({ ...defaultForm });
  };

  const totalAmount = useMemo(() => {
    return formState.items.reduce((acc, item) => acc + (item.price - item.discount) * item.quantity, 0);
  }, [formState.items]);

  const handleItemChange = (index: number, field: 'productId' | 'quantity' | 'price' | 'discount', value: string) => {
    setFormState((prev) => {
      const updated = [...prev.items];
      if (field === 'productId') {
        const product = products.find((p) => p.id === Number(value));
        updated[index] = {
          ...updated[index],
          productId: Number(value),
          price: product?.effectiveSalePrice ?? product?.salePrice ?? 0
        };
      } else {
        updated[index] = { ...updated[index], [field]: Number(value) };
      }
      return { ...prev, items: updated };
    });
  };

  const addItemRow = () => {
    if (products.length === 0) {
      showToast({ title: 'Немає доступних товарів', description: 'Створіть товар перед додаванням до замовлення', type: 'info' });
      return;
    }
    setFormState((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          productId: products[0].id,
          quantity: 1,
          price: products[0].effectiveSalePrice ?? products[0].salePrice,
          discount: 0
        }
      ]
    }));
  };

  const removeItemRow = (index: number) => {
    setFormState((prev) => ({ ...prev, items: prev.items.filter((_, idx) => idx !== index) }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const payload = {
        ...formState,
        totalAmount,
        items: formState.items.filter((item) => item.productId)
      };
      await saveOrder(payload);
      showToast({ title: formState.id ? 'Замовлення оновлено' : 'Замовлення створено', type: 'success' });
      closeModal();
      await loadData();
    } catch (error: any) {
      showToast({ title: 'Помилка збереження', description: error.message, type: 'error' });
    }
  };

  const handleDelete = async (order: Order) => {
    const confirmed = window.confirm(`Видалити замовлення ${order.order_number}?`);
    if (!confirmed) return;
    try {
      await deleteOrder(order.id);
      showToast({ title: 'Замовлення видалено', type: 'info' });
      await loadData();
    } catch (error: any) {
      showToast({ title: 'Помилка видалення', description: error.message, type: 'error' });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ShoppingCart}
        title="Заказы"
        description="Створюйте замовлення, слідкуйте за статусами та клієнтами."
        actions={
          <button
            onClick={() => openModal()}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:shadow-2xl"
          >
            <FilePlus2 className="h-4 w-4" /> Создать заказ
          </button>
        }
      />

      <div className="rounded-3xl bg-white/80 p-6 shadow-xl backdrop-blur">
        <div className="grid gap-4 md:grid-cols-3">
          <label className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm focus-within:border-purple-400 focus-within:ring-2 focus-within:ring-purple-200">
            <Search className="h-4 w-4 text-purple-500" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Пошук по номеру або клієнту"
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>
          <label className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm focus-within:border-purple-400 focus-within:ring-2 focus-within:ring-purple-200">
            <Filter className="h-4 w-4 text-purple-500" />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as any)}
              className="w-full bg-transparent text-sm outline-none"
            >
              {statuses.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">№</th>
                <th className="px-4 py-3 text-left">Клієнт</th>
                <th className="px-4 py-3 text-left">Товари</th>
                <th className="px-4 py-3 text-left">Сума</th>
                <th className="px-4 py-3 text-left">Статус</th>
                <th className="px-4 py-3 text-left">Дата</th>
                <th className="px-4 py-3 text-right">Дії</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOrders.map((order) => (
                <tr key={order.id} className="transition hover:bg-purple-50/40">
                  <td className="px-4 py-3 font-semibold text-slate-800">{order.order_number}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="font-medium text-slate-800">
                        {order.customer_first_name} {order.customer_last_name}
                      </span>
                      {order.customer_instagram && (
                        <span className="text-xs text-purple-500">@{order.customer_instagram}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{order.items.reduce((acc, item) => acc + item.quantity, 0)} шт</td>
                  <td className="px-4 py-3 font-semibold text-slate-800">{order.total_amount.toLocaleString()} ₴</td>
                  <td className="px-4 py-3 text-slate-500">{statuses.find((status) => status.value === order.status)?.label}</td>
                  <td className="px-4 py-3 text-slate-500">{format(new Date(order.created_at), 'dd.MM.yyyy')}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => openModal(order)}
                        className="rounded-xl bg-purple-50 px-3 py-2 text-xs font-semibold text-purple-600 shadow-sm transition hover:bg-purple-100"
                      >
                        <PackageSearch className="mr-1 inline h-4 w-4" /> Деталі
                      </button>
                      <button
                        onClick={() => handleDelete(order)}
                        className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-500 shadow-sm transition hover:bg-rose-100"
                      >
                        <Trash2 className="mr-1 inline h-4 w-4" /> Видалити
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                    Немає замовлень.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-4xl rounded-3xl bg-white p-8 shadow-2xl">
            <h2 className="text-xl font-semibold text-slate-900">{formState.id ? 'Редагування замовлення' : 'Нове замовлення'}</h2>
            <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-600">Номер замовлення</span>
                  <input
                    value={formState.orderNumber}
                    onChange={(event) => setFormState((prev) => ({ ...prev, orderNumber: event.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
                    required
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-600">Instagram</span>
                  <input
                    value={formState.customerInstagram}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, customerInstagram: event.target.value.replace('@', '') }))
                    }
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
                    placeholder="instagram"
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-600">Ім'я</span>
                  <input
                    value={formState.customerFirstName}
                    onChange={(event) => setFormState((prev) => ({ ...prev, customerFirstName: event.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
                    required
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-600">Прізвище</span>
                  <input
                    value={formState.customerLastName}
                    onChange={(event) => setFormState((prev) => ({ ...prev, customerLastName: event.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
                    required
                  />
                </label>
              </div>

              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-600">Адреса доставки</span>
                <textarea
                  value={formState.deliveryAddress}
                  onChange={(event) => setFormState((prev) => ({ ...prev, deliveryAddress: event.target.value }))}
                  className="h-24 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-600">Статус</span>
                <select
                  value={formState.status}
                  onChange={(event) => setFormState((prev) => ({ ...prev, status: event.target.value as Order['status'] }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
                >
                  {statuses
                    .filter((status) => status.value !== 'all')
                    .map((status) => (
                      <option key={status.value} value={status.value}>
                        {status.label}
                      </option>
                    ))}
                </select>
              </label>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-700">Товари</h3>
                  <button
                    type="button"
                    onClick={addItemRow}
                    className="flex items-center gap-2 rounded-xl bg-purple-50 px-3 py-2 text-xs font-semibold text-purple-600 transition hover:bg-purple-100"
                  >
                    Додати товар
                  </button>
                </div>
                <div className="space-y-3">
                  {formState.items.map((item, index) => (
                    <div key={index} className="grid gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm md:grid-cols-[1.5fr_repeat(3,1fr)_auto]">
                      <select
                        value={item.productId}
                        onChange={(event) => handleItemChange(index, 'productId', event.target.value)}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
                      >
                        {products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(event) => handleItemChange(index, 'quantity', event.target.value)}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
                      />
                      <input
                        type="number"
                        min={0}
                        value={item.price}
                        onChange={(event) => handleItemChange(index, 'price', event.target.value)}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
                      />
                      <input
                        type="number"
                        min={0}
                        value={item.discount}
                        onChange={(event) => handleItemChange(index, 'discount', event.target.value)}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
                      />
                      <button
                        type="button"
                        onClick={() => removeItemRow(index)}
                        className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-500 shadow-sm transition hover:bg-rose-100"
                      >
                        Видалити
                      </button>
                      <div className="md:col-span-5 text-xs text-slate-500">
                        Сума: {((item.price - item.discount) * item.quantity).toFixed(2)} ₴
                      </div>
                    </div>
                  ))}
                  {formState.items.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-purple-200 bg-purple-50/40 p-6 text-center text-xs text-slate-500">
                      Додайте товари до замовлення
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl bg-purple-50/40 p-4 text-sm text-slate-700">
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-purple-500" />
                  <span className="font-semibold text-slate-800">Загальна сума: {totalAmount.toFixed(2)} ₴</span>
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
                  Зберегти замовлення
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrdersPage;
