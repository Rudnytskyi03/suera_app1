import { Product } from '../types';

export async function fetchProducts(): Promise<Product[]> {
  return window.api.products.list();
}

export async function saveProduct(product: Partial<Product> & { name: string }) {
  return window.api.products.save(product);
}

export async function deleteProduct(id: number) {
  return window.api.products.delete(id);
}
