import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  FilePlus2,
  Filter,
  Gift,
  PackageSearch,
  Phone,
  PlusCircle,
  Search,
  ShoppingCart,
  Trash2,
  UserRound
} from 'lucide-react';
import { fetchOrders, saveOrder, deleteOrder, generateOrderNumber } from '../services/ordersService';
import { fetchProducts } from '../services/productsService';
import { fetchClients } from '../services/clientsService';
import { fetchFinishedInventory } from '../services/finishedGoodsService';
import { Client, FinishedComponentType, FinishedInventoryEntry, Order, Product } from '../types';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/ToastProvider';
import { differenceInCalendarDays, format, isBefore, parseISO, setYear, startOfDay } from 'date-fns';

const statuses = [
  { value: 'all', label: 'Усі статуси' },
  { value: 'new', label: '🆕 Нове' },
  { value: 'shipped', label: '📦 Відправлено' },
  { value: 'returned', label: '↩️ Повернуто' },
  { value: 'completed', label: '✅ Виконано' }
] as const;

const FINISHED_COMPONENTS: FinishedComponentType[] = ['bra', 'panties', 'belt', 'garter'];

const COMPONENT_LABELS: Record<FinishedComponentType, string> = {
  bra: 'Бра',
  panties: 'Трусики',
  belt: 'Пояс',
  garter: 'Гартер'
};

type ComponentAllocation = {
  size: string;
  quantity: number;
};

const rebalanceAllocations = (
  allocations: ComponentAllocation[],
  targetQuantity: number,
  preferredIndex = 0
): ComponentAllocation[] => {
  const sanitized = allocations.map((allocation) => ({
    size: allocation.size,
    quantity: Math.max(0, Math.floor(allocation.quantity))
  }));

  if (sanitized.length === 0) {
    return targetQuantity > 0 ? [{ size: '', quantity: targetQuantity }] : [];
  }

  let total = sanitized.reduce((acc, allocation) => acc + allocation.quantity, 0);

  if (total > targetQuantity) {
    let excess = total - targetQuantity;
    const order = sanitized
      .map((_, index) => index)
      .filter((index) => index !== preferredIndex)
      .concat(preferredIndex);

    for (const index of order) {
      if (excess <= 0) break;
      const deduct = Math.min(excess, sanitized[index].quantity);
      sanitized[index].quantity -= deduct;
      excess -= deduct;
    }
  }

  const filtered = sanitized.filter((allocation, index) => allocation.quantity > 0 || index === preferredIndex);
  if (filtered.length === 0) {
    return targetQuantity > 0 ? [{ size: '', quantity: targetQuantity }] : [];
  }

  total = filtered.reduce((acc, allocation) => acc + allocation.quantity, 0);
  if (total < targetQuantity) {
    const index = preferredIndex < filtered.length ? preferredIndex : 0;
    filtered[index] = {
      ...filtered[index],
      quantity: filtered[index].quantity + (targetQuantity - total)
    };
  }

  return filtered;
};

const normalizeAllocationsForQuantity = (
  allocations: Record<FinishedComponentType, ComponentAllocation[]>,
  quantity: number
): Record<FinishedComponentType, ComponentAllocation[]> => {
  const result: Record<FinishedComponentType, ComponentAllocation[]> = {
    bra: [],
    panties: [],
    belt: [],
    garter: []
  };

  for (const component of FINISHED_COMPONENTS) {
    result[component] = rebalanceAllocations(allocations[component] ?? [], quantity);
  }

  return result;
};

type OrderItemForm = {
  productId: number;
  quantity: number;
  price: number;
  discount: number;
  allocations: Record<FinishedComponentType, ComponentAllocation[]>;
};

type OrderFormState = {
  id?: number;
  orderNumber: string;
  customerFirstName: string;
  customerLastName: string;
  customerInstagram: string;
  customerPhone: string;
  customerBirthDate: string;
  clientId?: number | null;
  deliveryAddress: string;
  status: Order['status'];
  items: OrderItemForm[];
  orderDiscountPercent: number;
  expenses: Array<{ label: string; amount: number }>;
};

