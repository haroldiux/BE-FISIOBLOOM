import { Role, ServiceCategory, TreatmentType, AppointmentStatus, RetouchStatus, PaymentMethod, InvoiceStatus, CashStatus, MovementType, DiscountType } from '@prisma/client';
import bcrypt from 'bcrypt';
import prisma from '../services/prisma';

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function setTime(date: Date, hours: number, minutes: number = 0): Date {
  const d = new Date(date);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return setTime(d, 10, 0);
}

async function main() {
  const now = new Date();

  // =======================================================================
  // 1. TENANT & BRANCH
  // =======================================================================
  console.log('[1/15] Seeding Tenant and Branch...');

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
  // 2. USERS / PROFESSIONALS (5)
  // =======================================================================
  console.log('[2/15] Seeding users...');

  const adminPass = await bcrypt.hash('admin123', 10);
  const carlosPass = await bcrypt.hash('carlos123', 10);
  const javierPass = await bcrypt.hash('javier123', 10);
  const claraPass = await bcrypt.hash('clara123', 10);
  const recepPass = await bcrypt.hash('recep123', 10);

  const adminWorkingHours = {
    monday: { start: '09:00', end: '18:00' },
    tuesday: { start: '09:00', end: '18:00' },
    wednesday: { start: '09:00', end: '18:00' },
    thursday: { start: '09:00', end: '18:00' },
    friday: { start: '09:00', end: '18:00' },
    saturday: { start: '09:00', end: '14:00' },
    sunday: null,
  };

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@aurafisio.com' },
    update: {},
    create: {
      email: 'admin@aurafisio.com',
      password: adminPass,
      name: 'Administrador Aura',
      role: Role.ADMIN,
      isActive: true,
      workingHours: adminWorkingHours,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  const carlosWH = {
    monday: { start: '09:00', end: '18:00' },
    tuesday: { start: '09:00', end: '18:00' },
    wednesday: { start: '09:00', end: '18:00' },
    thursday: { start: '09:00', end: '18:00' },
    friday: { start: '09:00', end: '18:00' },
    saturday: { start: '09:00', end: '14:00' },
    sunday: null,
  };

  const carlosUser = await prisma.user.upsert({
    where: { email: 'carlos@aurafisio.com' },
    update: {},
    create: {
      email: 'carlos@aurafisio.com',
      password: carlosPass,
      name: 'Carlos Mendez',
      role: Role.PHYSIO,
      isActive: true,
      workingHours: carlosWH,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  const javierWH = {
    monday: { start: '08:00', end: '16:00' },
    tuesday: { start: '08:00', end: '16:00' },
    wednesday: { start: '08:00', end: '16:00' },
    thursday: { start: '08:00', end: '16:00' },
    friday: { start: '08:00', end: '16:00' },
    saturday: { start: '08:00', end: '12:00' },
    sunday: null,
  };

  const javierUser = await prisma.user.upsert({
    where: { email: 'javier@aurafisio.com' },
    update: {},
    create: {
      email: 'javier@aurafisio.com',
      password: javierPass,
      name: 'Dr. Javier Luna',
      role: Role.PHYSIO,
      isActive: true,
      workingHours: javierWH,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  const claraWH = {
    monday: { start: '10:00', end: '19:00' },
    tuesday: { start: '10:00', end: '19:00' },
    wednesday: { start: '10:00', end: '19:00' },
    thursday: { start: '10:00', end: '19:00' },
    friday: { start: '10:00', end: '19:00' },
    saturday: { start: '10:00', end: '19:00' },
    sunday: null,
  };

  const claraUser = await prisma.user.upsert({
    where: { email: 'clara@aurafisio.com' },
    update: {},
    create: {
      email: 'clara@aurafisio.com',
      password: claraPass,
      name: 'Lic. Clara Mendoza',
      role: Role.AESTHETICIAN,
      isActive: true,
      workingHours: claraWH,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  const recepWH = {
    monday: { start: '08:00', end: '17:00' },
    tuesday: { start: '08:00', end: '17:00' },
    wednesday: { start: '08:00', end: '17:00' },
    thursday: { start: '08:00', end: '17:00' },
    friday: { start: '08:00', end: '17:00' },
    saturday: { start: '08:00', end: '17:00' },
    sunday: null,
  };

  await prisma.user.upsert({
    where: { email: 'recepcion@aurafisio.com' },
    update: {},
    create: {
      email: 'recepcion@aurafisio.com',
      password: recepPass,
      name: 'Recepcionista Aura',
      role: Role.RECEPTIONIST,
      isActive: true,
      workingHours: recepWH,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });
  console.log('  5 users created.');

  // =======================================================================
  // 3. STAFF PROFILES (3 non-admin staff)
  // =======================================================================
  console.log('[3/15] Seeding StaffProfiles...');

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

  await prisma.staffProfile.upsert({
    where: { userId: javierUser.id },
    update: { baseSalary: 1200.0, commissionRate: 0.08, salesTarget: 3000.0, tenantId: tenant.id },
    create: {
      userId: javierUser.id,
      baseSalary: 1200.0,
      commissionRate: 0.08,
      salesTarget: 3000.0,
      tenantId: tenant.id,
    },
  });

  await prisma.staffProfile.upsert({
    where: { userId: claraUser.id },
    update: { baseSalary: 900.0, commissionRate: 0.12, salesTarget: 2500.0, tenantId: tenant.id },
    create: {
      userId: claraUser.id,
      baseSalary: 900.0,
      commissionRate: 0.12,
      salesTarget: 2500.0,
      tenantId: tenant.id,
    },
  });
  console.log('  3 StaffProfiles created.');

  // =======================================================================
  // 4. SERVICES (10)
  // =======================================================================
  console.log('[4/15] Seeding services...');

  const srvCavitacion = await prisma.service.upsert({
    where: { id: 'seed-srv-cavitacion' },
    update: {},
    create: {
      id: 'seed-srv-cavitacion',
      name: 'Cavitacion Ultrasonica',
      category: ServiceCategory.CORPORAL,
      treatmentType: TreatmentType.MULTI_SESSION,
      defaultDuration: 45,
      defaultPrice: 120,
      requiresConsent: true,
      tenantId: tenant.id,
    },
  });

  const srvMicroblading = await prisma.service.upsert({
    where: { id: 'seed-srv-microblading' },
    update: {},
    create: {
      id: 'seed-srv-microblading',
      name: 'Microblading de Cejas',
      category: ServiceCategory.ESTETICA,
      treatmentType: TreatmentType.RETOUCHABLE,
      defaultDuration: 120,
      defaultPrice: 350,
      retouchConfig: { retouchAfterDays: 30, maxRetouches: 1 },
      requiresConsent: true,
      tenantId: tenant.id,
    },
  });

  const srvFisio = await prisma.service.upsert({
    where: { id: 'seed-srv-fisio' },
    update: {},
    create: {
      id: 'seed-srv-fisio',
      name: 'Fisioterapia Postural',
      category: ServiceCategory.FISIOTERAPIA,
      treatmentType: TreatmentType.SINGLE_SESSION,
      defaultDuration: 50,
      defaultPrice: 90,
      requiresConsent: false,
      tenantId: tenant.id,
    },
  });

  const srvDrenaje = await prisma.service.upsert({
    where: { id: 'seed-srv-drenaje' },
    update: {},
    create: {
      id: 'seed-srv-drenaje',
      name: 'Drenaje Linfatico',
      category: ServiceCategory.CORPORAL,
      treatmentType: TreatmentType.MULTI_SESSION,
      defaultDuration: 50,
      defaultPrice: 110,
      requiresConsent: true,
      tenantId: tenant.id,
    },
  });

  const srvRadiofrecuencia = await prisma.service.upsert({
    where: { id: 'seed-srv-radiofrecuencia' },
    update: {},
    create: {
      id: 'seed-srv-radiofrecuencia',
      name: 'Radiofrecuencia Facial',
      category: ServiceCategory.FACIAL,
      treatmentType: TreatmentType.MULTI_SESSION,
      defaultDuration: 40,
      defaultPrice: 130,
      requiresConsent: true,
      tenantId: tenant.id,
    },
  });

  const srvMasaje = await prisma.service.upsert({
    where: { id: 'seed-srv-masaje' },
    update: {},
    create: {
      id: 'seed-srv-masaje',
      name: 'Masaje Descontracturante',
      category: ServiceCategory.FISIOTERAPIA,
      treatmentType: TreatmentType.SINGLE_SESSION,
      defaultDuration: 60,
      defaultPrice: 80,
      requiresConsent: false,
      tenantId: tenant.id,
    },
  });

  const srvPeeling = await prisma.service.upsert({
    where: { id: 'seed-srv-peeling' },
    update: {},
    create: {
      id: 'seed-srv-peeling',
      name: 'Peeling Quimico',
      category: ServiceCategory.FACIAL,
      treatmentType: TreatmentType.RETOUCHABLE,
      defaultDuration: 45,
      defaultPrice: 200,
      retouchConfig: { retouchAfterDays: 21, maxRetouches: 1 },
      requiresConsent: false,
      tenantId: tenant.id,
    },
  });

  await prisma.service.upsert({
    where: { id: 'seed-srv-depilacion' },
    update: {},
    create: {
      id: 'seed-srv-depilacion',
      name: 'Depilacion Laser',
      category: ServiceCategory.ESTETICA,
      treatmentType: TreatmentType.MULTI_SESSION,
      defaultDuration: 30,
      defaultPrice: 95,
      requiresConsent: true,
      tenantId: tenant.id,
    },
  });

  await prisma.service.upsert({
    where: { id: 'seed-srv-presoterapia' },
    update: {},
    create: {
      id: 'seed-srv-presoterapia',
      name: 'Presoterapia',
      category: ServiceCategory.CORPORAL,
      treatmentType: TreatmentType.MULTI_SESSION,
      defaultDuration: 40,
      defaultPrice: 85,
      requiresConsent: false,
      tenantId: tenant.id,
    },
  });

  await prisma.service.upsert({
    where: { id: 'seed-srv-facial' },
    update: {},
    create: {
      id: 'seed-srv-facial',
      name: 'Limpieza Facial Profunda',
      category: ServiceCategory.FACIAL,
      treatmentType: TreatmentType.SINGLE_SESSION,
      defaultDuration: 60,
      defaultPrice: 150,
      requiresConsent: false,
      tenantId: tenant.id,
    },
  });
  console.log('  10 services created.');

  // =======================================================================
  // 5. PRODUCTS (12)
  // =======================================================================
  console.log('[5/15] Seeding products...');

  const products = [
    { id: 'prod-1',  name: 'Gel Conductor Ultrasonido',  price: 25, stock: 50,  unit: 'ml' },
    { id: 'prod-2',  name: 'Crema Hidratante Aura',      price: 45, stock: 30,  unit: 'unidad' },
    { id: 'prod-3',  name: 'Agujas Microblading',        price: 5,  stock: 120, unit: 'unidad' },
    { id: 'prod-4',  name: 'Aceite Masajes',              price: 35, stock: 15,  unit: 'ml' },
    { id: 'prod-5',  name: 'Protector Solar FPS 50',      price: 35, stock: 2,   unit: 'unidad' },
    { id: 'prod-6',  name: 'Serum Acido Hialuronico',    price: 55, stock: 8,   unit: 'unidad' },
    { id: 'prod-7',  name: 'Toallas Desechables',         price: 3,  stock: 200, unit: 'unidad' },
    { id: 'prod-8',  name: 'Guantes Nitrilo',             price: 12, stock: 3,   unit: 'unidad' },
    { id: 'prod-9',  name: 'Mascarilla Colageno',         price: 25, stock: 40,  unit: 'unidad' },
    { id: 'prod-10', name: 'Banda Elastica',              price: 18, stock: 15,  unit: 'unidad' },
    { id: 'prod-11', name: 'Gel Refrescante Post-Laser',  price: 30, stock: 22,  unit: 'unidad' },
    { id: 'prod-12', name: 'Ampollas Vitamina C',         price: 40, stock: 10,  unit: 'unidad' },
  ];

  for (const prod of products) {
    await prisma.product.upsert({
      where: { id: prod.id },
      update: { name: prod.name, price: prod.price, stock: prod.stock, unit: prod.unit, isActive: true },
      create: {
        id: prod.id,
        name: prod.name,
        category: 'PRODUCTO',
        price: prod.price,
        stock: prod.stock,
        unit: prod.unit,
        isActive: true,
        tenantId: tenant.id,
      },
    });
  }
  console.log('  12 products created.');

  // =======================================================================
  // 6. SERVICE CONSUMABLES (9)
  // =======================================================================
  console.log('[6/15] Seeding service consumables...');

  const consumables = [
    { id: 'sc-cav-gel',          serviceId: 'seed-srv-cavitacion',     productId: 'prod-1',  quantity: 3 },
    { id: 'sc-micro-agujas',     serviceId: 'seed-srv-microblading',   productId: 'prod-3',  quantity: 1 },
    { id: 'sc-micro-guantes',    serviceId: 'seed-srv-microblading',   productId: 'prod-8',  quantity: 2 },
    { id: 'sc-facial-toallas',   serviceId: 'seed-srv-facial',         productId: 'prod-7',  quantity: 2 },
    { id: 'sc-facial-mascara',   serviceId: 'seed-srv-facial',         productId: 'prod-9',  quantity: 1 },
    { id: 'sc-drenaje-aceite',   serviceId: 'seed-srv-drenaje',        productId: 'prod-4',  quantity: 5 },
    { id: 'sc-radio-crema',      serviceId: 'seed-srv-radiofrecuencia', productId: 'prod-2', quantity: 2 },
    { id: 'sc-depil-gel',        serviceId: 'seed-srv-depilacion',     productId: 'prod-11', quantity: 3 },
    { id: 'sc-masaje-aceite',    serviceId: 'seed-srv-masaje',         productId: 'prod-4',  quantity: 3 },
  ];

  for (const sc of consumables) {
    await prisma.serviceConsumable.upsert({
      where: { id: sc.id },
      update: { quantity: sc.quantity, tenantId: tenant.id },
      create: {
        id: sc.id,
        serviceId: sc.serviceId,
        productId: sc.productId,
        quantity: sc.quantity,
        tenantId: tenant.id,
      },
    });
  }
  console.log('  9 consumable rules created.');

  // =======================================================================
  // 7. PATIENTS (20)
  // =======================================================================
  console.log('[7/15] Seeding patients...');

  const patSofia = await prisma.patient.upsert({
    where: { id: 'seed-pat-sofia' },
    update: {},
    create: {
      id: 'seed-pat-sofia',
      fullName: 'Sofia Hernandez P.',
      phone: '+52 55 1001-1001',
      email: 'sofia.hernandez@mail.com',
      consentSigned: true,
      medicalHistory: 'Sin alergias. Piel mixta.',
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  const patPedro = await prisma.patient.upsert({
    where: { id: 'seed-pat-pedro' },
    update: {},
    create: {
      id: 'seed-pat-pedro',
      fullName: 'Pedro Martinez',
      phone: '+52 55 1002-1002',
      email: 'pedro.martinez@mail.com',
      consentSigned: true,
      medicalHistory: 'Dolor de espalda cronico.',
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  const patMaria = await prisma.patient.upsert({
    where: { id: 'seed-pat-maria' },
    update: {},
    create: {
      id: 'seed-pat-maria',
      fullName: 'Maria Garcia',
      phone: '+52 55 1003-1003',
      email: 'maria.garcia@mail.com',
      consentSigned: true,
      medicalHistory: 'Rosacea leve, alergica a fragancias citricas.',
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  const patAna = await prisma.patient.upsert({
    where: { id: 'seed-pat-ana' },
    update: {},
    create: {
      id: 'seed-pat-ana',
      fullName: 'Ana Lopez',
      phone: '+52 55 1004-1004',
      email: 'ana.lopez@mail.com',
      consentSigned: true,
      medicalHistory: 'Implantes metalicos en rodilla derecha. No calor profundo.',
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  const patJuan = await prisma.patient.upsert({
    where: { id: 'seed-pat-juan' },
    update: {},
    create: {
      id: 'seed-pat-juan',
      fullName: 'Juan Perez',
      phone: '+52 55 1005-1005',
      email: 'juan.perez@mail.com',
      consentSigned: true,
      medicalHistory: 'Contractura lumbar cronica. Sin alergias.',
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  const patLaura = await prisma.patient.upsert({
    where: { id: 'seed-pat-laura' },
    update: {},
    create: {
      id: 'seed-pat-laura',
      fullName: 'Laura Rojas',
      phone: '+52 55 1006-1006',
      email: 'laura.rojas@mail.com',
      consentSigned: false,
      medicalHistory: null,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  const patDiego = await prisma.patient.upsert({
    where: { id: 'seed-pat-diego' },
    update: {},
    create: {
      id: 'seed-pat-diego',
      fullName: 'Diego Flores',
      phone: '+52 55 1007-1007',
      email: 'diego.flores@mail.com',
      consentSigned: true,
      medicalHistory: 'Piel sensible. No peelings fuertes.',
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  const patCarmen = await prisma.patient.upsert({
    where: { id: 'seed-pat-carmen' },
    update: {},
    create: {
      id: 'seed-pat-carmen',
      fullName: 'Carmen Ruiz',
      phone: '+52 55 1008-1008',
      email: 'carmen.ruiz@mail.com',
      consentSigned: true,
      medicalHistory: 'Sin antecedentes.',
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  const patRoberto = await prisma.patient.upsert({
    where: { id: 'seed-pat-roberto' },
    update: {},
    create: {
      id: 'seed-pat-roberto',
      fullName: 'Roberto Diaz',
      phone: '+52 55 1009-1009',
      email: 'roberto.diaz@mail.com',
      consentSigned: true,
      medicalHistory: 'Diabetes Tipo 2. No masajes fuertes en piernas.',
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  const patValeria = await prisma.patient.upsert({
    where: { id: 'seed-pat-valeria' },
    update: {},
    create: {
      id: 'seed-pat-valeria',
      fullName: 'Valeria Torres',
      phone: '+52 55 1010-1010',
      email: 'valeria.torres@mail.com',
      consentSigned: true,
      medicalHistory: 'Embarazo 2do trimestre. Solo masajes relajantes suaves.',
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  const patFernando = await prisma.patient.upsert({
    where: { id: 'seed-pat-fernando' },
    update: {},
    create: {
      id: 'seed-pat-fernando',
      fullName: 'Fernando Silva',
      phone: '+52 55 1011-1011',
      email: 'fernando.silva@mail.com',
      consentSigned: true,
      medicalHistory: 'Fumador. Piel deshidratada. Cicatrizacion lenta.',
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  const patGabriela = await prisma.patient.upsert({
    where: { id: 'seed-pat-gabriela' },
    update: {},
    create: {
      id: 'seed-pat-gabriela',
      fullName: 'Gabriela Ortega',
      phone: '+52 55 1012-1012',
      email: 'gabriela.ortega@mail.com',
      consentSigned: true,
      medicalHistory: 'Tiroiditis de Hashimoto. Piel muy seca.',
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  const patMiguel = await prisma.patient.upsert({
    where: { id: 'seed-pat-miguel' },
    update: {},
    create: {
      id: 'seed-pat-miguel',
      fullName: 'Miguel Angel Rios',
      phone: '+52 55 1013-1013',
      email: 'miguel.rios@mail.com',
      consentSigned: true,
      medicalHistory: 'Deportista. Contracturas frecuentes en gemelos.',
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  const patPatricia = await prisma.patient.upsert({
    where: { id: 'seed-pat-patricia' },
    update: {},
    create: {
      id: 'seed-pat-patricia',
      fullName: 'Patricia Nunez',
      phone: '+52 55 1014-1014',
      email: 'patricia.nunez@mail.com',
      consentSigned: true,
      medicalHistory: 'Menopausia. Flacidez abdominal y facial.',
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  const patEduardo = await prisma.patient.upsert({
    where: { id: 'seed-pat-eduardo' },
    update: {},
    create: {
      id: 'seed-pat-eduardo',
      fullName: 'Eduardo Herrera',
      phone: '+52 55 1015-1015',
      email: 'eduardo.herrera@mail.com',
      consentSigned: false,
      medicalHistory: 'Acne grado 2 en espalda.',
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  const patLucia = await prisma.patient.upsert({
    where: { id: 'seed-pat-lucia' },
    update: {},
    create: {
      id: 'seed-pat-lucia',
      fullName: 'Lucia Vargas',
      phone: '+52 55 1016-1016',
      email: 'lucia.vargas@mail.com',
      consentSigned: true,
      medicalHistory: 'Sin antecedentes. Piel normal.',
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  const patAndres = await prisma.patient.upsert({
    where: { id: 'seed-pat-andres' },
    update: {},
    create: {
      id: 'seed-pat-andres',
      fullName: 'Andres Castillo',
      phone: '+52 55 1017-1017',
      email: 'andres.castillo@mail.com',
      consentSigned: true,
      medicalHistory: 'Hernia discal L4-L5. Solo fisioterapia suave.',
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  const patDaniela = await prisma.patient.upsert({
    where: { id: 'seed-pat-daniela' },
    update: {},
    create: {
      id: 'seed-pat-daniela',
      fullName: 'Daniela Romero',
      phone: '+52 55 1018-1018',
      email: 'daniela.romero@mail.com',
      consentSigned: true,
      medicalHistory: 'Alergia al latex. Usar guantes especiales.',
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  const patRicardo = await prisma.patient.upsert({
    where: { id: 'seed-pat-ricardo' },
    update: {},
    create: {
      id: 'seed-pat-ricardo',
      fullName: 'Ricardo Mendoza',
      phone: '+52 55 1019-1019',
      email: 'ricardo.mendoza@mail.com',
      consentSigned: true,
      medicalHistory: 'Cicatrices queloides en pecho.',
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  const patBeatriz = await prisma.patient.upsert({
    where: { id: 'seed-pat-beatriz' },
    update: {},
    create: {
      id: 'seed-pat-beatriz',
      fullName: 'Beatriz Delgado',
      phone: '+52 55 1020-1020',
      email: 'beatriz.delgado@mail.com',
      consentSigned: true,
      medicalHistory: 'Rosacea y cuperosis. No vapor de ozono ni calor.',
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });
  console.log('  20 patients created.');

  // =======================================================================
  // 8. PACKAGE TEMPLATES (2)
  // =======================================================================
  console.log('[8/15] Seeding package templates...');

  await prisma.packageTemplate.upsert({
    where: { id: 'seed-pkg-reductor' },
    update: {},
    create: {
      id: 'seed-pkg-reductor',
      name: 'Plan Reductor Intensivo Cavitacion',
      description: 'Combo para reduccion corporal en abdomen y piernas.',
      validityDays: 90,
      totalPrice: 960,
      tenantId: tenant.id,
      lines: {
        create: [{
          tenantId: tenant.id,
          serviceId: srvCavitacion.id,
          sessions: 10,
        }],
      },
    },
  });

  await prisma.packageTemplate.upsert({
    where: { id: 'seed-pkg-facial-rejuvenecedor' },
    update: {},
    create: {
      id: 'seed-pkg-facial-rejuvenecedor',
      name: 'Plan Facial Rejuvenecedor',
      description: 'Combinacion de Limpieza Facial y Radiofrecuencia.',
      validityDays: 60,
      totalPrice: 1100,
      tenantId: tenant.id,
      lines: {
        create: [
          { tenantId: tenant.id, serviceId: 'seed-srv-facial', sessions: 5 },
          { tenantId: tenant.id, serviceId: 'seed-srv-radiofrecuencia', sessions: 5 },
        ],
      },
    },
  });
  console.log('  2 package templates created.');

  // =======================================================================
  // 9. TREATMENT PACKAGES (6)
  // =======================================================================
  console.log('[9/15] Seeding treatment packages...');

  const pkgLineMaria = await prisma.treatmentPackage.upsert({
    where: { id: 'pkg-maria-cavitacion' },
    update: {},
    create: {
      id: 'pkg-maria-cavitacion',
      patientId: patMaria.id,
      packageName: 'Plan Reductor Cavitacion',
      purchasedAt: now,
      expiresAt: daysFromNow(60),
      status: 'ACTIVE',
      tenantId: tenant.id,
      lines: {
        create: [{
          tenantId: tenant.id,
          serviceId: 'seed-srv-cavitacion',
          serviceName: 'Cavitacion Ultrasonica',
          totalSessions: 10,
          usedSessions: 6,
        }],
      },
    },
  });

  const pkgLineAna = await prisma.treatmentPackage.upsert({
    where: { id: 'pkg-ana-facial' },
    update: {},
    create: {
      id: 'pkg-ana-facial',
      patientId: patAna.id,
      packageName: 'Plan Facial Rejuvenecedor',
      purchasedAt: now,
      expiresAt: daysFromNow(45),
      status: 'ACTIVE',
      tenantId: tenant.id,
      lines: {
        create: [
          {
            tenantId: tenant.id,
            serviceId: 'seed-srv-facial',
            serviceName: 'Limpieza Facial Profunda',
            totalSessions: 5,
            usedSessions: 2,
          },
          {
            tenantId: tenant.id,
            serviceId: 'seed-srv-radiofrecuencia',
            serviceName: 'Radiofrecuencia Facial',
            totalSessions: 5,
            usedSessions: 1,
          },
        ],
      },
    },
  });

  await prisma.treatmentPackage.upsert({
    where: { id: 'pkg-diego-cavitacion' },
    update: {},
    create: {
      id: 'pkg-diego-cavitacion',
      patientId: patDiego.id,
      packageName: 'Cavitacion Reductora',
      purchasedAt: now,
      expiresAt: daysFromNow(90),
      status: 'ACTIVE',
      tenantId: tenant.id,
      lines: {
        create: [{
          tenantId: tenant.id,
          serviceId: 'seed-srv-cavitacion',
          serviceName: 'Cavitacion Ultrasonica',
          totalSessions: 10,
          usedSessions: 2,
        }],
      },
    },
  });

  await prisma.treatmentPackage.upsert({
    where: { id: 'pkg-gabriela-drenaje' },
    update: {},
    create: {
      id: 'pkg-gabriela-drenaje',
      patientId: patGabriela.id,
      packageName: 'Drenaje Linfatico Corporal',
      purchasedAt: now,
      expiresAt: daysFromNow(30),
      status: 'ACTIVE',
      tenantId: tenant.id,
      lines: {
        create: [{
          tenantId: tenant.id,
          serviceId: 'seed-srv-drenaje',
          serviceName: 'Drenaje Linfatico',
          totalSessions: 8,
          usedSessions: 4,
        }],
      },
    },
  });

  await prisma.treatmentPackage.upsert({
    where: { id: 'pkg-patricia-preso' },
    update: {},
    create: {
      id: 'pkg-patricia-preso',
      patientId: patPatricia.id,
      packageName: 'Combo Corporal Preso+Cav',
      purchasedAt: now,
      expiresAt: daysFromNow(75),
      status: 'ACTIVE',
      tenantId: tenant.id,
      lines: {
        create: [
          {
            tenantId: tenant.id,
            serviceId: 'seed-srv-presoterapia',
            serviceName: 'Presoterapia',
            totalSessions: 10,
            usedSessions: 3,
          },
          {
            tenantId: tenant.id,
            serviceId: 'seed-srv-cavitacion',
            serviceName: 'Cavitacion Ultrasonica',
            totalSessions: 5,
            usedSessions: 1,
          },
        ],
      },
    },
  });

  await prisma.treatmentPackage.upsert({
    where: { id: 'pkg-miguel-masaje' },
    update: {},
    create: {
      id: 'pkg-miguel-masaje',
      patientId: patMiguel.id,
      packageName: 'Plan Masaje Descontracturante',
      purchasedAt: now,
      expiresAt: daysFromNow(120),
      status: 'ACTIVE',
      tenantId: tenant.id,
      lines: {
        create: [{
          tenantId: tenant.id,
          serviceId: 'seed-srv-masaje',
          serviceName: 'Masaje Descontracturante',
          totalSessions: 12,
          usedSessions: 5,
        }],
      },
    },
  });
  console.log('  6 treatment packages created.');

  // Compute current week dates for appointments and invoices
  const currentDayOfWeek = now.getDay();
  const currMondayOffset = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek;
  const currMonday = new Date(now);
  currMonday.setDate(now.getDate() + currMondayOffset);
  const currTuesday = new Date(currMonday);
  currTuesday.setDate(currMonday.getDate() + 1);
  const currWednesday = new Date(currMonday);
  currWednesday.setDate(currMonday.getDate() + 2);
  const currThursday = new Date(currMonday);
  currThursday.setDate(currMonday.getDate() + 3);
  const currFriday = new Date(currMonday);
  currFriday.setDate(currMonday.getDate() + 4);
  const currSaturday = new Date(currMonday);
  currSaturday.setDate(currMonday.getDate() + 5);

  // =======================================================================
  // 10. APPOINTMENTS
  // =======================================================================
  console.log('[10/15] Seeding appointments...');

  const mon3WeeksAgo = getMondayOfWeek(now);
  mon3WeeksAgo.setDate(mon3WeeksAgo.getDate() - 21);
  const mon2WeeksAgo = new Date(mon3WeeksAgo);
  mon2WeeksAgo.setDate(mon2WeeksAgo.getDate() + 7);
  const monLastWeek = new Date(mon2WeeksAgo);
  monLastWeek.setDate(monLastWeek.getDate() + 7);

  // --- 10a. 3 WEEKS AGO ---
  console.log('  10a. 3 weeks ago...');

  const apptW3MariaCav1 = await prisma.appointment.upsert({
    where: { id: 'appt-w3-maria-cav1' },
    update: { status: AppointmentStatus.COMPLETADA },
    create: {
      id: 'appt-w3-maria-cav1',
      patientId: patMaria.id,
      professionalId: carlosUser.id,
      serviceId: 'seed-srv-cavitacion',
      dateTime: setTime(new Date(mon3WeeksAgo), 9, 0),
      duration: 45,
      status: AppointmentStatus.COMPLETADA,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.sessionDetail.upsert({
    where: { appointmentId: apptW3MariaCav1.id },
    update: {},
    create: {
      appointmentId: apptW3MariaCav1.id,
      evolutionNotes: 'Primera sesion de cavitacion. Abdomen y flancos. Tolerancia buena.',
      measurements: { weight: 68.5, waist: 82, hip: 104 },
      tenantId: tenant.id,
    },
  });

  const apptW3JuanFisio1 = await prisma.appointment.upsert({
    where: { id: 'appt-w3-juan-fisio1' },
    update: { status: AppointmentStatus.COMPLETADA },
    create: {
      id: 'appt-w3-juan-fisio1',
      patientId: patJuan.id,
      professionalId: javierUser.id,
      serviceId: 'seed-srv-fisio',
      dateTime: setTime(new Date(mon3WeeksAgo.getTime() + 86400000), 10, 0),
      duration: 50,
      status: AppointmentStatus.COMPLETADA,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.sessionDetail.upsert({
    where: { appointmentId: apptW3JuanFisio1.id },
    update: {},
    create: {
      appointmentId: apptW3JuanFisio1.id,
      evolutionNotes: 'Evaluacion postural inicial. Desbalance en cadera derecha. ROM limitado en flexion.',
      tenantId: tenant.id,
    },
  });

  const apptW3AnaLimp1 = await prisma.appointment.upsert({
    where: { id: 'appt-w3-ana-limp1' },
    update: { status: AppointmentStatus.COMPLETADA },
    create: {
      id: 'appt-w3-ana-limp1',
      patientId: patAna.id,
      professionalId: claraUser.id,
      serviceId: 'seed-srv-facial',
      dateTime: setTime(new Date(mon3WeeksAgo.getTime() + 2 * 86400000), 11, 0),
      duration: 60,
      status: AppointmentStatus.COMPLETADA,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.sessionDetail.upsert({
    where: { appointmentId: apptW3AnaLimp1.id },
    update: {},
    create: {
      appointmentId: apptW3AnaLimp1.id,
      evolutionNotes: 'Piel mixta. Limpieza profunda con microdermoabrasion suave. Buena respuesta.',
      tenantId: tenant.id,
    },
  });

  const apptW3DiegoCav1 = await prisma.appointment.upsert({
    where: { id: 'appt-w3-diego-cav1' },
    update: { status: AppointmentStatus.COMPLETADA },
    create: {
      id: 'appt-w3-diego-cav1',
      patientId: patDiego.id,
      professionalId: carlosUser.id,
      serviceId: 'seed-srv-cavitacion',
      dateTime: setTime(new Date(mon3WeeksAgo.getTime() + 3 * 86400000), 9, 0),
      duration: 45,
      status: AppointmentStatus.COMPLETADA,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  const apptW3GabrielaDren1 = await prisma.appointment.upsert({
    where: { id: 'appt-w3-gabriela-dren1' },
    update: { status: AppointmentStatus.COMPLETADA },
    create: {
      id: 'appt-w3-gabriela-dren1',
      patientId: patGabriela.id,
      professionalId: carlosUser.id,
      serviceId: 'seed-srv-drenaje',
      dateTime: setTime(new Date(mon3WeeksAgo.getTime() + 3 * 86400000), 14, 0),
      duration: 50,
      status: AppointmentStatus.COMPLETADA,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.appointment.upsert({
    where: { id: 'appt-w3-miguel-mas1' },
    update: { status: AppointmentStatus.COMPLETADA },
    create: {
      id: 'appt-w3-miguel-mas1',
      patientId: patMiguel.id,
      professionalId: javierUser.id,
      serviceId: 'seed-srv-masaje',
      dateTime: setTime(new Date(mon3WeeksAgo.getTime() + 4 * 86400000), 10, 0),
      duration: 60,
      status: AppointmentStatus.COMPLETADA,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  // --- 10b. 2 WEEKS AGO ---
  console.log('  10b. 2 weeks ago...');

  const apptW2MariaCav2 = await prisma.appointment.upsert({
    where: { id: 'appt-w2-maria-cav2' },
    update: { status: AppointmentStatus.COMPLETADA },
    create: {
      id: 'appt-w2-maria-cav2',
      patientId: patMaria.id,
      professionalId: carlosUser.id,
      serviceId: 'seed-srv-cavitacion',
      dateTime: setTime(new Date(mon2WeeksAgo), 9, 0),
      duration: 45,
      status: AppointmentStatus.COMPLETADA,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.sessionDetail.upsert({
    where: { appointmentId: apptW2MariaCav2.id },
    update: {},
    create: {
      appointmentId: apptW2MariaCav2.id,
      evolutionNotes: 'Segunda sesion. Reduccion de 1.5 cm en cintura. Paciente motivada.',
      measurements: { waist: 80.5, hip: 103 },
      tenantId: tenant.id,
    },
  });

  const apptW2PedroFisio1 = await prisma.appointment.upsert({
    where: { id: 'appt-w2-pedro-fisio1' },
    update: { status: AppointmentStatus.COMPLETADA },
    create: {
      id: 'appt-w2-pedro-fisio1',
      patientId: patPedro.id,
      professionalId: javierUser.id,
      serviceId: 'seed-srv-fisio',
      dateTime: setTime(new Date(mon2WeeksAgo), 10, 0),
      duration: 50,
      status: AppointmentStatus.COMPLETADA,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.appointment.upsert({
    where: { id: 'appt-w2-ana-radio1' },
    update: { status: AppointmentStatus.COMPLETADA },
    create: {
      id: 'appt-w2-ana-radio1',
      patientId: patAna.id,
      professionalId: claraUser.id,
      serviceId: 'seed-srv-radiofrecuencia',
      dateTime: setTime(new Date(mon2WeeksAgo.getTime() + 86400000), 11, 30),
      duration: 40,
      status: AppointmentStatus.COMPLETADA,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  const apptW2DiegoCav2 = await prisma.appointment.upsert({
    where: { id: 'appt-w2-diego-cav2' },
    update: { status: AppointmentStatus.COMPLETADA },
    create: {
      id: 'appt-w2-diego-cav2',
      patientId: patDiego.id,
      professionalId: carlosUser.id,
      serviceId: 'seed-srv-cavitacion',
      dateTime: setTime(new Date(mon2WeeksAgo.getTime() + 2 * 86400000), 9, 0),
      duration: 45,
      status: AppointmentStatus.COMPLETADA,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.appointment.upsert({
    where: { id: 'appt-w2-gabriela-dren2' },
    update: { status: AppointmentStatus.COMPLETADA },
    create: {
      id: 'appt-w2-gabriela-dren2',
      patientId: patGabriela.id,
      professionalId: carlosUser.id,
      serviceId: 'seed-srv-drenaje',
      dateTime: setTime(new Date(mon2WeeksAgo.getTime() + 2 * 86400000), 14, 0),
      duration: 50,
      status: AppointmentStatus.COMPLETADA,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.appointment.upsert({
    where: { id: 'appt-w2-miguel-mas2' },
    update: { status: AppointmentStatus.COMPLETADA },
    create: {
      id: 'appt-w2-miguel-mas2',
      patientId: patMiguel.id,
      professionalId: javierUser.id,
      serviceId: 'seed-srv-masaje',
      dateTime: setTime(new Date(mon2WeeksAgo.getTime() + 3 * 86400000), 10, 0),
      duration: 60,
      status: AppointmentStatus.COMPLETADA,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  const apptW2FernandoLimp1 = await prisma.appointment.upsert({
    where: { id: 'appt-w2-fernando-limp1' },
    update: { status: AppointmentStatus.COMPLETADA },
    create: {
      id: 'appt-w2-fernando-limp1',
      patientId: patFernando.id,
      professionalId: claraUser.id,
      serviceId: 'seed-srv-facial',
      dateTime: setTime(new Date(mon2WeeksAgo.getTime() + 3 * 86400000), 16, 0),
      duration: 60,
      status: AppointmentStatus.COMPLETADA,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.appointment.upsert({
    where: { id: 'appt-w2-patricia-preso1' },
    update: { status: AppointmentStatus.COMPLETADA },
    create: {
      id: 'appt-w2-patricia-preso1',
      patientId: patPatricia.id,
      professionalId: carlosUser.id,
      serviceId: 'seed-srv-presoterapia',
      dateTime: setTime(new Date(mon2WeeksAgo.getTime() + 4 * 86400000), 12, 0),
      duration: 40,
      status: AppointmentStatus.COMPLETADA,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  // --- 10c. LAST WEEK ---
  console.log('  10c. Last week...');

  await prisma.appointment.upsert({
    where: { id: 'appt-w1-maria-cav3' },
    update: { status: AppointmentStatus.COMPLETADA },
    create: {
      id: 'appt-w1-maria-cav3',
      patientId: patMaria.id,
      professionalId: carlosUser.id,
      serviceId: 'seed-srv-cavitacion',
      dateTime: setTime(new Date(monLastWeek), 9, 0),
      duration: 45,
      status: AppointmentStatus.COMPLETADA,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  const apptW1AnaLimp2 = await prisma.appointment.upsert({
    where: { id: 'appt-w1-ana-limp2' },
    update: { status: AppointmentStatus.COMPLETADA },
    create: {
      id: 'appt-w1-ana-limp2',
      patientId: patAna.id,
      professionalId: claraUser.id,
      serviceId: 'seed-srv-facial',
      dateTime: setTime(new Date(monLastWeek.getTime() + 86400000), 11, 30),
      duration: 60,
      status: AppointmentStatus.COMPLETADA,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  const apptW1GabrielaDren3 = await prisma.appointment.upsert({
    where: { id: 'appt-w1-gabriela-dren3' },
    update: { status: AppointmentStatus.COMPLETADA },
    create: {
      id: 'appt-w1-gabriela-dren3',
      patientId: patGabriela.id,
      professionalId: carlosUser.id,
      serviceId: 'seed-srv-drenaje',
      dateTime: setTime(new Date(monLastWeek.getTime() + 2 * 86400000), 9, 30),
      duration: 50,
      status: AppointmentStatus.COMPLETADA,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.appointment.upsert({
    where: { id: 'appt-w1-miguel-mas3' },
    update: { status: AppointmentStatus.COMPLETADA },
    create: {
      id: 'appt-w1-miguel-mas3',
      patientId: patMiguel.id,
      professionalId: javierUser.id,
      serviceId: 'seed-srv-masaje',
      dateTime: setTime(new Date(monLastWeek.getTime() + 2 * 86400000), 15, 0),
      duration: 60,
      status: AppointmentStatus.COMPLETADA,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.appointment.upsert({
    where: { id: 'appt-w1-patricia-cav1' },
    update: { status: AppointmentStatus.COMPLETADA },
    create: {
      id: 'appt-w1-patricia-cav1',
      patientId: patPatricia.id,
      professionalId: carlosUser.id,
      serviceId: 'seed-srv-cavitacion',
      dateTime: setTime(new Date(monLastWeek.getTime() + 3 * 86400000), 9, 0),
      duration: 45,
      status: AppointmentStatus.COMPLETADA,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.appointment.upsert({
    where: { id: 'appt-w1-ricardo-fisio1' },
    update: { status: AppointmentStatus.COMPLETADA },
    create: {
      id: 'appt-w1-ricardo-fisio1',
      patientId: patRicardo.id,
      professionalId: javierUser.id,
      serviceId: 'seed-srv-fisio',
      dateTime: setTime(new Date(monLastWeek.getTime() + 3 * 86400000), 10, 0),
      duration: 50,
      status: AppointmentStatus.COMPLETADA,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.appointment.upsert({
    where: { id: 'appt-w1-beatriz-limp1' },
    update: { status: AppointmentStatus.COMPLETADA },
    create: {
      id: 'appt-w1-beatriz-limp1',
      patientId: patBeatriz.id,
      professionalId: claraUser.id,
      serviceId: 'seed-srv-facial',
      dateTime: setTime(new Date(monLastWeek.getTime() + 4 * 86400000), 12, 0),
      duration: 60,
      status: AppointmentStatus.COMPLETADA,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  // --- 10d. YESTERDAY ---
  console.log('  10d. Yesterday...');
  const yesterday = daysAgo(1);

  const apptYestMariaLimp = await prisma.appointment.upsert({
    where: { id: 'appt-yest-maria-limp' },
    update: { status: AppointmentStatus.COMPLETADA },
    create: {
      id: 'appt-yest-maria-limp',
      patientId: patMaria.id,
      professionalId: claraUser.id,
      serviceId: 'seed-srv-facial',
      dateTime: setTime(yesterday, 10, 0),
      duration: 60,
      status: AppointmentStatus.COMPLETADA,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.sessionDetail.upsert({
    where: { appointmentId: apptYestMariaLimp.id },
    update: { evolutionNotes: 'Piel notablemente mas limpia. Comedones reducidos en un 60%. Se recomienda continuar rutina de skincare.' },
    create: {
      appointmentId: apptYestMariaLimp.id,
      evolutionNotes: 'Piel notablemente mas limpia. Comedones reducidos en un 60%. Se recomienda continuar rutina de skincare.',
      tenantId: tenant.id,
    },
  });

  const apptYestJuanFisio2 = await prisma.appointment.upsert({
    where: { id: 'appt-yest-juan-fisio2' },
    update: { status: AppointmentStatus.COMPLETADA },
    create: {
      id: 'appt-yest-juan-fisio2',
      patientId: patJuan.id,
      professionalId: javierUser.id,
      serviceId: 'seed-srv-fisio',
      dateTime: setTime(yesterday, 14, 0),
      duration: 50,
      status: AppointmentStatus.COMPLETADA,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.sessionDetail.upsert({
    where: { appointmentId: apptYestJuanFisio2.id },
    update: {},
    create: {
      appointmentId: apptYestJuanFisio2.id,
      evolutionNotes: 'Disminucion del dolor lumbar post-sesion. ROM mejorado un 20%. Ejercicios para casa.',
      tenantId: tenant.id,
    },
  });

  const apptYestEduardoDerma = await prisma.appointment.upsert({
    where: { id: 'appt-yest-eduardo-derma' },
    update: { status: AppointmentStatus.COMPLETADA },
    create: {
      id: 'appt-yest-eduardo-derma',
      patientId: patEduardo.id,
      professionalId: claraUser.id,
      serviceId: 'seed-srv-facial',
      dateTime: setTime(yesterday, 16, 0),
      duration: 60,
      status: AppointmentStatus.COMPLETADA,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.sessionDetail.upsert({
    where: { appointmentId: apptYestEduardoDerma.id },
    update: { evolutionNotes: 'Acne inflamatorio en mejillas. Se realizo limpieza profunda con extraccion. Indicado peroxido de benzoilo topico.' },
    create: {
      appointmentId: apptYestEduardoDerma.id,
      evolutionNotes: 'Acne inflamatorio en mejillas. Se realizo limpieza profunda con extraccion. Indicado peroxido de benzoilo topico.',
      tenantId: tenant.id,
    },
  });

  await prisma.appointment.upsert({
    where: { id: 'appt-yest-daniela-limp' },
    update: { status: AppointmentStatus.COMPLETADA },
    create: {
      id: 'appt-yest-daniela-limp',
      patientId: patDaniela.id,
      professionalId: claraUser.id,
      serviceId: 'seed-srv-facial',
      dateTime: setTime(yesterday, 12, 0),
      duration: 60,
      status: AppointmentStatus.COMPLETADA,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  const apptYestDanielaLimp = await prisma.appointment.upsert({
    where: { id: 'appt-yest-daniela-limp' },
    update: { status: AppointmentStatus.COMPLETADA },
    create: {
      id: 'appt-yest-daniela-limp',
      patientId: patDaniela.id,
      professionalId: claraUser.id,
      serviceId: 'seed-srv-facial',
      dateTime: setTime(yesterday, 12, 0),
      duration: 60,
      status: AppointmentStatus.COMPLETADA,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.sessionDetail.upsert({
    where: { appointmentId: apptYestDanielaLimp.id },
    update: {},
    create: {
      appointmentId: apptYestDanielaLimp.id,
      evolutionNotes: 'Primera sesion. Piel normal sin complicaciones. Buena tolerancia al tratamiento.',
      tenantId: tenant.id,
    },
  });

  // --- 10e. TODAY ---
  console.log('  10e. Today...');

  await prisma.appointment.upsert({
    where: { id: 'appt-today-maria-cav4' },
    update: {},
    create: {
      id: 'appt-today-maria-cav4',
      patientId: patMaria.id,
      professionalId: carlosUser.id,
      serviceId: 'seed-srv-cavitacion',
      dateTime: setTime(now, 9, 0),
      duration: 45,
      status: AppointmentStatus.PENDIENTE,
      cabin: 'Cabina 1',
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.appointment.upsert({
    where: { id: 'appt-today-juan-masaje' },
    update: {},
    create: {
      id: 'appt-today-juan-masaje',
      patientId: patJuan.id,
      professionalId: javierUser.id,
      serviceId: 'seed-srv-masaje',
      dateTime: setTime(now, 10, 0),
      duration: 60,
      status: AppointmentStatus.CONFIRMADA,
      cabin: 'Cabina 2',
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.appointment.upsert({
    where: { id: 'appt-today-ana-limpia' },
    update: {},
    create: {
      id: 'appt-today-ana-limpia',
      patientId: patAna.id,
      professionalId: claraUser.id,
      serviceId: 'seed-srv-facial',
      dateTime: setTime(now, 11, 30),
      duration: 60,
      status: AppointmentStatus.PENDIENTE,
      cabin: 'Cabina 1',
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.appointment.upsert({
    where: { id: 'appt-today-pedro-fisio2' },
    update: {},
    create: {
      id: 'appt-today-pedro-fisio2',
      patientId: patPedro.id,
      professionalId: javierUser.id,
      serviceId: 'seed-srv-fisio',
      dateTime: setTime(now, 14, 0),
      duration: 50,
      status: AppointmentStatus.CONFIRMADA,
      cabin: 'Cabina 2',
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.appointment.upsert({
    where: { id: 'appt-today-lucia-cav' },
    update: {},
    create: {
      id: 'appt-today-lucia-cav',
      patientId: patLucia.id,
      professionalId: carlosUser.id,
      serviceId: 'seed-srv-cavitacion',
      dateTime: setTime(now, 16, 0),
      duration: 45,
      status: AppointmentStatus.PENDIENTE,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.appointment.upsert({
    where: { id: 'appt-today-miguel-mas4' },
    update: {},
    create: {
      id: 'appt-today-miguel-mas4',
      patientId: patMiguel.id,
      professionalId: javierUser.id,
      serviceId: 'seed-srv-masaje',
      dateTime: setTime(now, 17, 0),
      duration: 60,
      status: AppointmentStatus.PENDIENTE,
      cabin: 'Cabina 2',
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.appointment.upsert({
    where: { id: 'appt-today-valeria-radio' },
    update: {},
    create: {
      id: 'appt-today-valeria-radio',
      patientId: patValeria.id,
      professionalId: claraUser.id,
      serviceId: 'seed-srv-radiofrecuencia',
      dateTime: setTime(now, 8, 0),
      duration: 40,
      status: AppointmentStatus.PENDIENTE,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.appointment.upsert({
    where: { id: 'appt-today-fernando-cav' },
    update: {},
    create: {
      id: 'appt-today-fernando-cav',
      patientId: patFernando.id,
      professionalId: carlosUser.id,
      serviceId: 'seed-srv-cavitacion',
      dateTime: setTime(now, 8, 30),
      duration: 45,
      status: AppointmentStatus.PENDIENTE,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.appointment.upsert({
    where: { id: 'appt-today-gabriela-dren' },
    update: {},
    create: {
      id: 'appt-today-gabriela-dren',
      patientId: patGabriela.id,
      professionalId: carlosUser.id,
      serviceId: 'seed-srv-drenaje',
      dateTime: setTime(now, 13, 0),
      duration: 50,
      status: AppointmentStatus.CONFIRMADA,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.appointment.upsert({
    where: { id: 'appt-today-patricia-preso' },
    update: {},
    create: {
      id: 'appt-today-patricia-preso',
      patientId: patPatricia.id,
      professionalId: carlosUser.id,
      serviceId: 'seed-srv-presoterapia',
      dateTime: setTime(now, 13, 30),
      duration: 40,
      status: AppointmentStatus.PENDIENTE,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.appointment.upsert({
    where: { id: 'appt-today-ricardo-fisio' },
    update: {},
    create: {
      id: 'appt-today-ricardo-fisio',
      patientId: patRicardo.id,
      professionalId: javierUser.id,
      serviceId: 'seed-srv-fisio',
      dateTime: setTime(now, 15, 0),
      duration: 50,
      status: AppointmentStatus.PENDIENTE,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.appointment.upsert({
    where: { id: 'appt-today-beatriz-limp' },
    update: {},
    create: {
      id: 'appt-today-beatriz-limp',
      patientId: patBeatriz.id,
      professionalId: claraUser.id,
      serviceId: 'seed-srv-facial',
      dateTime: setTime(now, 15, 30),
      duration: 60,
      status: AppointmentStatus.CONFIRMADA,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  // --- 10f. TOMORROW ---
  console.log('  10f. Tomorrow...');
  const tomorrow = daysFromNow(1);

  await prisma.appointment.upsert({
    where: { id: 'appt-tmw-gabriela-dren4' },
    update: {},
    create: {
      id: 'appt-tmw-gabriela-dren4',
      patientId: patGabriela.id,
      professionalId: carlosUser.id,
      serviceId: 'seed-srv-drenaje',
      dateTime: setTime(tomorrow, 9, 30),
      duration: 50,
      status: AppointmentStatus.PENDIENTE,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.appointment.upsert({
    where: { id: 'appt-tmw-patricia-preso2' },
    update: {},
    create: {
      id: 'appt-tmw-patricia-preso2',
      patientId: patPatricia.id,
      professionalId: carlosUser.id,
      serviceId: 'seed-srv-presoterapia',
      dateTime: setTime(tomorrow, 10, 30),
      duration: 40,
      status: AppointmentStatus.PENDIENTE,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.appointment.upsert({
    where: { id: 'appt-tmw-beatriz-laser' },
    update: {},
    create: {
      id: 'appt-tmw-beatriz-laser',
      patientId: patBeatriz.id,
      professionalId: claraUser.id,
      serviceId: 'seed-srv-depilacion',
      dateTime: setTime(tomorrow, 12, 0),
      duration: 30,
      status: AppointmentStatus.PENDIENTE,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.appointment.upsert({
    where: { id: 'appt-tmw-valeria-masaje' },
    update: {},
    create: {
      id: 'appt-tmw-valeria-masaje',
      patientId: patValeria.id,
      professionalId: javierUser.id,
      serviceId: 'seed-srv-masaje',
      dateTime: setTime(tomorrow, 14, 0),
      duration: 60,
      status: AppointmentStatus.CONFIRMADA,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.appointment.upsert({
    where: { id: 'appt-tmw-fernando-radio' },
    update: {},
    create: {
      id: 'appt-tmw-fernando-radio',
      patientId: patFernando.id,
      professionalId: claraUser.id,
      serviceId: 'seed-srv-radiofrecuencia',
      dateTime: setTime(tomorrow, 8, 0),
      duration: 40,
      status: AppointmentStatus.PENDIENTE,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.appointment.upsert({
    where: { id: 'appt-tmw-eduardo-cav' },
    update: {},
    create: {
      id: 'appt-tmw-eduardo-cav',
      patientId: patEduardo.id,
      professionalId: carlosUser.id,
      serviceId: 'seed-srv-cavitacion',
      dateTime: setTime(tomorrow, 11, 0),
      duration: 45,
      status: AppointmentStatus.PENDIENTE,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.appointment.upsert({
    where: { id: 'appt-tmw-sofia-fisio' },
    update: {},
    create: {
      id: 'appt-tmw-sofia-fisio',
      patientId: patSofia.id,
      professionalId: javierUser.id,
      serviceId: 'seed-srv-fisio',
      dateTime: setTime(tomorrow, 16, 0),
      duration: 50,
      status: AppointmentStatus.PENDIENTE,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  // --- 10g. THIS WEEK (rest of days) ---
  console.log('  10g. This week (Wed-Fri)...');

  await prisma.appointment.upsert({
    where: { id: 'appt-wed-diego-masaje' },
    update: {},
    create: {
      id: 'appt-wed-diego-masaje',
      patientId: patDiego.id,
      professionalId: javierUser.id,
      serviceId: 'seed-srv-masaje',
      dateTime: setTime(currWednesday, 10, 0),
      duration: 60,
      status: AppointmentStatus.PENDIENTE,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.appointment.upsert({
    where: { id: 'appt-wed-lucia-dren' },
    update: {},
    create: {
      id: 'appt-wed-lucia-dren',
      patientId: patLucia.id,
      professionalId: carlosUser.id,
      serviceId: 'seed-srv-drenaje',
      dateTime: setTime(currWednesday, 11, 0),
      duration: 50,
      status: AppointmentStatus.PENDIENTE,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.appointment.upsert({
    where: { id: 'appt-wed-daniela-limp' },
    update: {},
    create: {
      id: 'appt-wed-daniela-limp',
      patientId: patDaniela.id,
      professionalId: claraUser.id,
      serviceId: 'seed-srv-facial',
      dateTime: setTime(currWednesday, 14, 0),
      duration: 60,
      status: AppointmentStatus.PENDIENTE,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.appointment.upsert({
    where: { id: 'appt-thu-andres-fisio2' },
    update: {},
    create: {
      id: 'appt-thu-andres-fisio2',
      patientId: patAndres.id,
      professionalId: javierUser.id,
      serviceId: 'seed-srv-fisio',
      dateTime: setTime(currThursday, 9, 0),
      duration: 50,
      status: AppointmentStatus.PENDIENTE,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.appointment.upsert({
    where: { id: 'appt-thu-maria-preso' },
    update: {},
    create: {
      id: 'appt-thu-maria-preso',
      patientId: patMaria.id,
      professionalId: carlosUser.id,
      serviceId: 'seed-srv-presoterapia',
      dateTime: setTime(currThursday, 10, 0),
      duration: 40,
      status: AppointmentStatus.PENDIENTE,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.appointment.upsert({
    where: { id: 'appt-fri-ana-radio2' },
    update: {},
    create: {
      id: 'appt-fri-ana-radio2',
      patientId: patAna.id,
      professionalId: claraUser.id,
      serviceId: 'seed-srv-radiofrecuencia',
      dateTime: setTime(currFriday, 11, 0),
      duration: 40,
      status: AppointmentStatus.PENDIENTE,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.appointment.upsert({
    where: { id: 'appt-fri-carmen-limp' },
    update: {},
    create: {
      id: 'appt-fri-carmen-limp',
      patientId: patCarmen.id,
      professionalId: claraUser.id,
      serviceId: 'seed-srv-facial',
      dateTime: setTime(currFriday, 14, 0),
      duration: 60,
      status: AppointmentStatus.PENDIENTE,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.appointment.upsert({
    where: { id: 'appt-fri-roberto-fisio' },
    update: {},
    create: {
      id: 'appt-fri-roberto-fisio',
      patientId: patRoberto.id,
      professionalId: javierUser.id,
      serviceId: 'seed-srv-fisio',
      dateTime: setTime(currFriday, 16, 0),
      duration: 50,
      status: AppointmentStatus.PENDIENTE,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  // --- 10h. NEXT WEEK ---
  console.log('  10h. Next week...');
  const monNextWeek = new Date(monLastWeek);
  monNextWeek.setDate(monNextWeek.getDate() + 14);

  await prisma.appointment.upsert({
    where: { id: 'appt-nw-andres-fisio' },
    update: {},
    create: {
      id: 'appt-nw-andres-fisio',
      patientId: patAndres.id,
      professionalId: javierUser.id,
      serviceId: 'seed-srv-fisio',
      dateTime: setTime(new Date(monNextWeek), 10, 0),
      duration: 50,
      status: AppointmentStatus.PENDIENTE,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.appointment.upsert({
    where: { id: 'appt-nw-ricardo-masaje' },
    update: {},
    create: {
      id: 'appt-nw-ricardo-masaje',
      patientId: patRicardo.id,
      professionalId: javierUser.id,
      serviceId: 'seed-srv-masaje',
      dateTime: setTime(new Date(monNextWeek.getTime() + 86400000), 16, 0),
      duration: 60,
      status: AppointmentStatus.PENDIENTE,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.appointment.upsert({
    where: { id: 'appt-nw-daniela-radio' },
    update: {},
    create: {
      id: 'appt-nw-daniela-radio',
      patientId: patDaniela.id,
      professionalId: claraUser.id,
      serviceId: 'seed-srv-radiofrecuencia',
      dateTime: setTime(new Date(monNextWeek.getTime() + 2 * 86400000), 11, 0),
      duration: 40,
      status: AppointmentStatus.PENDIENTE,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.appointment.upsert({
    where: { id: 'appt-nw-fernando-cav' },
    update: {},
    create: {
      id: 'appt-nw-fernando-cav',
      patientId: patFernando.id,
      professionalId: carlosUser.id,
      serviceId: 'seed-srv-cavitacion',
      dateTime: setTime(new Date(monNextWeek.getTime() + 3 * 86400000), 9, 0),
      duration: 45,
      status: AppointmentStatus.PENDIENTE,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.appointment.upsert({
    where: { id: 'appt-nw-laura-limp' },
    update: {},
    create: {
      id: 'appt-nw-laura-limp',
      patientId: patLaura.id,
      professionalId: claraUser.id,
      serviceId: 'seed-srv-facial',
      dateTime: setTime(new Date(monNextWeek.getTime() + 4 * 86400000), 12, 0),
      duration: 60,
      status: AppointmentStatus.PENDIENTE,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.appointment.upsert({
    where: { id: 'appt-nw-eduardo-cav' },
    update: {},
    create: {
      id: 'appt-nw-eduardo-cav',
      patientId: patEduardo.id,
      professionalId: carlosUser.id,
      serviceId: 'seed-srv-cavitacion',
      dateTime: setTime(new Date(monNextWeek.getTime() + 4 * 86400000), 16, 0),
      duration: 45,
      status: AppointmentStatus.PENDIENTE,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });
  console.log('  63 appointments seeded across all weeks.');

  // =======================================================================
  // 11. RETOUCH SCHEDULES (6)
  // =======================================================================
  console.log('[11/15] Seeding retouch schedules...');

  // 1. Sofia -> Microblading (orig 15 days ago, retouch in 15 days)
  const origSofiaMicroDate = setTime(daysAgo(15), 10, 0);
  const apptSofiaMicroOrig = await prisma.appointment.upsert({
    where: { id: 'seed-appt-sofia-micro-orig' },
    update: { status: AppointmentStatus.COMPLETADA },
    create: {
      id: 'seed-appt-sofia-micro-orig',
      patientId: patSofia.id,
      professionalId: claraUser.id,
      serviceId: 'seed-srv-microblading',
      dateTime: origSofiaMicroDate,
      duration: 120,
      status: AppointmentStatus.COMPLETADA,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.sessionDetail.upsert({
    where: { appointmentId: apptSofiaMicroOrig.id },
    update: {},
    create: {
      appointmentId: apptSofiaMicroOrig.id,
      evolutionNotes: 'Diseno de cejas pelo a pelo completado. Excelente retencion inicial del pigmento.',
      tenantId: tenant.id,
    },
  });

  await prisma.retouchSchedule.upsert({
    where: { id: 'seed-retouch-sofia' },
    update: {},
    create: {
      id: 'seed-retouch-sofia',
      patientId: patSofia.id,
      serviceId: 'seed-srv-microblading',
      originalAppointmentId: apptSofiaMicroOrig.id,
      scheduledDate: daysFromNow(15),
      status: RetouchStatus.PENDING,
      retouchNumber: 1,
      tenantId: tenant.id,
    },
  });

  // 2. Carmen -> Peeling (orig 21 days ago, retouch TODAY - urgent)
  const origCarmenDate = setTime(daysAgo(21), 12, 0);
  const apptCarmenPeelingOrig = await prisma.appointment.upsert({
    where: { id: 'seed-appt-carmen-peeling-orig' },
    update: { status: AppointmentStatus.COMPLETADA },
    create: {
      id: 'seed-appt-carmen-peeling-orig',
      patientId: patCarmen.id,
      professionalId: claraUser.id,
      serviceId: 'seed-srv-peeling',
      dateTime: origCarmenDate,
      duration: 45,
      status: AppointmentStatus.COMPLETADA,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.sessionDetail.upsert({
    where: { appointmentId: apptCarmenPeelingOrig.id },
    update: {},
    create: {
      appointmentId: apptCarmenPeelingOrig.id,
      evolutionNotes: 'Peeling enzimatico en rostro. Descamacion leve esperada 3-5 dias.',
      tenantId: tenant.id,
    },
  });

  await prisma.retouchSchedule.upsert({
    where: { id: 'seed-retouch-carmen-urgent' },
    update: {},
    create: {
      id: 'seed-retouch-carmen-urgent',
      patientId: patCarmen.id,
      serviceId: 'seed-srv-peeling',
      originalAppointmentId: apptCarmenPeelingOrig.id,
      scheduledDate: setTime(now, 12, 0),
      status: RetouchStatus.PENDING,
      retouchNumber: 1,
      notes: 'Retoque vencido - contactar a la paciente con urgencia.',
      tenantId: tenant.id,
    },
  });

  // 3. Diego -> Peeling (orig 14 days ago, retouch in 7 days)
  const origDiegoPeelingDate = setTime(daysAgo(14), 14, 0);
  const apptDiegoPeelingOrig = await prisma.appointment.upsert({
    where: { id: 'seed-appt-diego-peeling-orig' },
    update: { status: AppointmentStatus.COMPLETADA },
    create: {
      id: 'seed-appt-diego-peeling-orig',
      patientId: patDiego.id,
      professionalId: claraUser.id,
      serviceId: 'seed-srv-peeling',
      dateTime: origDiegoPeelingDate,
      duration: 45,
      status: AppointmentStatus.COMPLETADA,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.sessionDetail.upsert({
    where: { appointmentId: apptDiegoPeelingOrig.id },
    update: {},
    create: {
      appointmentId: apptDiegoPeelingOrig.id,
      evolutionNotes: 'Peeling quimico en rostro. Tolerancia adecuada. Leve eritema post-tratamiento.',
      tenantId: tenant.id,
    },
  });

  await prisma.retouchSchedule.upsert({
    where: { id: 'seed-retouch-diego-peeling' },
    update: {},
    create: {
      id: 'seed-retouch-diego-peeling',
      patientId: patDiego.id,
      serviceId: 'seed-srv-peeling',
      originalAppointmentId: apptDiegoPeelingOrig.id,
      scheduledDate: daysFromNow(7),
      status: RetouchStatus.PENDING,
      retouchNumber: 1,
      notes: 'Confirmado por paciente via WhatsApp.',
      tenantId: tenant.id,
    },
  });

  // 4. Fernando -> Microblading (orig 10 days ago, retouch in 20 days)
  const origFernandoMicroDate = setTime(daysAgo(10), 9, 0);
  const apptFernandoMicroOrig = await prisma.appointment.upsert({
    where: { id: 'seed-appt-fernando-micro-orig' },
    update: { status: AppointmentStatus.COMPLETADA },
    create: {
      id: 'seed-appt-fernando-micro-orig',
      patientId: patFernando.id,
      professionalId: claraUser.id,
      serviceId: 'seed-srv-microblading',
      dateTime: origFernandoMicroDate,
      duration: 120,
      status: AppointmentStatus.COMPLETADA,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.sessionDetail.upsert({
    where: { appointmentId: apptFernandoMicroOrig.id },
    update: {},
    create: {
      appointmentId: apptFernandoMicroOrig.id,
      evolutionNotes: 'Microblading en cejas. Pigmentacion cuidadosa. Resultado preliminar satisfactorio.',
      tenantId: tenant.id,
    },
  });

  await prisma.retouchSchedule.upsert({
    where: { id: 'seed-retouch-fernando-micro' },
    update: {},
    create: {
      id: 'seed-retouch-fernando-micro',
      patientId: patFernando.id,
      serviceId: 'seed-srv-microblading',
      originalAppointmentId: apptFernandoMicroOrig.id,
      scheduledDate: daysFromNow(20),
      status: RetouchStatus.SCHEDULED,
      retouchNumber: 1,
      tenantId: tenant.id,
    },
  });

  // 5. Beatriz -> Peeling (orig 8 days ago, retouch in 13 days)
  const origBeatrizPeelingDate = setTime(daysAgo(8), 11, 0);
  const apptBeatrizPeelingOrig = await prisma.appointment.upsert({
    where: { id: 'seed-appt-beatriz-peeling-orig' },
    update: { status: AppointmentStatus.COMPLETADA },
    create: {
      id: 'seed-appt-beatriz-peeling-orig',
      patientId: patBeatriz.id,
      professionalId: claraUser.id,
      serviceId: 'seed-srv-peeling',
      dateTime: origBeatrizPeelingDate,
      duration: 45,
      status: AppointmentStatus.COMPLETADA,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.sessionDetail.upsert({
    where: { appointmentId: apptBeatrizPeelingOrig.id },
    update: {},
    create: {
      appointmentId: apptBeatrizPeelingOrig.id,
      evolutionNotes: 'Peeling suave adaptado a rosacea. Sin reacciones adversas.',
      tenantId: tenant.id,
    },
  });

  await prisma.retouchSchedule.upsert({
    where: { id: 'seed-retouch-beatriz-peeling' },
    update: {},
    create: {
      id: 'seed-retouch-beatriz-peeling',
      patientId: patBeatriz.id,
      serviceId: 'seed-srv-peeling',
      originalAppointmentId: apptBeatrizPeelingOrig.id,
      scheduledDate: daysFromNow(13),
      status: RetouchStatus.PENDING,
      retouchNumber: 1,
      tenantId: tenant.id,
    },
  });

  // 6. Lucia -> Microblading (orig 5 days ago, retouch in 25 days)
  const origLuciaMicroDate = setTime(daysAgo(5), 10, 0);
  const apptLuciaMicroOrig = await prisma.appointment.upsert({
    where: { id: 'seed-appt-lucia-micro-orig' },
    update: { status: AppointmentStatus.COMPLETADA },
    create: {
      id: 'seed-appt-lucia-micro-orig',
      patientId: patLucia.id,
      professionalId: claraUser.id,
      serviceId: 'seed-srv-microblading',
      dateTime: origLuciaMicroDate,
      duration: 120,
      status: AppointmentStatus.COMPLETADA,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.sessionDetail.upsert({
    where: { appointmentId: apptLuciaMicroOrig.id },
    update: {},
    create: {
      appointmentId: apptLuciaMicroOrig.id,
      evolutionNotes: 'Microblading inicial. Buena pigmentacion. Piel normal con respuesta esperada.',
      tenantId: tenant.id,
    },
  });

  await prisma.retouchSchedule.upsert({
    where: { id: 'seed-retouch-lucia-micro' },
    update: {},
    create: {
      id: 'seed-retouch-lucia-micro',
      patientId: patLucia.id,
      serviceId: 'seed-srv-microblading',
      originalAppointmentId: apptLuciaMicroOrig.id,
      scheduledDate: daysFromNow(25),
      status: RetouchStatus.PENDING,
      retouchNumber: 1,
      tenantId: tenant.id,
    },
  });
  console.log('  6 retouch schedules created.');

  // =======================================================================
  // 12. INVOICES (10)
  // =======================================================================
  console.log('[12/15] Seeding invoices...');

  const invW3MariaCav1 = await prisma.invoice.upsert({
    where: { id: 'seed-inv-w3-maria-cav1' },
    update: {},
    create: {
      id: 'seed-inv-w3-maria-cav1',
      patientId: patMaria.id,
      appointmentId: apptW3MariaCav1.id,
      subtotal: 120,
      tax: 0,
      total: 120,
      paymentMethod: PaymentMethod.EFECTIVO,
      status: InvoiceStatus.PAGADO,
      paidAt: setTime(currMonday, 9, 0),
      tenantId: tenant.id,
      branchId: branch.id,
      items: {
        create: [{
          tenantId: tenant.id,
          description: 'Cavitacion Ultrasonica - Sesion 1',
          unitPrice: 120,
          quantity: 1,
          total: 120,
        }],
      },
    },
  });

  const invW3JuanFisio1 = await prisma.invoice.upsert({
    where: { id: 'seed-inv-w3-juan-fisio1' },
    update: {},
    create: {
      id: 'seed-inv-w3-juan-fisio1',
      patientId: patJuan.id,
      appointmentId: apptW3JuanFisio1.id,
      subtotal: 90,
      tax: 0,
      total: 90,
      paymentMethod: PaymentMethod.TARJETA,
      reference: 'Terminal #001 - Aprobacion 897654',
      status: InvoiceStatus.PAGADO,
      paidAt: setTime(currMonday, 10, 0),
      tenantId: tenant.id,
      branchId: branch.id,
      items: {
        create: [{
          tenantId: tenant.id,
          description: 'Fisioterapia Postural - Sesion inicial',
          unitPrice: 90,
          quantity: 1,
          total: 90,
        }],
      },
    },
  });

  const invW2AnaLimp = await prisma.invoice.upsert({
    where: { id: 'seed-inv-w2-ana-limp' },
    update: {},
    create: {
      id: 'seed-inv-w2-ana-limp',
      patientId: patAna.id,
      appointmentId: apptW1AnaLimp2.id,
      subtotal: 150,
      tax: 0,
      total: 150,
      paymentMethod: PaymentMethod.EFECTIVO,
      status: InvoiceStatus.PAGADO,
      paidAt: setTime(currTuesday, 11, 0),
      tenantId: tenant.id,
      branchId: branch.id,
      items: {
        create: [{
          tenantId: tenant.id,
          description: 'Limpieza Facial Profunda',
          unitPrice: 150,
          quantity: 1,
          total: 150,
        }],
      },
    },
  });

  await prisma.invoice.upsert({
    where: { id: 'seed-inv-w2-pedro-fisio1' },
    update: {},
    create: {
      id: 'seed-inv-w2-pedro-fisio1',
      patientId: patPedro.id,
      appointmentId: apptW2PedroFisio1.id,
      subtotal: 90,
      tax: 0,
      total: 90,
      paymentMethod: PaymentMethod.TRANSFERENCIA,
      reference: 'SPEI-87654321',
      status: InvoiceStatus.PAGADO,
      paidAt: setTime(currTuesday, 10, 0),
      tenantId: tenant.id,
      branchId: branch.id,
      items: {
        create: [{
          tenantId: tenant.id,
          description: 'Fisioterapia Postural',
          unitPrice: 90,
          quantity: 1,
          total: 90,
        }],
      },
    },
  });

  await prisma.invoice.upsert({
    where: { id: 'seed-inv-w2-diego-cav2' },
    update: {},
    create: {
      id: 'seed-inv-w2-diego-cav2',
      patientId: patDiego.id,
      appointmentId: apptW2DiegoCav2.id,
      subtotal: 120,
      tax: 0,
      total: 120,
      paymentMethod: PaymentMethod.TARJETA,
      reference: 'Terminal #001 - Aprobacion 912345',
      status: InvoiceStatus.PAGADO,
      paidAt: setTime(currWednesday, 9, 0),
      tenantId: tenant.id,
      branchId: branch.id,
      items: {
        create: [{
          tenantId: tenant.id,
          description: 'Cavitacion Ultrasonica',
          unitPrice: 120,
          quantity: 1,
          total: 120,
        }],
      },
    },
  });

  await prisma.invoice.upsert({
    where: { id: 'seed-inv-w2-fernando-limp1' },
    update: {},
    create: {
      id: 'seed-inv-w2-fernando-limp1',
      patientId: patFernando.id,
      appointmentId: apptW2FernandoLimp1.id,
      subtotal: 150,
      tax: 0,
      total: 150,
      paymentMethod: PaymentMethod.BILLETERA_VIRTUAL,
      reference: 'Mercado Pago - #MP98765',
      status: InvoiceStatus.PAGADO,
      paidAt: setTime(currThursday, 16, 0),
      tenantId: tenant.id,
      branchId: branch.id,
      items: {
        create: [{
          tenantId: tenant.id,
          description: 'Limpieza Facial Profunda',
          unitPrice: 150,
          quantity: 1,
          total: 150,
        }],
      },
    },
  });

  await prisma.invoice.upsert({
    where: { id: 'seed-inv-w1-gabriela-dren3' },
    update: {},
    create: {
      id: 'seed-inv-w1-gabriela-dren3',
      patientId: patGabriela.id,
      appointmentId: apptW1GabrielaDren3.id,
      subtotal: 110,
      tax: 0,
      total: 110,
      paymentMethod: PaymentMethod.EFECTIVO,
      status: InvoiceStatus.PAGADO,
      paidAt: setTime(currThursday, 9, 30),
      tenantId: tenant.id,
      branchId: branch.id,
      items: {
        create: [{
          tenantId: tenant.id,
          description: 'Drenaje Linfatico',
          unitPrice: 110,
          quantity: 1,
          total: 110,
        }],
      },
    },
  });

  await prisma.invoice.upsert({
    where: { id: 'seed-inv-w1-ricardo-fisio1' },
    update: {},
    create: {
      id: 'seed-inv-w1-ricardo-fisio1',
      patientId: patRicardo.id,
      appointmentId: 'appt-w1-ricardo-fisio1',
      subtotal: 90,
      tax: 0,
      total: 90,
      paymentMethod: PaymentMethod.TARJETA,
      reference: 'Terminal #001 - Aprobacion 934567',
      status: InvoiceStatus.PAGADO,
      paidAt: setTime(currFriday, 10, 0),
      tenantId: tenant.id,
      branchId: branch.id,
      items: {
        create: [{
          tenantId: tenant.id,
          description: 'Fisioterapia Postural',
          unitPrice: 90,
          quantity: 1,
          total: 90,
        }],
      },
    },
  });

  const invYestMariaLimp = await prisma.invoice.upsert({
    where: { id: 'seed-inv-yest-maria-limp' },
    update: {},
    create: {
      id: 'seed-inv-yest-maria-limp',
      patientId: patMaria.id,
      appointmentId: apptYestMariaLimp.id,
      subtotal: 150,
      tax: 0,
      total: 150,
      paymentMethod: PaymentMethod.EFECTIVO,
      status: InvoiceStatus.PAGADO,
      paidAt: setTime(currFriday, 10, 0),
      tenantId: tenant.id,
      branchId: branch.id,
      items: {
        create: [{
          tenantId: tenant.id,
          description: 'Limpieza Facial Profunda',
          unitPrice: 150,
          quantity: 1,
          total: 150,
        }],
      },
    },
  });

  await prisma.invoice.upsert({
    where: { id: 'seed-inv-yest-juan-fisio2' },
    update: {},
    create: {
      id: 'seed-inv-yest-juan-fisio2',
      patientId: patJuan.id,
      appointmentId: apptYestJuanFisio2.id,
      subtotal: 90,
      tax: 0,
      total: 90,
      paymentMethod: PaymentMethod.TRANSFERENCIA,
      reference: 'SPEI-11223344',
      status: InvoiceStatus.PAGADO,
      paidAt: setTime(currSaturday, 14, 0),
      tenantId: tenant.id,
      branchId: branch.id,
      items: {
        create: [{
          tenantId: tenant.id,
          description: 'Fisioterapia Postural - Sesion seguimiento',
          unitPrice: 90,
          quantity: 1,
          total: 90,
        }],
      },
    },
  });
  console.log('  10 invoices created.');

  // =======================================================================
  // 13. CASH REGISTER
  // =======================================================================
  console.log('[13/15] Seeding cash register...');

  const todayOpening = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0, 0);

  const cashRegister = await prisma.cashRegister.upsert({
    where: { id: 'seed-cash-today' },
    update: {},
    create: {
      id: 'seed-cash-today',
      openedById: adminUser.id,
      openingDate: todayOpening,
      initialBalance: 300,
      expectedBalance: 415,
      status: CashStatus.OPEN,
      notes: 'Caja abierta al inicio de jornada.',
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.cashMovement.upsert({
    where: { id: 'seed-cashmov-income-1' },
    update: {},
    create: {
      id: 'seed-cashmov-income-1',
      cashRegisterId: cashRegister.id,
      userId: adminUser.id,
      type: MovementType.INCOME,
      amount: 150,
      description: 'Cobro de factura - Limpieza Facial Maria Garcia',
      invoiceId: invYestMariaLimp.id,
      tenantId: tenant.id,
    },
  });

  await prisma.cashMovement.upsert({
    where: { id: 'seed-cashmov-expense-1' },
    update: {},
    create: {
      id: 'seed-cashmov-expense-1',
      cashRegisterId: cashRegister.id,
      userId: adminUser.id,
      type: MovementType.EXPENSE,
      amount: 35,
      description: 'Compra de insumos - papel camilla y alcohol',
      tenantId: tenant.id,
    },
  });
  console.log('  Cash register OPEN with 2 movements.');

  // =======================================================================
  // 14. CAMPAIGNS (3) + COUPONS (3)
  // =======================================================================
  console.log('[14/15] Seeding campaigns and coupons...');

  const campVeranoStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const campVeranoEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const campVerano = await prisma.campaign.upsert({
    where: { id: 'camp-verano' },
    update: {},
    create: {
      id: 'camp-verano',
      name: 'Verano Radiante',
      description: '15% de descuento en todos los servicios faciales.',
      discountType: DiscountType.PERCENTAGE,
      discountValue: 15,
      startDate: campVeranoStart,
      endDate: campVeranoEnd,
      isActive: true,
      tenantId: tenant.id,
    },
  });

  const facialSvcs = ['seed-srv-facial', 'seed-srv-radiofrecuencia', 'seed-srv-peeling'];
  for (let i = 0; i < facialSvcs.length; i++) {
    await prisma.serviceCampaign.upsert({
      where: { id: 'sc-verano-' + i },
      update: {},
      create: {
        id: 'sc-verano-' + i,
        serviceId: facialSvcs[i],
        campaignId: campVerano.id,
        tenantId: tenant.id,
      },
    });
  }

  const campPost = await prisma.campaign.upsert({
    where: { id: 'camp-post' },
    update: {},
    create: {
      id: 'camp-post',
      name: 'Recuperacion Post-Vacacional',
      description: '$10 de descuento en servicios corporales.',
      discountType: DiscountType.FIXED,
      discountValue: 10,
      startDate: new Date(now.getFullYear(), now.getMonth(), 1),
      endDate: new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59),
      isActive: true,
      tenantId: tenant.id,
    },
  });

  const corporalSvcs = ['seed-srv-cavitacion', 'seed-srv-drenaje', 'seed-srv-presoterapia'];
  for (let i = 0; i < corporalSvcs.length; i++) {
    await prisma.serviceCampaign.upsert({
      where: { id: 'sc-post-' + i },
      update: {},
      create: {
        id: 'sc-post-' + i,
        serviceId: corporalSvcs[i],
        campaignId: campPost.id,
        tenantId: tenant.id,
      },
    });
  }

  const campNuevo = await prisma.campaign.upsert({
    where: { id: 'camp-nuevo' },
    update: {},
    create: {
      id: 'camp-nuevo',
      name: 'Nuevos Pacientes',
      description: '20% de descuento en servicios de estetica para nuevos pacientes.',
      discountType: DiscountType.PERCENTAGE,
      discountValue: 20,
      startDate: new Date(now.getFullYear(), now.getMonth(), 1),
      endDate: new Date(now.getFullYear(), now.getMonth() + 3, 0, 23, 59, 59),
      isActive: true,
      tenantId: tenant.id,
    },
  });

  const esteticaSvcs = ['seed-srv-microblading', 'seed-srv-depilacion'];
  for (let i = 0; i < esteticaSvcs.length; i++) {
    await prisma.serviceCampaign.upsert({
      where: { id: 'sc-nuevo-' + i },
      update: {},
      create: {
        id: 'sc-nuevo-' + i,
        serviceId: esteticaSvcs[i],
        campaignId: campNuevo.id,
        tenantId: tenant.id,
      },
    });
  }

  const couponYearStart = new Date(now.getFullYear(), 0, 1);
  const couponYearEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59);

  await prisma.coupon.upsert({
    where: { code: 'BIENVENIDA10' },
    update: {},
    create: {
      id: 'seed-coupon-bienvenida10',
      code: 'BIENVENIDA10',
      description: '10% de descuento para nuevos clientes',
      discountType: DiscountType.PERCENTAGE,
      discountValue: 10,
      minSubtotal: 50,
      startDate: couponYearStart,
      endDate: couponYearEnd,
      maxUses: 50,
      usedCount: 3,
      isActive: true,
      tenantId: tenant.id,
    },
  });

  await prisma.coupon.upsert({
    where: { code: 'FISIO20' },
    update: {},
    create: {
      id: 'seed-coupon-fisio20',
      code: 'FISIO20',
      description: '$20 de descuento en servicios de fisioterapia',
      discountType: DiscountType.FIXED,
      discountValue: 20,
      minSubtotal: 80,
      startDate: couponYearStart,
      endDate: couponYearEnd,
      maxUses: 20,
      usedCount: 0,
      isActive: true,
      tenantId: tenant.id,
    },
  });

  await prisma.coupon.upsert({
    where: { code: 'REFIERE' },
    update: {},
    create: {
      id: 'seed-coupon-refiere',
      code: 'REFIERE',
      description: '15% de descuento por referir a un nuevo paciente',
      discountType: DiscountType.PERCENTAGE,
      discountValue: 15,
      minSubtotal: 100,
      startDate: couponYearStart,
      endDate: couponYearEnd,
      maxUses: 30,
      usedCount: 5,
      isActive: true,
      tenantId: tenant.id,
    },
  });
  console.log('  3 campaigns + service links + 3 coupons created.');

  // =======================================================================
  // 15. CONSENT DOCUMENTS (5) + CLINICAL PHOTOS (3)
  // =======================================================================
  console.log('[15/16] Seeding consent documents and photos...');

  await prisma.consentDocument.upsert({
    where: { id: 'seed-consent-sofia-micro' },
    update: {},
    create: {
      id: 'seed-consent-sofia-micro',
      patientId: patSofia.id,
      serviceId: 'seed-srv-microblading',
      signatureData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      signedAt: daysAgo(15),
      tenantId: tenant.id,
    },
  });

  await prisma.consentDocument.upsert({
    where: { id: 'seed-consent-maria-cav' },
    update: {},
    create: {
      id: 'seed-consent-maria-cav',
      patientId: patMaria.id,
      serviceId: 'seed-srv-cavitacion',
      signatureData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      signedAt: daysAgo(21),
      tenantId: tenant.id,
    },
  });

  await prisma.consentDocument.upsert({
    where: { id: 'seed-consent-ana-radio' },
    update: {},
    create: {
      id: 'seed-consent-ana-radio',
      patientId: patAna.id,
      serviceId: 'seed-srv-radiofrecuencia',
      signatureData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      signedAt: daysAgo(14),
      tenantId: tenant.id,
    },
  });

  await prisma.consentDocument.upsert({
    where: { id: 'seed-consent-carmen-peeling' },
    update: {},
    create: {
      id: 'seed-consent-carmen-peeling',
      patientId: patCarmen.id,
      serviceId: 'seed-srv-peeling',
      signatureData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      signedAt: daysAgo(21),
      tenantId: tenant.id,
    },
  });

  await prisma.consentDocument.upsert({
    where: { id: 'seed-consent-fernando-micro' },
    update: {},
    create: {
      id: 'seed-consent-fernando-micro',
      patientId: patFernando.id,
      serviceId: 'seed-srv-microblading',
      signatureData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      signedAt: daysAgo(10),
      tenantId: tenant.id,
    },
  });

  await prisma.patientPhoto.upsert({
    where: { id: 'seed-photo-sofia-before' },
    update: {},
    create: {
      id: 'seed-photo-sofia-before',
      tenantId: tenant.id,
      patientId: patSofia.id,
      url: 'https://storage.example.com/photos/sofia_before_01.jpg',
      type: 'BEFORE',
      notes: 'Foto antes del microblading - cejas naturales sin pigmentar.',
    },
  });

  await prisma.patientPhoto.upsert({
    where: { id: 'seed-photo-ana-before' },
    update: {},
    create: {
      id: 'seed-photo-ana-before',
      tenantId: tenant.id,
      patientId: patAna.id,
      url: 'https://storage.example.com/photos/ana_before_01.jpg',
      type: 'BEFORE',
      notes: 'Foto inicial antes de plan facial rejuvenecedor.',
    },
  });

  await prisma.patientPhoto.upsert({
    where: { id: 'seed-photo-carmen-before' },
    update: {},
    create: {
      id: 'seed-photo-carmen-before',
      tenantId: tenant.id,
      patientId: patCarmen.id,
      url: 'https://storage.example.com/photos/carmen_before_01.jpg',
      type: 'BEFORE',
      notes: 'Foto antes del peeling quimico enzimatico.',
    },
  });
  console.log('  5 consents + 3 photos created.');

  // =======================================================================
  // 16. ATTENDANCE (6)
  // =======================================================================
  console.log('[16/16] Seeding staff attendance records...');

  const day2CheckIn = new Date();
  day2CheckIn.setDate(day2CheckIn.getDate() - 2);
  day2CheckIn.setHours(8, 45, 0, 0);
  const day2CheckOut = new Date(day2CheckIn);
  day2CheckOut.setHours(18, 5, 0, 0);

  await prisma.attendance.upsert({
    where: { id: 'seed-att-carlos-day2' },
    update: {},
    create: {
      id: 'seed-att-carlos-day2',
      tenantId: tenant.id,
      userId: carlosUser.id,
      checkIn: day2CheckIn,
      checkOut: day2CheckOut,
      status: 'PRESENT',
    },
  });

  await prisma.attendance.upsert({
    where: { id: 'seed-att-admin-day2' },
    update: {},
    create: {
      id: 'seed-att-admin-day2',
      tenantId: tenant.id,
      userId: adminUser.id,
      checkIn: day2CheckIn,
      checkOut: day2CheckOut,
      status: 'PRESENT',
    },
  });

  const day1CheckIn = new Date();
  day1CheckIn.setDate(day1CheckIn.getDate() - 1);
  day1CheckIn.setHours(8, 55, 0, 0);
  const day1CheckOut = new Date(day1CheckIn);
  day1CheckOut.setHours(18, 2, 0, 0);

  await prisma.attendance.upsert({
    where: { id: 'seed-att-carlos-day1' },
    update: {},
    create: {
      id: 'seed-att-carlos-day1',
      tenantId: tenant.id,
      userId: carlosUser.id,
      checkIn: day1CheckIn,
      checkOut: day1CheckOut,
      status: 'PRESENT',
    },
  });

  await prisma.attendance.upsert({
    where: { id: 'seed-att-admin-day1' },
    update: {},
    create: {
      id: 'seed-att-admin-day1',
      tenantId: tenant.id,
      userId: adminUser.id,
      checkIn: day1CheckIn,
      checkOut: day1CheckOut,
      status: 'PRESENT',
    },
  });

  const todayCheckIn = new Date();
  todayCheckIn.setHours(9, 2, 0, 0);
  const todayCheckOutAdmin = new Date(todayCheckIn);
  todayCheckOutAdmin.setHours(17, 30, 0, 0);

  await prisma.attendance.upsert({
    where: { id: 'seed-att-carlos-today' },
    update: {},
    create: {
      id: 'seed-att-carlos-today',
      tenantId: tenant.id,
      userId: carlosUser.id,
      checkIn: todayCheckIn,
      checkOut: null,
      status: 'PRESENT',
    },
  });

  await prisma.attendance.upsert({
    where: { id: 'seed-att-admin-today' },
    update: {},
    create: {
      id: 'seed-att-admin-today',
      tenantId: tenant.id,
      userId: adminUser.id,
      checkIn: todayCheckIn,
      checkOut: todayCheckOutAdmin,
      status: 'PRESENT',
    },
  });

  console.log('  6 attendance records created.');

  // Suppress unused variable warnings for variables only used for side effects
  void pkgLineMaria; void pkgLineAna; void patRoberto;
  void apptW3DiegoCav1; void apptW3GabrielaDren1;
  void apptSofiaMicroOrig; void apptCarmenPeelingOrig; void apptDiegoPeelingOrig;
  void apptFernandoMicroOrig; void apptBeatrizPeelingOrig; void apptLuciaMicroOrig;
  void invW3MariaCav1; void invW3JuanFisio1; void invW2AnaLimp;
  void apptYestEduardoDerma; void apptYestDanielaLimp;
  void srvCavitacion; void srvMicroblading; void srvFisio;
  void srvDrenaje; void srvRadiofrecuencia; void srvMasaje; void srvPeeling;

  console.log('Seed completed successfully.');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
