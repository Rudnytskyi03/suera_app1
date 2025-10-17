export type Material = {
  id: number;
  name: string;
  category: string;
  unit: 'meters' | 'pieces';
  quantity: number;
  pricePerUnit: number;
  photoUrl?: string;
  photoPath?: string | null;
  braUnderwireSize: string | null;
  underwireUnitsPerBra: number | null;
};

export type MaterialReceiptInput = {
  quantity: number;
  unitPrice: number;
  comment?: string;
  date?: string;
};

export type ProductMaterial = {
  id: number;
  name: string;
  unit: 'meters' | 'pieces';
  pricePerUnit: number;
  quantity: number;
  availableQuantity: number;
};

export type ProductExpense = {
  id?: number;
  label: string;
  amount: number;
};

export type ProductPhoto = {
  id: number;
  url: string;
  path: string;
};

export type DiscountType = 'none' | 'percent' | 'fixed';

export type Product = {
  id: number;
  name: string;
  description: string;
  materials: ProductMaterial[];
  materialsCost: number;
  productionExpenses: ProductExpense[];
  productionCost: number;
  costPrice: number;
  salePrice: number;
  discountType: DiscountType;
  discountValue: number;
  discountAmount: number;
  effectiveSalePrice: number;
  profit: number;
  photos: ProductPhoto[];
  maxProductionQuantity: number;
};

export type OrderExpense = {
  id?: number;
  label: string;
  amount: number;
};

export type FinishedComponentType = 'bra' | 'panties' | 'belt' | 'garter';

export type OrderItem = {
  id: number;
  name: string;
  productId: number;
  quantity: number;
  price: number;
  discount: number;
  allocations: Array<{
    component: FinishedComponentType;
    size: string;
    quantity: number;
  }>;
};

export type Order = {
  id: number;
  order_number: string;
  customer_first_name: string;
  customer_last_name: string;
  customer_instagram?: string;
  customer_phone?: string;
  customer_birth_date?: string;
  client_id?: number | null;
  delivery_address?: string;
  discount_percent: number;
  status: 'new' | 'shipped' | 'returned' | 'completed';
  total_amount: number;
  created_at: string;
  expenses: OrderExpense[];
  items: Array<{
    id: number;
    name: string;
    quantity: number;
    price: number;
    discount: number;
    allocations: Array<{
      component: FinishedComponentType;
      size: string;
      quantity: number;
    }>;
  }>;
};

export type Client = {
  id: number;
  instagram?: string | null;
  firstName: string;
  lastName?: string | null;
  phone?: string | null;
  birthDate?: string | null;
  createdAt: string;
  totalOrders: number;
  lastOrderAt?: string | null;
  completedRevenue: number;
};

export type ClientSalesStat = {
  date: string;
  orders: number;
  revenue: number;
};

export type FinishedInventoryEntry = {
  id: number;
  productId: number;
  productName: string;
  size: string;
  components: Record<FinishedComponentType, number>;
  totalSets: number;
};

export type FinishedBatch = {
  id: number;
  productId: number;
  productName: string;
  size: string;
  sets: number;
  components: Record<FinishedComponentType, number>;
  note?: string | null;
  producedAt: string;
  skipMaterials: boolean;
};

export type FinishedSizeStat = {
  productId: number;
  productName: string;
  component: FinishedComponentType;
  size: string;
  sold: number;
};
