export type Material = {
  id: number;
  name: string;
  category: string;
  unit: 'meters' | 'pieces';
  quantity: number;
  pricePerUnit: number;
  photo?: string;
};

export type ProductMaterial = {
  id: number;
  name: string;
  unit: 'meters' | 'pieces';
  pricePerUnit: number;
  quantity: number;
};

export type Product = {
  id: number;
  name: string;
  description: string;
  materials: ProductMaterial[];
  costPrice: number;
  sewingCost: number;
  packagingCost: number;
  shippingCost: number;
  advertisingCost: number;
  salePrice: number;
  profit: number;
  photos: string[];
};

export type OrderItem = {
  id: number;
  name: string;
  productId: number;
  quantity: number;
  price: number;
  discount: number;
};

export type Order = {
  id: number;
  order_number: string;
  customer_first_name: string;
  customer_last_name: string;
  customer_instagram?: string;
  delivery_address?: string;
  status: 'new' | 'shipped' | 'returned' | 'completed';
  total_amount: number;
  created_at: string;
  items: Array<{
    id: number;
    name: string;
    quantity: number;
    price: number;
    discount: number;
  }>;
};
