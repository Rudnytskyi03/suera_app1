import { DiscountType, Product } from '../types';

export type SaveProductInput = {
  id?: number;
  name: string;
  description?: string;
  salePrice: number;
  discount: { type: DiscountType; value: number };
  materials: Array<{ id: number; quantity: number; pricePerUnit: number }>;
  productionExpenses: Array<{ label: string; amount: number }>;
  photosToKeep: number[];
  newPhotos: Array<{ originalName: string; filePath: string }>;
};

export async function fetchProducts(): Promise<Product[]> {
  return window.api.products.list();
}

export async function saveProduct(product: SaveProductInput) {
  return window.api.products.save(product);
}

export async function deleteProduct(id: number) {
  return window.api.products.delete(id);
}
