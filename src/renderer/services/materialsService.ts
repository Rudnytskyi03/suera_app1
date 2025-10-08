import { Material } from '../types';

export async function fetchMaterials(): Promise<Material[]> {
  const rows = await window.api.materials.list();
  return rows;
}

export async function createMaterial(input: Omit<Material, 'id'>) {
  return window.api.materials.create(input);
}

export async function updateMaterial(id: number, input: Omit<Material, 'id'>) {
  return window.api.materials.update(id, input);
}

export async function deleteMaterial(id: number) {
  return window.api.materials.delete(id);
}
