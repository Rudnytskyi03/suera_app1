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
      };
      products: {
        list: () => Promise<any[]>;
        save: (product: any) => Promise<any>;
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
