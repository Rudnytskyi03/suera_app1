import { Material, MaterialReceiptInput } from '../types';

export type MaterialSaveInput = {
  name: string;
  category: string;
  unit: Material['unit'];
  quantity: number;
  pricePerUnit: number;
  newPhoto?: { originalName: string; filePath: string };
  removePhoto?: boolean;
};

export async function fetchMaterials(): Promise<Material[]> {
  const rows = await window.api.materials.list();
  return rows;
}

export async function createMaterial(input: MaterialSaveInput) {
  return window.api.materials.create(input);
}

export async function updateMaterial(id: number, input: MaterialSaveInput) {
  return window.api.materials.update(id, input);
}

export async function deleteMaterial(id: number) {
  return window.api.materials.delete(id);
}

export async function recordMaterialReceipt(id: number, receipt: MaterialReceiptInput) {
  return window.api.materials.receive(id, receipt);
}
