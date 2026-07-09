import dotenv from 'dotenv';
dotenv.config();

import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { Role } from '@prisma/client';
import prismaClient from '../services/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key-12345';
console.log('DEBUG HELPERS JWT_SECRET:', JWT_SECRET);

// Usamos el cliente de prisma directo
export const prisma = prismaClient;

/**
 * Limpia todas las tablas de la base de datos en orden para evitar errores de claves foráneas.
 */
export async function cleanDatabase() {
  const tablenames = [
    'AuditLog',
    'ConsentDocument',
    'PatientPhoto',
    'InventoryMovement',
    'ServiceConsumable',
    'Commission',
    'PayrollEntry',
    'InvoiceItem',
    'Invoice',
    'CashMovement',
    'CashRegister',
    'SessionDetail',
    'Appointment',
    'RetouchSchedule',
    'TreatmentPackageLine',
    'TreatmentPackage',
    'Patient',
    'Product',
    'Service',
    'PackageTemplateLine',
    'PackageTemplate',
    'StaffProfile',
    'User',
    'Branch',
    'Tenant',
  ];

  // Desactivar temporalmente los triggers de integridad referencial si es necesario,
  // pero ejecutar DELETE en orden inverso es lo mas seguro y limpio.
  for (const table of tablenames) {
    try {
      await prisma.$executeRawUnsafe(`DELETE FROM "${table}";`);
    } catch (err) {
      // Si falla por dependencias de foreign key, intentamos con TRUNCATE CASCADE rapido
      try {
        await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE;`);
      } catch (e) {
        // Ignorar errores de tablas inexistentes
      }
    }
  }
}

/**
 * Genera un token JWT para un usuario
 */
export function generateToken(user: { id: string; email: string; role: Role; tenantId: string; branchId?: string | null }) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      branchId: user.branchId || undefined,
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

/**
 * Crea un conjunto de datos iniciales en la base de datos de prueba
 */
export async function seedTestDatabase() {
  // 1. Crear Tenant
  const tenant = await prisma.tenant.create({
    data: {
      id: 'test-tenant-id',
      name: 'Clinica Test Aura',
      slug: 'testaura',
      plan: 'PREMIUM',
    },
  });

  // 2. Crear Branch
  const branch = await prisma.branch.create({
    data: {
      id: 'test-branch-id',
      tenantId: tenant.id,
      name: 'Sucursal Test Norte',
      address: 'Calle Test 123',
      phone: '12345678',
    },
  });

  // 3. Contraseña hasheada
  const hashedPassword = await bcrypt.hash('password123', 10);

  const workingHours = {
    monday: { start: '08:00', end: '20:00' },
    tuesday: { start: '08:00', end: '20:00' },
    wednesday: { start: '08:00', end: '20:00' },
    thursday: { start: '08:00', end: '20:00' },
    friday: { start: '08:00', end: '20:00' },
    saturday: { start: '08:00', end: '20:00' },
    sunday: null,
  };

  // 4. Crear Usuarios
  const admin = await prisma.user.create({
    data: {
      id: 'test-user-admin-id',
      tenantId: tenant.id,
      branchId: branch.id,
      email: 'admin@test.com',
      password: hashedPassword,
      name: 'Admin Test',
      role: Role.ADMIN,
      workingHours,
    },
  });

  const physio = await prisma.user.create({
    data: {
      id: 'test-user-physio-id',
      tenantId: tenant.id,
      branchId: branch.id,
      email: 'physio@test.com',
      password: hashedPassword,
      name: 'Fisio Test',
      role: Role.PHYSIO,
      workingHours,
    },
  });

  const receptionist = await prisma.user.create({
    data: {
      id: 'test-user-recep-id',
      tenantId: tenant.id,
      branchId: branch.id,
      email: 'recep@test.com',
      password: hashedPassword,
      name: 'Recepcionista Test',
      role: Role.RECEPTIONIST,
      workingHours,
    },
  });

  const superAdmin = await prisma.user.create({
    data: {
      id: 'test-user-super-id',
      tenantId: tenant.id,
      email: 'superadmin@test.com',
      password: hashedPassword,
      name: 'Super Admin Test',
      role: Role.SUPER_ADMIN,
    },
  });

  // 5. Crear Servicios básicos
  const service = await prisma.service.create({
    data: {
      id: 'test-service-id',
      tenantId: tenant.id,
      name: 'Fisioterapia General',
      category: 'FISIOTERAPIA',
      treatmentType: 'SINGLE_SESSION',
      defaultDuration: 60,
      defaultPrice: 100,
    },
  });

  // 6. Crear Productos de inventario básicos
  const product = await prisma.product.create({
    data: {
      id: 'test-product-id',
      tenantId: tenant.id,
      name: 'Gel Conductor 1L',
      category: 'PRODUCTO',
      price: 25,
      stock: 50,
      unit: 'unidad',
    },
  });

  return {
    tenant,
    branch,
    service,
    product,
    admin: {
      user: admin,
      token: generateToken(admin),
    },
    physio: {
      user: physio,
      token: generateToken(physio),
    },
    receptionist: {
      user: receptionist,
      token: generateToken(receptionist),
    },
    superAdmin: {
      user: superAdmin,
      token: generateToken(superAdmin),
    },
  };
}
