import { AsyncLocalStorage } from 'async_hooks';

export interface TenantContext {
  tenantId?: string;
  branchId?: string;
}

export const tenantContext = new AsyncLocalStorage<TenantContext>();