const defaultForm: OrderFormState = {
  orderNumber: '',
  customerFirstName: '',
  customerLastName: '',
  customerInstagram: '',
  customerPhone: '',
  customerBirthDate: '',
  clientId: null,
  deliveryAddress: '',
  status: 'new',
  items: [],
  orderDiscountPercent: 0,
  expenses: []
};

const OrdersPage: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [finishedInventory, setFinishedInventory] = useState<FinishedInventoryEntry[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<(typeof statuses)[number]['value']>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formState, setFormState] = useState<OrderFormState>(defaultForm);
  const { showToast } = useToast();

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
      return format(parseISO(value), 'dd.MM');
    } catch (error) {
      return '';
    }
  };

  const formatDate = (value?: string | null) => {
    if (!value) return '';
    try {
      return format(new Date(value), 'dd.MM.yyyy');
    } catch (error) {
      return '';
    }
  };

  const loadData = async () => {
    const [ordersData, productsData, clientsData, finishedData] = await Promise.all([
      fetchOrders(),
      fetchProducts(),
      fetchClients(),
      fetchFinishedInventory()
    ]);
    setOrders(ordersData);
    setProducts(productsData);
    setClients(clientsData);
    setFinishedInventory(finishedData);
  };

  const buildAllocationsFromOrderItem = (item: Order['items'][number]) => {
    const base: Record<FinishedComponentType, ComponentAllocation[]> = {
      bra: [],
      panties: [],
      belt: [],
      garter: []
    };

    for (const allocation of item.allocations ?? []) {
      base[allocation.component].push({ size: allocation.size, quantity: allocation.quantity });
    }

    for (const component of FINISHED_COMPONENTS) {
      if (base[component].length === 0) {
        base[component] = [{ size: '', quantity: item.quantity }];
      }
    }

    return normalizeAllocationsForQuantity(base, item.quantity);
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredOrders = useMemo(() => {
    const searchLower = search.toLowerCase().trim();
    const digitsSearch = search.replace(/\D/g, '');
    const hasSearch = searchLower.length > 0 || digitsSearch.length > 0;

    return orders.filter((order) => {
      const matchesSearch = !hasSearch
        ? true
        : order.order_number?.toLowerCase().includes(searchLower) ||
          `${order.customer_first_name} ${order.customer_last_name}`
            .toLowerCase()
            .includes(searchLower) ||
          (order.customer_instagram ?? '').toLowerCase().includes(searchLower) ||
          (digitsSearch.length >= 3 && (order.customer_phone ?? '').includes(digitsSearch));
      const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [orders, search, statusFilter]);

  const inventoryByProduct = useMemo(() => {
    const map = new Map<number, Record<FinishedComponentType, Record<string, number>>>();

    for (const entry of finishedInventory) {
      if (!map.has(entry.productId)) {
        map.set(entry.productId, {
          bra: {},
          panties: {},
          belt: {},
          garter: {}
        });
      }
      const record = map.get(entry.productId)!;
      for (const component of FINISHED_COMPONENTS) {
        const value = entry.components[component];
        if (value > 0) {
          record[component][entry.size] = value;
        }
      }
    }

    return map;
  }, [finishedInventory]);

  const getComponentAvailability = (productId: number, component: FinishedComponentType) => {
    const availability = inventoryByProduct.get(productId)?.[component] ?? {};
    return Object.values(availability).reduce((acc, value) => acc + value, 0);
  };

  const createAllocationsForProduct = (productId: number, quantity: number) => {
    const result: Record<FinishedComponentType, ComponentAllocation[]> = {
      bra: [],
      panties: [],
      belt: [],
      garter: []
    };

    for (const component of FINISHED_COMPONENTS) {
      const hasStock = getComponentAvailability(productId, component) > 0;
      result[component] = [
        {
          size: '',
          quantity: hasStock ? quantity : 0
        }
      ];
    }

    return result;
  };

  const normalizeAllocationsForProduct = (
    allocations: Record<FinishedComponentType, ComponentAllocation[]>,
    quantity: number,
    productId: number
  ): Record<FinishedComponentType, ComponentAllocation[]> => {
    const result: Record<FinishedComponentType, ComponentAllocation[]> = {
      bra: [],
      panties: [],
      belt: [],
      garter: []
    };

    for (const component of FINISHED_COMPONENTS) {
      const hasStock = getComponentAvailability(productId, component) > 0;
      const source = allocations[component] ?? [];
      result[component] = hasStock ? rebalanceAllocations(source, quantity) : [{ size: '', quantity: 0 }];
    }

    return result;
  };

  const matchedClient = useMemo(() => {
    const instagram = formState.customerInstagram.trim().toLowerCase();
    const phoneDigits = formState.customerPhone.replace(/\D/g, '');
    if (!instagram && phoneDigits.length < 3) {
      return undefined;
    }

    return clients.find((client) => {
      const clientInstagram = (client.instagram ?? '').toLowerCase();
      const clientPhoneDigits = (client.phone ?? '').replace(/\D/g, '');
      return (instagram && clientInstagram === instagram) || (phoneDigits && clientPhoneDigits === phoneDigits);
    });
  }, [clients, formState.customerInstagram, formState.customerPhone]);

  const activeClient = useMemo(() => {
    if (formState.clientId) {
      const existing = clients.find((client) => client.id === formState.clientId);
      if (existing) {
        return existing;
      }
    }
    return matchedClient;
  }, [clients, formState.clientId, matchedClient]);

  const upcomingBirthdayInfo = useMemo(() => {
    if (!activeClient?.birthDate) {
      return null;
    }

    try {
      const birth = parseISO(activeClient.birthDate);
      const today = startOfDay(new Date());
      let next = setYear(birth, today.getFullYear());
      if (isBefore(next, today)) {
        next = setYear(next, next.getFullYear() + 1);
      }
      const daysUntil = differenceInCalendarDays(next, today);
      return { next, daysUntil };
    } catch (error) {
      return null;
    }
  }, [activeClient]);

  useEffect(() => {
    if (!isModalOpen) {
      return;
    }

    setFormState((prev) => ({
      ...prev,
      items: prev.items.map((item) => ({
        ...item,
        allocations: normalizeAllocationsForProduct(item.allocations, item.quantity, item.productId)
      }))
    }));
  }, [finishedInventory, isModalOpen]);

  useEffect(() => {
    if (!isModalOpen || !matchedClient) {
      return;
    }

    setFormState((prev) => ({
      ...prev,
      clientId: matchedClient.id,
      customerFirstName: prev.customerFirstName || matchedClient.firstName || '',
      customerLastName: prev.customerLastName || matchedClient.lastName || '',
      customerPhone: prev.customerPhone || formatPhoneDisplay(matchedClient.phone) || '',
      customerBirthDate: prev.customerBirthDate || matchedClient.birthDate || ''
    }));
  }, [isModalOpen, matchedClient]);

  useEffect(() => {
    if (!isModalOpen || formState.id) {
      return;
    }

    if (!matchedClient && formState.clientId) {
      setFormState((prev) => ({ ...prev, clientId: null }));
    }
  }, [formState.clientId, formState.id, isModalOpen, matchedClient]);

  const openModal = async (order?: Order) => {
    if (order) {
      setFormState({
        id: order.id,
        orderNumber: order.order_number,
        customerFirstName: order.customer_first_name,
        customerLastName: order.customer_last_name,
        customerInstagram: order.customer_instagram ?? '',
        customerPhone: formatPhoneDisplay(order.customer_phone) ?? '',
        customerBirthDate: order.customer_birth_date ?? '',
        clientId: order.client_id ?? null,
        deliveryAddress: order.delivery_address ?? '',
        status: order.status,
        orderDiscountPercent: order.discount_percent ?? 0,
        items: order.items.map((item) => ({
          productId: item.id,
          quantity: item.quantity,
          price: item.price,
          discount: item.discount,
          allocations: buildAllocationsFromOrderItem(item)
        })),
        expenses: (order.expenses ?? []).map((expense) => ({
          label: expense.label,
          amount: expense.amount
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

  const subtotal = useMemo(() => {
    return formState.items.reduce((acc, item) => acc + (item.price - item.discount) * item.quantity, 0);
  }, [formState.items]);

  const sanitizedOrderDiscount = useMemo(() => {
    const value = Number(formState.orderDiscountPercent);
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Math.min(100, Math.max(0, value));
  }, [formState.orderDiscountPercent]);

  const discountAmount = useMemo(() => {
    return Math.round(((subtotal * sanitizedOrderDiscount) / 100) * 100) / 100;
  }, [subtotal, sanitizedOrderDiscount]);

  const totalAmount = useMemo(() => {
    return Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100);
  }, [subtotal, discountAmount]);

  const orderExpensesTotal = useMemo(() => {
    return formState.expenses.reduce((acc, expense) => acc + (Number(expense.amount) || 0), 0);
  }, [formState.expenses]);

  const productionCostTotal = useMemo(() => {
    return formState.items.reduce((acc, item) => {
      const product = products.find((product) => product.id === item.productId);
      const unitCost = product?.costPrice ?? 0;
      return acc + unitCost * item.quantity;
    }, 0);
  }, [formState.items, products]);

  const estimatedProfit = useMemo(() => {
    return Math.round((totalAmount - productionCostTotal - orderExpensesTotal) * 100) / 100;
  }, [totalAmount, productionCostTotal, orderExpensesTotal]);

  const handleItemChange = (index: number, field: 'productId' | 'quantity' | 'price' | 'discount', value: string) => {
    setFormState((prev) => {
      const updated = [...prev.items];
      const current = updated[index];
      if (!current) {
        return prev;
      }

      if (field === 'productId') {
        const productId = Number(value);
        const product = products.find((p) => p.id === productId);
        updated[index] = {
          ...current,
          productId,
          price: product?.effectiveSalePrice ?? product?.salePrice ?? current.price,
          allocations: createAllocationsForProduct(productId, current.quantity)
        };
      } else if (field === 'quantity') {
        const quantity = Math.max(1, Math.floor(Number(value)) || 1);
        updated[index] = {
          ...current,
          quantity,
          allocations: normalizeAllocationsForProduct(current.allocations, quantity, current.productId)
        };
      } else {
        updated[index] = { ...current, [field]: Number(value) };
      }

      return { ...prev, items: updated };
    });
  };

  const addItemRow = () => {
    if (products.length === 0) {
      showToast({ title: 'Немає доступних товарів', description: 'Створіть товар перед додаванням до замовлення', type: 'info' });
      return;
    }
    const defaultProduct = products[0];
    setFormState((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          productId: defaultProduct.id,
          quantity: 1,
          price: defaultProduct.effectiveSalePrice ?? defaultProduct.salePrice,
          discount: 0,
          allocations: createAllocationsForProduct(defaultProduct.id, 1)
        }
      ]
    }));
  };

  const removeItemRow = (index: number) => {
    setFormState((prev) => ({ ...prev, items: prev.items.filter((_, idx) => idx !== index) }));
  };

  const handleOrderExpenseChange = (index: number, field: 'label' | 'amount', value: string) => {
    setFormState((prev) => {
      const updated = [...prev.expenses];
      if (!updated[index]) {
        return prev;
      }
      if (field === 'label') {
        updated[index] = { ...updated[index], label: value };
      } else {
        updated[index] = { ...updated[index], amount: Number(value) };
      }
      return { ...prev, expenses: updated };
    });
  };

  const addOrderExpenseRow = () => {
    setFormState((prev) => ({
      ...prev,
      expenses: [...prev.expenses, { label: '', amount: 0 }]
    }));
  };

  const removeOrderExpenseRow = (index: number) => {
    setFormState((prev) => ({
      ...prev,
      expenses: prev.expenses.filter((_, idx) => idx !== index)
    }));
  };

  const addAllocationRow = (itemIndex: number, component: FinishedComponentType) => {
    setFormState((prev) => {
      const updated = [...prev.items];
      const current = updated[itemIndex];
      if (!current) return prev;
      const allocations = [...current.allocations[component], { size: '', quantity: 0 }];
      updated[itemIndex] = {
        ...current,
        allocations: {
          ...current.allocations,
          [component]: rebalanceAllocations(allocations, current.quantity, allocations.length - 1)
        }
      };
      return { ...prev, items: updated };
    });
  };

  const removeAllocationRow = (itemIndex: number, component: FinishedComponentType, allocationIndex: number) => {
    setFormState((prev) => {
      const updated = [...prev.items];
      const current = updated[itemIndex];
      if (!current) return prev;
      const allocations = [...current.allocations[component]];
      if (allocations.length <= 1) {
        updated[itemIndex] = {
          ...current,
          allocations: {
            ...current.allocations,
            [component]: [{ size: '', quantity: current.quantity }]
          }
        };
      } else {
        allocations.splice(allocationIndex, 1);
        updated[itemIndex] = {
          ...current,
          allocations: {
            ...current.allocations,
            [component]: rebalanceAllocations(allocations, current.quantity)
          }
        };
      }
      return { ...prev, items: updated };
    });
  };

  const handleAllocationSizeChange = (
    itemIndex: number,
    component: FinishedComponentType,
    allocationIndex: number,
    size: string
  ) => {
    setFormState((prev) => {
      const updated = [...prev.items];
      const current = updated[itemIndex];
      if (!current) return prev;
      const allocations = current.allocations[component].map((allocation, index) =>
        index === allocationIndex ? { ...allocation, size } : allocation
      );
      updated[itemIndex] = {
        ...current,
        allocations: {
          ...current.allocations,
          [component]: allocations
        }
      };
      return { ...prev, items: updated };
    });
  };

  const handleAllocationQuantityChange = (
    itemIndex: number,
    component: FinishedComponentType,
    allocationIndex: number,
    quantityValue: string
  ) => {
    setFormState((prev) => {
      const updated = [...prev.items];
      const current = updated[itemIndex];
      if (!current) return prev;
      const quantity = Math.max(0, Math.floor(Number(quantityValue)) || 0);
      const allocations = current.allocations[component].map((allocation, index) =>
        index === allocationIndex ? { ...allocation, quantity } : allocation
      );
      updated[itemIndex] = {
        ...current,
        allocations: {
          ...current.allocations,
          [component]: rebalanceAllocations(allocations, current.quantity, allocationIndex)
        }
      };
      return { ...prev, items: updated };
    });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const payloadItems = formState.items
        .filter((item) => item.productId)
        .map((item) => {
          for (const component of FINISHED_COMPONENTS) {
            const totalAllocated = item.allocations[component].reduce((acc, allocation) => acc + allocation.quantity, 0);
            const hasAvailability = getComponentAvailability(item.productId, component) > 0;
            const shouldValidate = hasAvailability || totalAllocated > 0;

            if (!shouldValidate) {
              continue;
            }

            if (totalAllocated !== item.quantity) {
              throw new Error(
                `${COMPONENT_LABELS[component]}: розподіліть ${item.quantity} од. (зараз ${totalAllocated})`
              );
            }
            if (
              item.allocations[component].some(
                (allocation) => allocation.quantity > 0 && !allocation.size.trim()
              )
            ) {
              throw new Error('Будь ласка, оберіть розмір для кожного елементу комплекту');
            }
          }

          return {
            productId: item.productId,
            quantity: item.quantity,
            price: item.price,
            discount: item.discount,
            allocations: FINISHED_COMPONENTS.flatMap((component) =>
              item.allocations[component]
                .filter((allocation) => allocation.quantity > 0 && allocation.size.trim())
                .map((allocation) => ({
                  component,
                  size: allocation.size,
                  quantity: allocation.quantity
                }))
            )
          };
        });

      if (payloadItems.length === 0) {
        throw new Error('Додайте хоча б один товар до замовлення');
      }

      const payload = {
        id: formState.id,
        orderNumber: formState.orderNumber,
        customerFirstName: formState.customerFirstName,
        customerLastName: formState.customerLastName,
        customerInstagram: formState.customerInstagram,
        customerPhone: formState.customerPhone,
        customerBirthDate: formState.customerBirthDate,
        deliveryAddress: formState.deliveryAddress,
        status: formState.status,
        clientId: formState.clientId ?? matchedClient?.id ?? null,
        totalAmount: Math.round(totalAmount * 100) / 100,
        orderDiscountPercent: sanitizedOrderDiscount,
        items: payloadItems,
        expenses: formState.expenses
          .filter((expense) => expense.label.trim())
          .map((expense) => ({
            label: expense.label.trim(),
            amount: Math.max(0, Number(expense.amount) || 0)
          }))
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
        title="Замовлення"
        description="Створюйте замовлення, слідкуйте за статусами та клієнтами."
        actions={
          <button
            onClick={() => openModal()}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:shadow-2xl"
          >
            <FilePlus2 className="h-4 w-4" /> Створити замовлення
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
              placeholder="Пошук за номером, клієнтом чи телефоном"
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>
          <label className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm focus-within:border-purple-400 focus-within:ring-2 focus-within:ring-purple-200">
            <Filter className="h-4 w-4 text-purple-500" />
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as (typeof statuses)[number]['value'])
              }
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
                      {order.customer_phone && (
                        <span className="text-xs text-slate-500">{formatPhoneDisplay(order.customer_phone)}</span>
                      )}
                      {order.customer_birth_date && (
                        <span className="text-xs text-rose-400">🎂 {formatBirthDate(order.customer_birth_date)}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{order.items.reduce((acc, item) => acc + item.quantity, 0)} шт.</td>
                  <td className="px-4 py-3 text-right">
                    <div className="font-semibold text-slate-800">{order.total_amount.toLocaleString()} ₴</div>
                    {order.discount_percent > 0 && (
                      <div className="text-xs font-medium text-pink-600">
                        -
                        {Number.isInteger(order.discount_percent)
                          ? order.discount_percent.toFixed(0)
                          : order.discount_percent.toFixed(1)}
                        %
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{statuses.find((status) => status.value === order.status)?.label}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(order.created_at)}</td>
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
          <div className="w-full max-w-4xl">
            <div className="max-h-[calc(100vh-2rem)] overflow-y-auto rounded-3xl bg-white p-6 sm:p-8 shadow-2xl">
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

              {activeClient && (
                <div className="rounded-2xl border border-purple-100 bg-purple-50/60 p-4 text-sm text-purple-700">
                  <div className="flex items-start gap-3">
                    <UserRound className="mt-1 h-4 w-4 text-purple-500" />
                    <div className="space-y-1">
                      <div className="font-semibold text-purple-700">
                        {activeClient.firstName}
                        {activeClient.lastName ? ` ${activeClient.lastName}` : ''}
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs text-purple-600">
                        {activeClient.instagram && <span>@{activeClient.instagram}</span>}
                        {activeClient.phone && <span>{formatPhoneDisplay(activeClient.phone)}</span>}
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-purple-500">
                        <span>{activeClient.totalOrders} замовлень</span>
                        {activeClient.lastOrderAt && <span>Останнє: {formatDate(activeClient.lastOrderAt)}</span>}
                      </div>
                      {upcomingBirthdayInfo && upcomingBirthdayInfo.daysUntil <= 30 && (
                        <div className="flex items-center gap-1 text-xs font-medium text-pink-500">
                          <Gift className="h-3.5 w-3.5" /> День народження{' '}
                          {upcomingBirthdayInfo.daysUntil === 0
                            ? 'сьогодні'
                            : `через ${upcomingBirthdayInfo.daysUntil} ${
                                upcomingBirthdayInfo.daysUntil === 1 ? 'день' : 'дні'
                              }`}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

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

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-600">Телефон</span>
                  <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm focus-within:border-purple-400 focus-within:ring-2 focus-within:ring-purple-200">
                    <Phone className="h-4 w-4 text-purple-500" />
                    <input
                      type="tel"
                      value={formState.customerPhone}
                      onChange={(event) =>
                        setFormState((prev) => ({
                          ...prev,
                          customerPhone: event.target.value.replace(/[^0-9+]/g, '')
                        }))
                      }
                      placeholder="+380..."
                      className="w-full bg-transparent outline-none"
                    />
                  </div>
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-600">Дата народження</span>
                  <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm focus-within:border-purple-400 focus-within:ring-2 focus-within:ring-purple-200">
                    <Calendar className="h-4 w-4 text-purple-500" />
                    <input
                      type="date"
                      value={formState.customerBirthDate}
                      onChange={(event) =>
                        setFormState((prev) => ({ ...prev, customerBirthDate: event.target.value }))
                      }
                      className="w-full bg-transparent outline-none"
                    />
                  </div>
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

              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-600">Знижка на замовлення (%)</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={formState.orderDiscountPercent}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setFormState((prev) => ({
                      ...prev,
                      orderDiscountPercent: Number.isFinite(value)
                        ? Math.min(100, Math.max(0, value))
                        : 0
                    }));
                  }}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
                />
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
                  {formState.items.map((item, index) => {
                    const productInventory = finishedInventory.filter((entry) => entry.productId === item.productId);
                    const totalsByComponent = FINISHED_COMPONENTS.reduce<Record<FinishedComponentType, number>>(
                      (acc, component) => {
                        acc[component] = productInventory.reduce(
                          (sum, entry) => sum + (entry.components[component] ?? 0),
                          0
                        );
                        return acc;
                      },
                      {
                        bra: 0,
                        panties: 0,
                        belt: 0,
                        garter: 0
                      }
                    );
                    const positiveCounts = FINISHED_COMPONENTS.map(
                      (component) => totalsByComponent[component] ?? 0
                    ).filter((value) => value > 0);
                    const setsAvailable = positiveCounts.length > 0 ? Math.min(...positiveCounts) : 0;
                    return (
                      <div key={index} className="space-y-4 rounded-2xl border border-slate-100 bg-white px-4 py-4 shadow-sm">
                        <div className="grid gap-3 md:grid-cols-[1.5fr_repeat(3,1fr)_auto]">
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
                        </div>
                        <div className="flex flex-col gap-2 text-xs text-slate-500 md:flex-row md:items-center md:justify-between">
                          <span>Сума: {((item.price - item.discount) * item.quantity).toFixed(2)} ₴</span>
                          <span>Готових комплектів на складі: {setsAvailable}</span>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          {FINISHED_COMPONENTS.map((component) => {
                            const allocations = item.allocations[component];
                            const allocatedTotal = allocations.reduce((acc, allocation) => acc + allocation.quantity, 0);
                            const available = inventoryByProduct.get(item.productId)?.[component] ?? {};
                            const sizeOptions = new Map<string, number>();
                            Object.entries(available).forEach(([size, quantity]) => sizeOptions.set(size, quantity));
                            allocations.forEach((allocation) => {
                              if (allocation.size && !sizeOptions.has(allocation.size)) {
                                sizeOptions.set(allocation.size, 0);
                              }
                            });
                            const options = Array.from(sizeOptions.entries()).sort((a, b) => a[0].localeCompare(b[0], 'uk', { numeric: true }));
                            const canRemove = allocations.length > 1;
                            return (
                              <div key={component} className="space-y-2 rounded-xl border border-slate-200 bg-white/60 p-3">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-semibold text-slate-700">{COMPONENT_LABELS[component]}</span>
                                  <span className="text-xs text-slate-500">
                                    Розподілено: {allocatedTotal} / {item.quantity}
                                  </span>
                                </div>
                                {options.length === 0 ? (
                                  <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50/60 p-3 text-xs text-rose-500">
                                    Немає доступних виробів на складі
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    {allocations.map((allocation, allocationIndex) => (
                                      <div key={allocationIndex} className="grid grid-cols-[minmax(0,1fr)_100px_auto] items-center gap-2">
                                        <select
                                          value={allocation.size}
                                          onChange={(event) =>
                                            handleAllocationSizeChange(index, component, allocationIndex, event.target.value)
                                          }
                                          className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
                                        >
                                          <option value="">Оберіть розмір</option>
                                          {options.map(([size, availableQty]) => (
                                            <option key={size} value={size}>
                                              {size} {availableQty > 0 ? `(${availableQty})` : '(0)'}
                                            </option>
                                          ))}
                                        </select>
                                        <input
                                          type="number"
                                          min={0}
                                          value={allocation.quantity}
                                          onChange={(event) =>
                                            handleAllocationQuantityChange(index, component, allocationIndex, event.target.value)
                                          }
                                          className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => removeAllocationRow(index, component, allocationIndex)}
                                          className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-500 shadow-sm transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
                                          disabled={!canRemove}
                                        >
                                          Видалити
                                        </button>
                                      </div>
                                    ))}
                                    <button
                                      type="button"
                                      onClick={() => addAllocationRow(index, component)}
                                      className="text-xs font-semibold text-purple-600 transition hover:text-purple-700"
                                    >
                                      Додати розмір
                                    </button>
                                    <div className="text-xs text-slate-500">
                                      Доступно:{' '}
                                      {options.length > 0
                                        ? options.map(([size, qty]) => `${size} (${qty})`).join(', ')
                                        : '—'}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  {formState.items.length === 0 && (

                    <div className="rounded-2xl border border-dashed border-purple-200 bg-purple-50/40 p-6 text-center text-xs text-slate-500">
                      Додайте товари до замовлення
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl bg-white/80 p-4 shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700">Витрати замовлення</h3>
                    <p className="text-xs text-slate-500">
                      Зафіксуйте витрати, що стосуються продажу: логістика, упаковка, реклама, комісії тощо.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addOrderExpenseRow}
                    className="inline-flex items-center gap-2 rounded-xl bg-purple-50 px-3 py-2 text-xs font-semibold text-purple-600 transition hover:bg-purple-100"
                  >
                    <PlusCircle className="h-4 w-4" /> Додати витрату
                  </button>
                </div>
                <div className="mt-3 space-y-3">
                  {formState.expenses.map((expense, index) => (
                    <div
                      key={index}
                      className="grid gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm md:grid-cols-[1.5fr_1fr_auto]"
                    >
                      <input
                        value={expense.label}
                        onChange={(event) => handleOrderExpenseChange(index, 'label', event.target.value)}
                        placeholder="Тип витрати"
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
                      />
                      <input
                        type="number"
                        min={0}
                        value={expense.amount}
                        onChange={(event) => handleOrderExpenseChange(index, 'amount', event.target.value)}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
                      />
                      <button
                        type="button"
                        onClick={() => removeOrderExpenseRow(index)}
                        className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-500 shadow-sm transition hover:bg-rose-100"
                      >
                        <Trash2 className="mr-1 inline h-4 w-4" /> Видалити
                      </button>
                    </div>
                  ))}
                  {formState.expenses.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-purple-200 bg-purple-50/40 p-6 text-center text-xs text-slate-500">
                      Додайте витрати, що виникли під час продажу, щоби бачити реальний прибуток замовлення
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl bg-purple-50/40 p-4 text-sm text-slate-700">
                <div className="flex items-center gap-3 text-slate-800">
                  <Calendar className="h-4 w-4 text-purple-500" />
                  <span className="font-semibold">Підсумок замовлення</span>
                </div>
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between text-slate-600">
                    <span>Проміжна сума</span>
                    <span>{subtotal.toFixed(2)} ₴</span>
                  </div>
                  {sanitizedOrderDiscount > 0 && (
                    <div className="flex items-center justify-between text-pink-600">
                      <span>
                        Знижка ({Number.isInteger(sanitizedOrderDiscount)
                          ? sanitizedOrderDiscount.toFixed(0)
                          : sanitizedOrderDiscount.toFixed(1)}
                        %)
                      </span>
                      <span>-{discountAmount.toFixed(2)} ₴</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-base font-semibold text-slate-800">
                    <span>До оплати</span>
                    <span>{totalAmount.toFixed(2)} ₴</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Собівартість виробництва</span>
                    <span>{productionCostTotal.toFixed(2)} ₴</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Витрати цього замовлення</span>
                    <span>{orderExpensesTotal.toFixed(2)} ₴</span>
                  </div>
                  <div
                    className={`flex items-center justify-between text-sm font-semibold ${
                      estimatedProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    <span>Очікуваний прибуток</span>
                    <span>{estimatedProfit.toFixed(2)} ₴</span>
                  </div>
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
        </div>
      )}
    </div>
  );
};

export default OrdersPage;
