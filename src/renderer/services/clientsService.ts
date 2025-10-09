export type ClientSalesFilters = {
  startDate?: string;
  endDate?: string;
};

export async function fetchClients() {
  return window.api.clients.list();
}

export async function fetchClientSalesStats(filters: ClientSalesFilters = {}) {
  return window.api.clients.salesStats(filters);
}
