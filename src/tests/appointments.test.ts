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

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
