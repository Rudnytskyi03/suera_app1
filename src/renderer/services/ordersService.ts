export type FinishedAllocationInput = {
  component: 'bra' | 'panties' | 'belt' | 'garter';
  size: string;
  quantity: number;
};

export type OrderItemInput = {
  productId: number;
  quantity: number;
  price: number;
  discount: number;
  allocations: FinishedAllocationInput[];
};

export type SaveOrderInput = {
  id?: number;
  orderNumber: string;
  customerFirstName: string;
  customerLastName: string;
  customerInstagram?: string;
  customerPhone?: string;
  customerBirthDate?: string;
  deliveryAddress?: string;
  status: 'new' | 'shipped' | 'returned' | 'completed';
  items: OrderItemInput[];
  totalAmount: number;
  orderDiscountPercent: number;
  clientId?: number | null;
};

export async function fetchOrders() {
  return window.api.orders.list();
}

export async function saveOrder(order: SaveOrderInput) {
  return window.api.orders.save(order);
}

export async function deleteOrder(id: number) {
  return window.api.orders.delete(id);
}

export async function generateOrderNumber() {
  return window.api.orders.generateNumber();
}
