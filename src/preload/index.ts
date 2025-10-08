import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  auth: {
    login: (email: string, password: string) => ipcRenderer.invoke('auth:login', email, password)
  },
  materials: {
    list: () => ipcRenderer.invoke('materials:list'),
    create: (material: any) => ipcRenderer.invoke('materials:create', material),
    update: (id: number, material: any) => ipcRenderer.invoke('materials:update', id, material),
    delete: (id: number) => ipcRenderer.invoke('materials:delete', id)
  },
  products: {
    list: () => ipcRenderer.invoke('products:list'),
    save: (product: any) => ipcRenderer.invoke('products:save', product),
    delete: (id: number) => ipcRenderer.invoke('products:delete', id)
  },
  orders: {
    list: () => ipcRenderer.invoke('orders:list'),
    save: (order: any) => ipcRenderer.invoke('orders:save', order),
    delete: (id: number) => ipcRenderer.invoke('orders:delete', id),
    generateNumber: () => ipcRenderer.invoke('orders:generateNumber')
  },
  reports: {
    overview: () => ipcRenderer.invoke('reports:overview')
  }
});

export type ElectronAPI = typeof window.api;
