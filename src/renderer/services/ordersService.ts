export async function fetchOrders() {
  return window.api.orders.list();
}

export async function saveOrder(order: any) {
  return window.api.orders.save(order);
}

export async function deleteOrder(id: number) {
  return window.api.orders.delete(id);
}

export async function generateOrderNumber() {
  return window.api.orders.generateNumber();
}
