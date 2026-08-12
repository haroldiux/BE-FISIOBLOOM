import { Role } from '@prisma/client';
import bcrypt from 'bcrypt';
import prisma from '../services/prisma';

async function main() {
  console.log('--- Iniciando Seeder Limpio ---');

  // =======================================================================
  // 1. TENANT & BRANCH
  // =======================================================================
  console.log('[1/3] Creando Tenant y Sucursal...');

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'aura' },
    update: {},
    create: {
      id: 'seed-tenant-aura',
      name: 'Aura FisioEstetica',
      slug: 'aura',
      plan: 'PREMIUM',
    },
  });

  const branch = await prisma.branch.upsert({
    where: { id: 'seed-branch-main' },
    update: {},
    create: {
      id: 'seed-branch-main',
      tenantId: tenant.id,
      name: 'Sucursal Principal Aura',
      address: 'Av. Insurgentes Sur 1234, Col. Del Valle, CDMX',
      phone: '+52 55 1234 5678',
    },
  });

  // =======================================================================
  // 2. USERS: SUPER_ADMIN, ADMIN, PHYSIO (3 usuarios)
  // =======================================================================
  console.log('[2/3] Creando Usuarios (SuperAdmin, Admin, Fisioterapeuta)...');

  const superadminPass = await bcrypt.hash('superadmin123', 10);
  const adminPass = await bcrypt.hash('admin123', 10);
  const carlosPass = await bcrypt.hash('carlos123', 10);

  const workingHours = {
    monday: { start: '09:00', end: '18:00' },
    tuesday: { start: '09:00', end: '18:00' },
    wednesday: { start: '09:00', end: '18:00' },
    thursday: { start: '09:00', end: '18:00' },
    friday: { start: '09:00', end: '18:00' },
    saturday: { start: '09:00', end: '14:00' },
    sunday: null,
  };

  // 1. Super Admin
  await prisma.user.upsert({
    where: { email_tenantId: { email: 'superadmin@aurafisio.com', tenantId: tenant.id } },
    update: { role: Role.SUPER_ADMIN, branchId: null },
    create: {
      email: 'superadmin@aurafisio.com',
      password: superadminPass,
      name: 'Super Administrador Global',
      role: Role.SUPER_ADMIN,
      isActive: true,
      workingHours,
      tenantId: tenant.id,
      branchId: null,
    },
  });

  // 2. Admin
  await prisma.user.upsert({
    where: { email_tenantId: { email: 'admin@aurafisio.com', tenantId: tenant.id } },
    update: { role: Role.ADMIN, branchId: branch.id },
    create: {
      email: 'admin@aurafisio.com',
      password: adminPass,
      name: 'Administrador Aura',
      role: Role.ADMIN,
      isActive: true,
      workingHours,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  // 3. Fisioterapeuta (Carlos Méndez)
  const carlosUser = await prisma.user.upsert({
    where: { email_tenantId: { email: 'carlos@aurafisio.com', tenantId: tenant.id } },
    update: { role: Role.PHYSIO, branchId: branch.id },
    create: {
      email: 'carlos@aurafisio.com',
      password: carlosPass,
      name: 'Carlos Mendez',
      role: Role.PHYSIO,
      isActive: true,
      workingHours,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  // =======================================================================
  // 3. PERFIL DE PERSONAL DE CARLOS
  // =======================================================================
  console.log('[3/3] Creando Perfil de Personal para Fisioterapeuta...');

  await prisma.staffProfile.upsert({
    where: { userId: carlosUser.id },
    update: { baseSalary: 1000.0, commissionRate: 0.10, salesTarget: 2000.0, tenantId: tenant.id },
    create: {
      userId: carlosUser.id,
      baseSalary: 1000.0,
      commissionRate: 0.10,
      salesTarget: 2000.0,
      tenantId: tenant.id,
    },
  });

  console.log('--- Seeder completado con éxito (Solo 3 usuarios) ---');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
