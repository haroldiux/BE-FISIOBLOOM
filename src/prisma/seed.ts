import { Role, ServiceCategory, TreatmentType, AppointmentStatus, RetouchStatus } from '@prisma/client';
import bcrypt from 'bcrypt';
import prisma from '../services/prisma';

async function main() {
  console.log('Seeding Tenant and Branch...');

  // Create default tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'aura' },
    update: {},
    create: {
      id: 'seed-tenant-aura',
      name: 'Aura FisioEstética',
      slug: 'aura',
      plan: 'PREMIUM',
    }
  });

  // Create default branch
  const branch = await prisma.branch.upsert({
    where: { id: 'seed-branch-main' },
    update: {},
    create: {
      id: 'seed-branch-main',
      tenantId: tenant.id,
      name: 'Sucursal Principal Aura',
      address: 'Av. Insurgentes Sur 1234, Col. Del Valle, CDMX',
      phone: '+52 55 1234 5678',
    }
  });

  const email = 'admin@aurafisio.com';
  
  // Check if admin already exists
  const existingAdmin = await prisma.user.findUnique({
    where: { email },
  });

  if (existingAdmin) {
    console.log(`Admin user with email ${email} already exists. Skipping admin creation.`);
  } else {
    // Hash password
    const hashedPassword = await bcrypt.hash('admin123', 10);

    // Default working hours for testing
    const defaultWorkingHours = {
      monday: { start: '09:00', end: '18:00' },
      tuesday: { start: '09:00', end: '18:00' },
      wednesday: { start: '09:00', end: '18:00' },
      thursday: { start: '09:00', end: '18:00' },
      friday: { start: '09:00', end: '18:00' },
      saturday: { start: '09:00', end: '14:00' },
      sunday: null,
    };

    // Create admin user
    await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name: 'Administrador Aura',
        role: Role.ADMIN,
        isActive: true,
        workingHours: defaultWorkingHours,
        tenantId: tenant.id,
        branchId: branch.id,
      },
    });
    console.log('Admin user created.');
  }

  // Create default services
  console.log('Seeding default services...');
  
  await prisma.service.upsert({
    where: { id: 'seed-srv-facial' },
    update: {},
    create: {
      id: 'seed-srv-facial',
      name: 'Limpieza Facial Profunda con Microdermoabrasión',
      category: ServiceCategory.FACIAL,
      treatmentType: TreatmentType.SINGLE_SESSION,
      defaultDuration: 60,
      defaultPrice: 150,
      requiresConsent: false,
      tenantId: tenant.id,
    }
  });

  const srvCavitacion = await prisma.service.upsert({
    where: { id: 'seed-srv-cavitacion' },
    update: {},
    create: {
      id: 'seed-srv-cavitacion',
      name: 'Cavitación Ultrasónica Reductora',
      category: ServiceCategory.CORPORAL,
      treatmentType: TreatmentType.MULTI_SESSION,
      defaultDuration: 45,
      defaultPrice: 120,
      requiresConsent: true,
      contraindications: 'No apto para personas con implantes metálicos, embarazo o marcapasos.',
      tenantId: tenant.id,
    }
  });

  await prisma.service.upsert({
    where: { id: 'seed-srv-microblading' },
    update: {},
    create: {
      id: 'seed-srv-microblading',
      name: 'Microblading de Cejas Aura (Pelo a Pelo)',
      category: ServiceCategory.ESTETICA,
      treatmentType: TreatmentType.RETOUCHABLE,
      defaultDuration: 120,
      defaultPrice: 350,
      retouchConfig: {
        retouchAfterDays: 30,
        maxRetouches: 1
      },
      requiresConsent: true,
      contraindications: 'No recomendado en embarazo o queloides activos.',
      tenantId: tenant.id,
    }
  });

  await prisma.service.upsert({
    where: { id: 'seed-srv-fisio' },
    update: {},
    create: {
      id: 'seed-srv-fisio',
      name: 'Sesión Terapéutica de Fisioterapia Postural',
      category: ServiceCategory.FISIOTERAPIA,
      treatmentType: TreatmentType.SINGLE_SESSION,
      defaultDuration: 50,
      defaultPrice: 90,
      requiresConsent: false,
      tenantId: tenant.id,
    }
  });

  // Create default package template
  console.log('Seeding default package templates...');
  await prisma.packageTemplate.upsert({
    where: { id: 'seed-pkg-reductor' },
    update: {},
    create: {
      id: 'seed-pkg-reductor',
      name: 'Plan Reductor Intensivo Cavitación',
      description: 'Combo diseñado para reducción corporal en abdomen y piernas',
      validityDays: 90,
      totalPrice: 960,
      tenantId: tenant.id,
      lines: {
        create: [
          {
            tenantId: tenant.id,
            serviceId: srvCavitacion.id,
            sessions: 10,
          }
        ]
      }
    }
  });

  // Seeding de paciente de prueba con retoque (Fase 2)
  console.log('Seeding patient with retouch data...');
  const userAdmin = await prisma.user.findFirst({
    where: { role: Role.ADMIN }
  });

  if (userAdmin) {
    const patientSofia = await prisma.patient.upsert({
      where: { id: 'seed-pat-sofia' },
      update: {},
      create: {
        id: 'seed-pat-sofia',
        fullName: 'Sofía Hernández P.',
        phone: '+591 78945612',
        email: 'sofia@mail.com',
        consentSigned: true,
        medicalHistory: 'Sin alergias. Piel mixta.',
        tenantId: tenant.id,
        branchId: branch.id,
      }
    });

    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 15); // Hace 15 días

    const appointmentOriginal = await prisma.appointment.upsert({
      where: { id: 'seed-appt-sofia-original' },
      update: {},
      create: {
        id: 'seed-appt-sofia-original',
        patientId: patientSofia.id,
        professionalId: userAdmin.id,
        serviceId: 'seed-srv-microblading',
        dateTime: pastDate,
        duration: 120,
        status: AppointmentStatus.COMPLETADA,
        tenantId: tenant.id,
        branchId: branch.id,
      }
    });

    await prisma.sessionDetail.upsert({
      where: { appointmentId: appointmentOriginal.id },
      update: {},
      create: {
        appointmentId: appointmentOriginal.id,
        evolutionNotes: 'Diseño de cejas Aura pelo a pelo completado con éxito. Excelente retención inicial del pigmento.',
        tenantId: tenant.id,
      }
    });

    // Retoque programado para dentro de 15 días (+30 días desde la cita original)
    const scheduledDate = new Date(pastDate);
    scheduledDate.setDate(scheduledDate.getDate() + 30);

    await prisma.retouchSchedule.upsert({
      where: { id: 'seed-retouch-sofia' },
      update: {},
      create: {
        id: 'seed-retouch-sofia',
        patientId: patientSofia.id,
        serviceId: 'seed-srv-microblading',
        originalAppointmentId: appointmentOriginal.id,
        scheduledDate,
        status: RetouchStatus.PENDING,
        retouchNumber: 1,
        tenantId: tenant.id,
      }
    });
  }

  // --- Fase 4: Gestión de Personal, Comisiones y Nóminas ---
  console.log('Seeding professional with StaffProfile...');
  const profEmail = 'carlos@aurafisio.com';
  const profHashedPassword = await bcrypt.hash('carlos123', 10);
  const profWorkingHours = {
    monday: { start: '09:00', end: '18:00' },
    tuesday: { start: '09:00', end: '18:00' },
    wednesday: { start: '09:00', end: '18:00' },
    thursday: { start: '09:00', end: '18:00' },
    friday: { start: '09:00', end: '18:00' },
    saturday: { start: '09:00', end: '14:00' },
    sunday: null,
  };

  const profUser = await prisma.user.upsert({
    where: { email: profEmail },
    update: {},
    create: {
      email: profEmail,
      password: profHashedPassword,
      name: 'Carlos Méndez',
      role: Role.PHYSIO,
      isActive: true,
      workingHours: profWorkingHours,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.staffProfile.upsert({
    where: { userId: profUser.id },
    update: {
      baseSalary: 1000.0,
      commissionRate: 0.10,
      salesTarget: 2000.0,
      tenantId: tenant.id,
    },
    create: {
      userId: profUser.id,
      baseSalary: 1000.0,
      commissionRate: 0.10,
      salesTarget: 2000.0,
      tenantId: tenant.id,
    },
  });
  console.log('Professional and StaffProfile seeded.');

  const patientPedro = await prisma.patient.upsert({
    where: { id: 'seed-pat-pedro' },
    update: {},
    create: {
      id: 'seed-pat-pedro',
      fullName: 'Pedro Martínez',
      phone: '+591 76543210',
      email: 'pedro@mail.com',
      consentSigned: true,
      medicalHistory: 'Dolor de espalda crónico.',
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  const pastApptDate = new Date();
  pastApptDate.setDate(pastApptDate.getDate() - 10); // 10 days ago

  const pastAppointment = await prisma.appointment.upsert({
    where: { id: 'seed-appt-pedro-past' },
    update: {
      status: AppointmentStatus.COMPLETADA,
    },
    create: {
      id: 'seed-appt-pedro-past',
      patientId: patientPedro.id,
      professionalId: profUser.id,
      serviceId: 'seed-srv-facial', // price 150
      dateTime: pastApptDate,
      duration: 60,
      status: AppointmentStatus.COMPLETADA,
      tenantId: tenant.id,
      branchId: branch.id,
    },
  });

  await prisma.commission.upsert({
    where: { appointmentId: pastAppointment.id },
    update: {
      amount: 15.0,
      status: 'PENDING',
      staffId: profUser.id,
      tenantId: tenant.id,
    },
    create: {
      appointmentId: pastAppointment.id,
      staffId: profUser.id,
      amount: 15.0,
      status: 'PENDING',
      tenantId: tenant.id,
    },
  });
  console.log('Past completed appointment and pending commission seeded.');

  // Seed some default products (inventario)
  console.log('Seeding default products...');
  const defaultProducts = [
    {
      id: 'prod-1',
      name: 'Gel Conductor Ultrasonido',
      category: 'PRODUCTO',
      price: 25.0,
      stock: 50,
      unit: 'ml',
      isActive: true,
      tenantId: tenant.id,
    },
    {
      id: 'prod-2',
      name: 'Crema Hidratante Aura',
      category: 'PRODUCTO',
      price: 45.0,
      stock: 30,
      unit: 'unidad',
      isActive: true,
      tenantId: tenant.id,
    },
    {
      id: 'prod-3',
      name: 'Agujas de Microblading Estériles',
      category: 'PRODUCTO',
      price: 5.0,
      stock: 120,
      unit: 'unidad',
      isActive: true,
      tenantId: tenant.id,
    },
    {
      id: 'prod-4',
      name: 'Aceite de Masajes Relajantes',
      category: 'PRODUCTO',
      price: 35.0,
      stock: 15,
      unit: 'ml',
      isActive: true,
      tenantId: tenant.id,
    }
  ];

  for (const prod of defaultProducts) {
    await prisma.product.upsert({
      where: { id: prod.id },
      update: {
        name: prod.name,
        price: prod.price,
        stock: prod.stock,
        unit: prod.unit,
        isActive: prod.isActive,
      },
      create: prod,
    });
  }
  console.log('Default products seeded.');

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
