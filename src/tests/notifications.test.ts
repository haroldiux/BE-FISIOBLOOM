import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { cleanDatabase, seedTestDatabase, prisma } from './helpers';

let testData: any;

describe('Módulo de Notificaciones del Sistema', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
  });

  beforeEach(async () => {
    await cleanDatabase();
    testData = await seedTestDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('Debe generar notificaciones de Stock Bajo y Sin Stock', async () => {
    // Modificar el stock del producto semilla a 0 (debería ser crítico)
    await prisma.product.update({
      where: { id: testData.product.id },
      data: { stock: 0 },
    });

    // Crear un producto con stock bajo (3 unidades, debería ser warning)
    await prisma.product.create({
      data: {
        id: 'low-stock-prod-id',
        tenantId: testData.tenant.id,
        name: 'Crema Hidratante',
        category: 'PRODUCTO',
        price: 15,
        stock: 3,
        unit: 'bote',
      },
    });

    const response = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${testData.admin.token}`)
      .set('x-tenant-id', testData.tenant.id);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('notifications');
    
    const notifs = response.body.notifications;
    
    // Buscar la notificación de sin stock
    const criticalNotif = notifs.find((n: any) => n.id === `low_stock_${testData.product.id}`);
    expect(criticalNotif).toBeDefined();
    expect(criticalNotif.severity).toBe('critical');
    expect(criticalNotif.title).toBe('Sin Stock');

    // Buscar la notificación de stock bajo
    const warningNotif = notifs.find((n: any) => n.id === `low_stock_low-stock-prod-id`);
    expect(warningNotif).toBeDefined();
    expect(warningNotif.severity).toBe('warning');
    expect(warningNotif.title).toBe('Stock Bajo');
  });

  it('Debe generar notificaciones de Retoques Próximos y Retoques Vencidos', async () => {
    // Crear un paciente
    const patient = await prisma.patient.create({
      data: {
        id: 'test-patient-id',
        tenantId: testData.tenant.id,
        fullName: 'María López',
        phone: '999888777',
      },
    });

    const now = new Date();
    const pastDate = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000); // 2 días atrás
    const futureDate = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000); // 2 días adelante

    // Crear citas para satisfacer relaciones FK
    const appt1 = await prisma.appointment.create({
      data: {
        tenantId: testData.tenant.id,
        branchId: testData.branch.id,
        patientId: patient.id,
        professionalId: testData.physio.user.id,
        serviceId: testData.service.id,
        dateTime: pastDate,
        duration: 60,
        cabin: 'Cabina A',
      },
    });

    const appt2 = await prisma.appointment.create({
      data: {
        tenantId: testData.tenant.id,
        branchId: testData.branch.id,
        patientId: patient.id,
        professionalId: testData.physio.user.id,
        serviceId: testData.service.id,
        dateTime: futureDate,
        duration: 60,
        cabin: 'Cabina A',
      },
    });

    // Crear retoque vencido
    const overdueRetouch = await prisma.retouchSchedule.create({
      data: {
        id: 'retouch-overdue-id',
        tenantId: testData.tenant.id,
        patientId: patient.id,
        serviceId: testData.service.id,
        originalAppointmentId: appt1.id,
        scheduledDate: pastDate,
        status: 'PENDING',
        notes: 'Retoque de prueba vencido',
      },
    });

    // Crear retoque próximo
    const upcomingRetouch = await prisma.retouchSchedule.create({
      data: {
        id: 'retouch-upcoming-id',
        tenantId: testData.tenant.id,
        patientId: patient.id,
        serviceId: testData.service.id,
        originalAppointmentId: appt2.id,
        scheduledDate: futureDate,
        status: 'PENDING',
        notes: 'Retoque de prueba próximo',
      },
    });

    const response = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${testData.admin.token}`)
      .set('x-tenant-id', testData.tenant.id);

    expect(response.status).toBe(200);
    const notifs = response.body.notifications;

    // Verificar retoque vencido
    const overdueNotif = notifs.find((n: any) => n.id === `overdue_retouch_${overdueRetouch.id}`);
    expect(overdueNotif).toBeDefined();
    expect(overdueNotif.severity).toBe('critical');
    expect(overdueNotif.title).toBe('Retoque Vencido');

    // Verificar retoque próximo
    const upcomingNotif = notifs.find((n: any) => n.id === `upcoming_retouch_${upcomingRetouch.id}`);
    expect(upcomingNotif).toBeDefined();
    expect(upcomingNotif.severity).toBe('info');
    expect(upcomingNotif.title).toBe('Retoque Próximo');
  });

  it('Debe generar notificaciones de Pacientes Inactivos', async () => {
    // Crear un paciente
    const patient = await prisma.patient.create({
      data: {
        id: 'inactive-patient-id',
        tenantId: testData.tenant.id,
        fullName: 'José Gómez',
        phone: '111222333',
        isActive: true,
      },
    });

    const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);

    // Crear paquete activo comprado hace 40 días con sesiones pendientes
    const activePackage = await prisma.treatmentPackage.create({
      data: {
        id: 'active-package-id',
        tenantId: testData.tenant.id,
        patientId: patient.id,
        packageName: 'Bono Corporal 5 Sesiones',
        purchasedAt: fortyDaysAgo,
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
        lines: {
          create: {
            id: 'line-id',
            serviceName: 'Masaje Reductor',
            totalSessions: 5,
            usedSessions: 1,
            tenantId: testData.tenant.id,
          },
        },
      },
    });

    // Sin citas registradas (cero citas = lastActivityTime es purchasedAt que es hace 40 días, > 30 días límite)
    const response = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${testData.admin.token}`)
      .set('x-tenant-id', testData.tenant.id);

    expect(response.status).toBe(200);
    const notifs = response.body.notifications;

    const inactiveNotif = notifs.find((n: any) => n.id === `inactive_package_${activePackage.id}`);
    expect(inactiveNotif).toBeDefined();
    expect(inactiveNotif.severity).toBe('warning');
    expect(inactiveNotif.title).toBe('Paciente Inactivo');
  });
});
