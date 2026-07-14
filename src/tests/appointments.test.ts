import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { cleanDatabase, seedTestDatabase, prisma } from './helpers';

let testData: any;

describe('Módulo de Citas (Agendamiento y Colisiones)', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
  });

  beforeEach(async () => {
    await cleanDatabase();
    testData = await seedTestDatabase();
  });

  describe('POST /api/appointments', () => {
    it('Debe crear una cita exitosamente bajo condiciones normales', async () => {
      // Creamos un paciente primero
      const patient = await prisma.patient.create({
        data: {
          fullName: 'Maria Test',
          phone: '99998888',
          tenantId: testData.tenant.id,
          branchId: testData.branch.id,
        },
      });

      // Lunes a las 10:00 AM (el seed pone workingHours de lunes a sabado 08:00 - 20:00)
      const nextMonday = new Date();
      nextMonday.setDate(nextMonday.getDate() + ((1 + 7 - nextMonday.getDay()) % 7 || 7)); // Siguiente lunes
      nextMonday.setHours(10, 0, 0, 0);

      const response = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${testData.receptionist.token}`)
        .send({
          patientId: patient.id,
          professionalId: testData.physio.user.id,
          serviceId: testData.service.id,
          dateTime: nextMonday.toISOString(),
          duration: 60,
          cabin: 'Cabina A',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('appointment');
      expect(response.body.appointment.cabin).toBe('Cabina A');
    });

    it('Debe fallar si la cita colisiona con otra del mismo profesional', async () => {
      const patient = await prisma.patient.create({
        data: {
          fullName: 'Maria Test',
          phone: '99998888',
          tenantId: testData.tenant.id,
          branchId: testData.branch.id,
        },
      });

      const nextMonday = new Date();
      nextMonday.setDate(nextMonday.getDate() + ((1 + 7 - nextMonday.getDay()) % 7 || 7));
      nextMonday.setHours(10, 0, 0, 0);

      // Crear primera cita directamente
      await prisma.appointment.create({
        data: {
          tenantId: testData.tenant.id,
          branchId: testData.branch.id,
          patientId: patient.id,
          professionalId: testData.physio.user.id,
          serviceId: testData.service.id,
          dateTime: nextMonday,
          duration: 60,
          cabin: 'Cabina A',
        },
      });

      // Intentar crear una segunda cita que se solapa (ej. 10:30 AM del mismo profesional)
      const overlapTime = new Date(nextMonday);
      overlapTime.setMinutes(30);

      const response = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${testData.receptionist.token}`)
        .send({
          patientId: patient.id,
          professionalId: testData.physio.user.id,
          serviceId: testData.service.id,
          dateTime: overlapTime.toISOString(),
          duration: 60,
          cabin: 'Cabina B',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('ya cuenta con una cita');
    });

    it('Debe fallar si la hora está fuera del horario laboral del profesional', async () => {
      const patient = await prisma.patient.create({
        data: {
          fullName: 'Maria Test',
          phone: '99998888',
          tenantId: testData.tenant.id,
          branchId: testData.branch.id,
        },
      });

      // Lunes a las 05:00 AM (fuera de las 08:00 - 20:00)
      const nextMonday = new Date();
      nextMonday.setDate(nextMonday.getDate() + ((1 + 7 - nextMonday.getDay()) % 7 || 7));
      nextMonday.setHours(5, 0, 0, 0);

      const response = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${testData.receptionist.token}`)
        .send({
          patientId: patient.id,
          professionalId: testData.physio.user.id,
          serviceId: testData.service.id,
          dateTime: nextMonday.toISOString(),
          duration: 60,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('outside working hours');
    });
  });

  describe('Bloqueo de cambios de estado y Reversión Atómica', () => {
    it('Debe retornar 400 si se intenta actualizar directamente a COMPLETADA o CANCELADA_CON_CARGO', async () => {
      const patient = await prisma.patient.create({
        data: {
          fullName: 'Maria Test',
          phone: '99998888',
          tenantId: testData.tenant.id,
          branchId: testData.branch.id,
        },
      });

      const nextMonday = new Date();
      nextMonday.setDate(nextMonday.getDate() + ((1 + 7 - nextMonday.getDay()) % 7 || 7));
      nextMonday.setHours(10, 0, 0, 0);

      const appt = await prisma.appointment.create({
        data: {
          tenantId: testData.tenant.id,
          branchId: testData.branch.id,
          patientId: patient.id,
          professionalId: testData.physio.user.id,
          serviceId: testData.service.id,
          dateTime: nextMonday,
          duration: 60,
        },
      });

      const resCompleted = await request(app)
        .put(`/api/appointments/${appt.id}/status`)
        .set('Authorization', `Bearer ${testData.receptionist.token}`)
        .send({ status: 'COMPLETADA' });

      expect(resCompleted.status).toBe(400);
      expect(resCompleted.body.error).toContain('No se permiten actualizaciones de estado directas');

      const resCancelled = await request(app)
        .put(`/api/appointments/${appt.id}/status`)
        .set('Authorization', `Bearer ${testData.receptionist.token}`)
        .send({ status: 'CANCELADA_CON_CARGO' });

      expect(resCancelled.status).toBe(400);
      expect(resCancelled.body.error).toContain('No se permiten actualizaciones de estado directas');
    });

    it('Debe revertir atómicamente todos los efectos secundarios al pasar de COMPLETADA a PENDIENTE', async () => {
      // 1. Setup Patient
      const patient = await prisma.patient.create({
        data: {
          fullName: 'Maria Reversion',
          phone: '99991111',
          tenantId: testData.tenant.id,
          branchId: testData.branch.id,
        },
      });

      // 2. Setup Retouchable Service
      const retouchableService = await prisma.service.create({
        data: {
          id: 'test-retouch-service-id',
          tenantId: testData.tenant.id,
          name: 'Servicio Retocable',
          category: 'ESTETICA',
          treatmentType: 'RETOUCHABLE',
          defaultDuration: 60,
          defaultPrice: 150,
          retouchConfig: { retouchAfterDays: 15, maxRetouches: 1 },
        },
      });

      // 3. Setup Consumables
      const product = await prisma.product.create({
        data: {
          id: 'test-consumable-product-id',
          tenantId: testData.tenant.id,
          name: 'Serum Reversion',
          category: 'TRATAMIENTO',
          price: 50,
          stock: 10,
          unit: 'ampolla',
        },
      });

      await prisma.serviceConsumable.create({
        data: {
          tenantId: testData.tenant.id,
          serviceId: retouchableService.id,
          productId: product.id,
          quantity: 3,
        },
      });

      // 4. Setup Staff Profile for Physio
      await prisma.staffProfile.create({
        data: {
          tenantId: testData.tenant.id,
          userId: testData.physio.user.id,
          baseSalary: 1000,
          commissionRate: 0.2, // 20%
        },
      });

      // 5. Setup Treatment Package
      const treatmentPkg = await prisma.treatmentPackage.create({
        data: {
          tenantId: testData.tenant.id,
          patientId: patient.id,
          packageName: 'Bono Facial Especial',
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          status: 'ACTIVE',
        },
      });

      const packageLine = await prisma.treatmentPackageLine.create({
        data: {
          tenantId: testData.tenant.id,
          packageId: treatmentPkg.id,
          serviceId: retouchableService.id,
          serviceName: retouchableService.name,
          totalSessions: 1,
          usedSessions: 0,
        },
      });

      // 6. Setup Appointment
      const nextMonday = new Date();
      nextMonday.setDate(nextMonday.getDate() + ((1 + 7 - nextMonday.getDay()) % 7 || 7));
      nextMonday.setHours(12, 0, 0, 0);

      const appt = await prisma.appointment.create({
        data: {
          tenantId: testData.tenant.id,
          branchId: testData.branch.id,
          patientId: patient.id,
          professionalId: testData.physio.user.id,
          serviceId: retouchableService.id,
          dateTime: nextMonday,
          duration: 60,
          status: 'CONFIRMADA',
        },
      });

      // 7. Complete the appointment via API (triggers side effects)
      const compRes = await request(app)
        .post(`/api/appointments/${appt.id}/complete`)
        .set('Authorization', `Bearer ${testData.physio.token}`)
        .send({
          packageLineId: packageLine.id,
          evolutionNotes: 'Se aplicó serum con microagujas',
          measurements: { hydration: 85 },
        });

      expect(compRes.status).toBe(200);

      // Verify side effects are active:
      // a. Package line sessions used = 1, Package status = COMPLETED (since totalSessions is 1)
      const updatedLine = await prisma.treatmentPackageLine.findUnique({
        where: { id: packageLine.id },
        include: { package: true },
      });
      expect(updatedLine?.usedSessions).toBe(1);
      expect(updatedLine?.package.status).toBe('COMPLETED');

      // b. Session detail is created
      const detail = await prisma.sessionDetail.findUnique({
        where: { appointmentId: appt.id },
      });
      expect(detail).toBeDefined();
      expect(detail?.evolutionNotes).toContain('microagujas');

      // c. Stock is decremented (10 - 3 = 7)
      const updatedProduct = await prisma.product.findUnique({
        where: { id: product.id },
      });
      expect(updatedProduct?.stock).toBe(7);

      // d. InventoryMovement is created
      const movement = await prisma.inventoryMovement.findFirst({
        where: { appointmentId: appt.id, type: 'SESSION_CONSUMPTION' },
      });
      expect(movement).toBeDefined();
      expect(movement?.quantity).toBe(3);

      // e. Commission is created (20% of 150 price = 30)
      const commission = await prisma.commission.findUnique({
        where: { appointmentId: appt.id },
      });
      expect(commission).toBeDefined();
      expect(commission?.amount).toBe(30);
      expect(commission?.status).toBe('PENDING');

      // f. RetouchSchedule is created
      const retouch = await prisma.retouchSchedule.findFirst({
        where: { originalAppointmentId: appt.id },
      });
      expect(retouch).toBeDefined();
      expect(retouch?.status).toBe('PENDING');

      // 8. Revert the appointment state to PENDIENTE
      const revertRes = await request(app)
        .put(`/api/appointments/${appt.id}/status`)
        .set('Authorization', `Bearer ${testData.receptionist.token}`)
        .send({ status: 'PENDIENTE' });

      expect(revertRes.status).toBe(200);
      expect(revertRes.body.appointment.status).toBe('PENDIENTE');

      // Verify side effects are reverted:
      // a. Used sessions is 0, Package is ACTIVE
      const revertedLine = await prisma.treatmentPackageLine.findUnique({
        where: { id: packageLine.id },
        include: { package: true },
      });
      expect(revertedLine?.usedSessions).toBe(0);
      expect(revertedLine?.package.status).toBe('ACTIVE');

      // b. SessionDetail is deleted
      const deletedDetail = await prisma.sessionDetail.findUnique({
        where: { appointmentId: appt.id },
      });
      expect(deletedDetail).toBeNull();

      // c. Stock is restored to 10
      const revertedProduct = await prisma.product.findUnique({
        where: { id: product.id },
      });
      expect(revertedProduct?.stock).toBe(10);

      // d. InventoryMovement is deleted
      const deletedMovement = await prisma.inventoryMovement.findFirst({
        where: { appointmentId: appt.id, type: 'SESSION_CONSUMPTION' },
      });
      expect(deletedMovement).toBeNull();

      // e. Commission status is CANCELLED
      const revertedCommission = await prisma.commission.findUnique({
        where: { appointmentId: appt.id },
      });
      expect(revertedCommission?.status).toBe('CANCELLED');

      // f. RetouchSchedule is deleted
      const deletedRetouch = await prisma.retouchSchedule.findFirst({
        where: { originalAppointmentId: appt.id },
      });
      expect(deletedRetouch).toBeNull();
    });

    it('Debe retornar 400 si se intenta actualizar directamente a COMPLETADA o CANCELADA_CON_CARGO usando PUT genérico', async () => {
      const patient = await prisma.patient.create({
        data: {
          fullName: 'Maria Test Generic',
          phone: '99998888',
          tenantId: testData.tenant.id,
          branchId: testData.branch.id,
        },
      });

      const nextMonday = new Date();
      nextMonday.setDate(nextMonday.getDate() + ((1 + 7 - nextMonday.getDay()) % 7 || 7));
      nextMonday.setHours(10, 0, 0, 0);

      const appt = await prisma.appointment.create({
        data: {
          tenantId: testData.tenant.id,
          branchId: testData.branch.id,
          patientId: patient.id,
          professionalId: testData.physio.user.id,
          serviceId: testData.service.id,
          dateTime: nextMonday,
          duration: 60,
        },
      });

      const resCompleted = await request(app)
        .put(`/api/appointments/${appt.id}`)
        .set('Authorization', `Bearer ${testData.receptionist.token}`)
        .send({ status: 'COMPLETADA' });

      expect(resCompleted.status).toBe(400);
      expect(resCompleted.body.error).toContain('No se permiten actualizaciones de estado directas');

      const resCancelled = await request(app)
        .put(`/api/appointments/${appt.id}`)
        .set('Authorization', `Bearer ${testData.receptionist.token}`)
        .send({ status: 'CANCELADA_CON_CARGO' });

      expect(resCancelled.status).toBe(400);
      expect(resCancelled.body.error).toContain('No se permiten actualizaciones de estado directas');
    });

    it('Debe revertir atómicamente todos los efectos secundarios al pasar de COMPLETADA a NO_ASISTIO usando PUT genérico', async () => {
      // 1. Setup Patient
      const patient = await prisma.patient.create({
        data: {
          fullName: 'Maria Reversion Generic',
          phone: '99991112',
          tenantId: testData.tenant.id,
          branchId: testData.branch.id,
        },
      });

      // 2. Setup Retouchable Service
      const retouchableService = await prisma.service.create({
        data: {
          id: 'test-retouch-service-generic-id',
          tenantId: testData.tenant.id,
          name: 'Servicio Retocable',
          category: 'ESTETICA',
          treatmentType: 'RETOUCHABLE',
          defaultDuration: 60,
          defaultPrice: 150,
          retouchConfig: { retouchAfterDays: 15, maxRetouches: 1 },
        },
      });

      // 3. Setup Consumables
      const product = await prisma.product.create({
        data: {
          id: 'test-consumable-product-generic-id',
          tenantId: testData.tenant.id,
          name: 'Serum Reversion',
          category: 'TRATAMIENTO',
          price: 50,
          stock: 10,
          unit: 'ampolla',
        },
      });

      await prisma.serviceConsumable.create({
        data: {
          tenantId: testData.tenant.id,
          serviceId: retouchableService.id,
          productId: product.id,
          quantity: 3,
        },
      });

      // 4. Setup Staff Profile for Physio
      await prisma.staffProfile.create({
        data: {
          tenantId: testData.tenant.id,
          userId: testData.physio.user.id,
          baseSalary: 1000,
          commissionRate: 0.2, // 20%
        },
      });

      // 5. Setup Treatment Package
      const treatmentPkg = await prisma.treatmentPackage.create({
        data: {
          tenantId: testData.tenant.id,
          patientId: patient.id,
          packageName: 'Bono Facial Especial',
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          status: 'ACTIVE',
        },
      });

      const packageLine = await prisma.treatmentPackageLine.create({
        data: {
          tenantId: testData.tenant.id,
          packageId: treatmentPkg.id,
          serviceId: retouchableService.id,
          serviceName: retouchableService.name,
          totalSessions: 1,
          usedSessions: 0,
        },
      });

      // 6. Setup Appointment
      const nextMonday = new Date();
      nextMonday.setDate(nextMonday.getDate() + ((1 + 7 - nextMonday.getDay()) % 7 || 7));
      nextMonday.setHours(12, 0, 0, 0);

      const appt = await prisma.appointment.create({
        data: {
          tenantId: testData.tenant.id,
          branchId: testData.branch.id,
          patientId: patient.id,
          professionalId: testData.physio.user.id,
          serviceId: retouchableService.id,
          dateTime: nextMonday,
          duration: 60,
          status: 'CONFIRMADA',
        },
      });

      // 7. Complete the appointment via API (triggers side effects)
      const compRes = await request(app)
        .post(`/api/appointments/${appt.id}/complete`)
        .set('Authorization', `Bearer ${testData.physio.token}`)
        .send({
          packageLineId: packageLine.id,
          evolutionNotes: 'Se aplicó serum con microagujas',
          measurements: { hydration: 85 },
        });

      expect(compRes.status).toBe(200);

      // Verify side effects are active:
      const updatedLine = await prisma.treatmentPackageLine.findUnique({
        where: { id: packageLine.id },
        include: { package: true },
      });
      expect(updatedLine?.usedSessions).toBe(1);
      expect(updatedLine?.package.status).toBe('COMPLETED');

      // 8. Revert the appointment state to NO_ASISTIO using generic PUT
      const revertRes = await request(app)
        .put(`/api/appointments/${appt.id}`)
        .set('Authorization', `Bearer ${testData.receptionist.token}`)
        .send({ status: 'NO_ASISTIO' });

      expect(revertRes.status).toBe(200);
      expect(revertRes.body.appointment.status).toBe('NO_ASISTIO');

      // Verify side effects are reverted:
      // a. Used sessions is 0, Package is ACTIVE
      const revertedLine = await prisma.treatmentPackageLine.findUnique({
        where: { id: packageLine.id },
        include: { package: true },
      });
      expect(revertedLine?.usedSessions).toBe(0);
      expect(revertedLine?.package.status).toBe('ACTIVE');

      // b. SessionDetail is deleted
      const deletedDetail = await prisma.sessionDetail.findUnique({
        where: { appointmentId: appt.id },
      });
      expect(deletedDetail).toBeNull();

      // c. Stock is restored to 10
      const revertedProduct = await prisma.product.findUnique({
        where: { id: product.id },
      });
      expect(revertedProduct?.stock).toBe(10);

      // d. InventoryMovement is deleted
      const deletedMovement = await prisma.inventoryMovement.findFirst({
        where: { appointmentId: appt.id, type: 'SESSION_CONSUMPTION' },
      });
      expect(deletedMovement).toBeNull();

      // e. Commission status is CANCELLED
      const revertedCommission = await prisma.commission.findUnique({
        where: { appointmentId: appt.id },
      });
      expect(revertedCommission?.status).toBe('CANCELLED');

      // f. RetouchSchedule is deleted
      const deletedRetouch = await prisma.retouchSchedule.findFirst({
        where: { originalAppointmentId: appt.id },
      });
      expect(deletedRetouch).toBeNull();
    });
  });

  describe('Pruebas de Validación de ScheduleException en Agendamiento', () => {
    it('Debe bloquear la cita si hay una excepción del profesional para todo el día (isAvailable=false, sin horas)', async () => {
      const patient = await prisma.patient.create({
        data: {
          fullName: 'Juan Exception Test',
          phone: '12341234',
          tenantId: testData.tenant.id,
          branchId: testData.branch.id,
        },
      });

      const nextMonday = new Date();
      nextMonday.setDate(nextMonday.getDate() + ((1 + 7 - nextMonday.getDay()) % 7 || 7));
      nextMonday.setHours(10, 0, 0, 0);

      // Crear excepción de día completo para el profesional
      await prisma.scheduleException.create({
        data: {
          tenantId: testData.tenant.id,
          professionalId: testData.physio.user.id,
          date: nextMonday,
          isAvailable: false,
          reason: 'Feriado o Día Libre',
        },
      });

      const response = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${testData.receptionist.token}`)
        .send({
          patientId: patient.id,
          professionalId: testData.physio.user.id,
          serviceId: testData.service.id,
          dateTime: nextMonday.toISOString(),
          duration: 60,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('no está disponible en este horario debido a una excepción/licencia');
    });

    it('Debe bloquear la cita si hay una excepción para un bloque de horas y la cita se solapa', async () => {
      const patient = await prisma.patient.create({
        data: {
          fullName: 'Juan Exception Test 2',
          phone: '12341234',
          tenantId: testData.tenant.id,
          branchId: testData.branch.id,
        },
      });

      const nextMonday = new Date();
      nextMonday.setDate(nextMonday.getDate() + ((1 + 7 - nextMonday.getDay()) % 7 || 7));
      nextMonday.setHours(10, 0, 0, 0); // 10:00 AM

      // Crear excepción para el bloque 09:30 - 11:30
      await prisma.scheduleException.create({
        data: {
          tenantId: testData.tenant.id,
          professionalId: testData.physio.user.id,
          date: nextMonday,
          isAvailable: false,
          startTime: '09:30',
          endTime: '11:30',
          reason: 'Reunión Médica',
        },
      });

      const response = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${testData.receptionist.token}`)
        .send({
          patientId: patient.id,
          professionalId: testData.physio.user.id,
          serviceId: testData.service.id,
          dateTime: nextMonday.toISOString(), // 10:00 (solapa con 09:30-11:30)
          duration: 60,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('no está disponible en este horario debido a una excepción/licencia');
    });

    it('Debe permitir la cita si hay una excepción para un bloque de horas pero la cita no se solapa', async () => {
      const patient = await prisma.patient.create({
        data: {
          fullName: 'Juan Exception Test 3',
          phone: '12341234',
          tenantId: testData.tenant.id,
          branchId: testData.branch.id,
        },
      });

      const nextMonday = new Date();
      nextMonday.setDate(nextMonday.getDate() + ((1 + 7 - nextMonday.getDay()) % 7 || 7));
      nextMonday.setHours(14, 0, 0, 0); // 14:00 PM

      // Crear excepción para el bloque 09:30 - 11:30
      await prisma.scheduleException.create({
        data: {
          tenantId: testData.tenant.id,
          professionalId: testData.physio.user.id,
          date: nextMonday,
          isAvailable: false,
          startTime: '09:30',
          endTime: '11:30',
          reason: 'Reunión Médica',
        },
      });

      const response = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${testData.receptionist.token}`)
        .send({
          patientId: patient.id,
          professionalId: testData.physio.user.id,
          serviceId: testData.service.id,
          dateTime: nextMonday.toISOString(), // 14:00 (no solapa con 09:30-11:30)
          duration: 60,
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('appointment');
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
