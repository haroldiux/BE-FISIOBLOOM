import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { tenantContext } from './tenantContext';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const basePrisma = new PrismaClient({ adapter });

// Helper recursivo para inyectar tenantId en creaciones anidadas
function injectTenantIdRecursively(data: any, tenantId: string) {
  if (!data || typeof data !== 'object') return;

  // Si es un array (ej. data en createMany)
  if (Array.isArray(data)) {
    for (const item of data) {
      if (item && typeof item === 'object') {
        item.tenantId = tenantId;
        injectTenantIdRecursively(item, tenantId);
      }
    }
    return;
  }

  for (const key in data) {
    if (key === 'create' || key === 'createMany') {
      const val = data[key];
      if (Array.isArray(val)) {
        data[key] = val.map((item: any) => {
          if (item && typeof item === 'object') {
            item.tenantId = tenantId;
            injectTenantIdRecursively(item, tenantId);
          }
          return item;
        });
      } else if (typeof val === 'object' && val !== null) {
        if (val.data && Array.isArray(val.data)) {
          val.data = val.data.map((item: any) => {
            if (item && typeof item === 'object') {
              item.tenantId = tenantId;
              injectTenantIdRecursively(item, tenantId);
            }
            return item;
          });
        } else {
          val.tenantId = tenantId;
          injectTenantIdRecursively(val, tenantId);
        }
      }
    } else if (typeof data[key] === 'object' && data[key] !== null) {
      injectTenantIdRecursively(data[key], tenantId);
    }
  }
}

const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        // Omitir validación de tenantId en el modelo Tenant
        if (model === 'Tenant') {
          return query(args);
        }

        const store = tenantContext.getStore();
        const tenantId = store?.tenantId;
        const branchId = store?.branchId;

        // Si no hay tenantId en el contexto, proceder normalmente (ej: seed, tasks de sistema)
        if (!tenantId) {
          return query(args);
        }

        const modelsWithBranch = ['User', 'Patient', 'Appointment', 'Invoice', 'CashRegister', 'InventoryMovement', 'Branch'];
        const anyArgs = args as any;

        // 1. Filtrar lecturas generales por tenantId y branchId
        if (['findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy'].includes(operation)) {
          anyArgs.where = anyArgs.where || {};
          anyArgs.where.tenantId = tenantId;

          if (branchId && modelsWithBranch.includes(model)) {
            if (model === 'Branch') {
              anyArgs.where.id = branchId;
            } else {
              anyArgs.where.branchId = branchId;
            }
          }
        }

        if (operation === 'findUnique' || operation === 'findUniqueOrThrow') {
          const result = await query(args) as any;
          if (result && result.tenantId !== undefined && result.tenantId !== tenantId) {
            if (operation === 'findUniqueOrThrow') {
              throw new Error(`Registro no encontrado en el contexto de tenant.`);
            }
            return null;
          }
          return result;
        }

        // 3. Inyectar tenantId y branchId en creaciones (create, createMany)
        if (operation === 'create') {
          anyArgs.data = anyArgs.data || {};
          anyArgs.data.tenantId = tenantId;
          if (branchId && modelsWithBranch.includes(model) && model !== 'Branch') {
            anyArgs.data.branchId = branchId;
          }
          // Inyectar en creaciones anidadas
          injectTenantIdRecursively(anyArgs.data, tenantId);
        }

        if (operation === 'createMany') {
          if (anyArgs.data) {
            if (Array.isArray(anyArgs.data)) {
              anyArgs.data = anyArgs.data.map((item: any) => ({
                ...item,
                tenantId,
                ...(branchId && modelsWithBranch.includes(model) && model !== 'Branch' ? { branchId } : {}),
              }));
            } else {
              anyArgs.data.tenantId = tenantId;
              if (branchId && modelsWithBranch.includes(model) && model !== 'Branch') {
                anyArgs.data.branchId = branchId;
              }
            }
            injectTenantIdRecursively(anyArgs.data, tenantId);
          }
        }

        // 4. Inyectar tenantId en actualizaciones y eliminaciones
        if (['update', 'updateMany', 'delete', 'deleteMany', 'upsert'].includes(operation)) {
          anyArgs.where = anyArgs.where || {};
          anyArgs.where.tenantId = tenantId;
          if (branchId && modelsWithBranch.includes(model)) {
            if (model === 'Branch') {
              anyArgs.where.id = branchId;
            } else {
              anyArgs.where.branchId = branchId;
            }
          }

          if (operation === 'upsert') {
            anyArgs.create = anyArgs.create || {};
            anyArgs.create.tenantId = tenantId;
            if (branchId && modelsWithBranch.includes(model) && model !== 'Branch') {
              anyArgs.create.branchId = branchId;
            }
            injectTenantIdRecursively(anyArgs.create, tenantId);

            anyArgs.update = anyArgs.update || {};
            injectTenantIdRecursively(anyArgs.update, tenantId);
          } else if (operation === 'update') {
            injectTenantIdRecursively(anyArgs.data, tenantId);
          }
        }

        return query(args);
      },
    },
  },
});

export default prisma;
