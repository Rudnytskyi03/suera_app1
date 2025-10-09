import type { SaveProductInput } from './services/productsService';

declare global {
  interface Window {
    api: {
      auth: {
        login: (email: string, password: string) => Promise<{ id: number; email: string }>;
      };
      materials: {
        list: () => Promise<any[]>;
        create: (material: any) => Promise<any>;
        update: (id: number, material: any) => Promise<any>;
        delete: (id: number) => Promise<{ success: boolean }>;
        receive: (
          id: number,
          receipt: { quantity: number; unitPrice: number; comment?: string; date?: string }
        ) => Promise<any>;
      };
      products: {
        list: () => Promise<any[]>;
        save: (product: SaveProductInput) => Promise<any>;
        delete: (id: number) => Promise<{ success: boolean }>;
      };
      orders: {
        list: () => Promise<any[]>;
        save: (order: any) => Promise<any>;
        delete: (id: number) => Promise<{ success: boolean }>;
        generateNumber: () => Promise<string>;
      };
      reports: {
        overview: () => Promise<any>;
      };
    };
  }
}

export {};
