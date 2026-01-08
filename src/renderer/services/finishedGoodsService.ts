import { FinishedBatch, FinishedComponentType, FinishedInventoryEntry, FinishedSizeStat } from '../types';

export type ProductionComponentInput = Partial<Record<FinishedComponentType, number>>;

export type RecordProductionInput = {
  productId: number;
  size?: string;
  sets?: number;
  producedAt?: string;
  note?: string;
  components: ProductionComponentInput;
  componentSizes: Partial<Record<FinishedComponentType, string>>;
  skipMaterialWriteOff?: boolean;
};

export type UpdateProductionBatchInput = RecordProductionInput & {
  batchId: number;
};

export async function fetchFinishedInventory(): Promise<FinishedInventoryEntry[]> {
  return window.api.finished.list();
}

export async function fetchFinishedHistory(): Promise<FinishedBatch[]> {
  return window.api.finished.history();
}

export async function fetchSizeSalesStats(): Promise<FinishedSizeStat[]> {
  return window.api.finished.sizeStats();
}

export async function recordProduction(input: RecordProductionInput) {
  return window.api.finished.produce(input);
}

export async function updateProductionBatch(input: UpdateProductionBatchInput) {
  return window.api.finished.update(input);
}

export async function deleteProductionBatch(batchId: number) {
  return window.api.finished.delete(batchId);
}
