import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../index';
import { cleanDatabase, seedTestDatabase, prisma } from '../helpers';

let testData: any;

describe('Integration Tests: Plan 41 Fallos Audit Scenarios (Task 5.2)', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
  });

  beforeEach(async () => {
    await cleanDatabase();
    testData = await seedTestDatabase();
  });

  describe('RBAC & Multi-Tenant Security Controls', () => {
    it('Bug 5 & 6: Debe permitir acceso a onboarding y saas únicamente con rol adecuado o autenticado', async () => {
      const response = await request(app)
        .get('/api/saas/tenants')
        .set('Authorization', `Bearer ${testData.receptionist.token}`);
      
      // Recepcionistas no deben acceder a saas (403 Forbidden)
      expect(response.status).toBe(403);
    });

    it('Bug 8 & 14: Un profesional no puede ver ni borrar citas de otros profesionales', async () => {
      const patient = await prisma.patient.create({
        data: {
          fullName: 'Paciente Privado',
          phone: '77776666',
          tenantId: testData.tenant.id,
          branchId: testData.branch.id,
        },
      });

      const nextMonday = new Date();
      nextMonday.setDate(nextMonday.getDate() + ((1 + 7 - nextMonday.getDay()) % 7 || 7));
      nextMonday.setHours(14, 0, 0, 0);

      // Cita del Admin / Otro profesional
      const appt = await prisma.appointment.create({
        data: {
          patientId: patient.id,
          professionalId: testData.admin.user.id,
          serviceId: testData.service.id,
          dateTime: nextMonday,
          duration: 30,
          tenantId: testData.tenant.id,
          branchId: testData.branch.id,
        },
      });

      // El physio intenta borrar la cita del admin
      const deleteRes = await request(app)
        .delete(`/api/appointments/${appt.id}`)
        .set('Authorization', `Bearer ${testData.physio.token}`);

      expect(deleteRes.status).toBe(403);
    });

    it('Bug 11 & 30: Omitir medicalHistory payload para rol RECEPTIONIST', async () => {
      const createRes = await request(app)
        .post('/api/patients')
        .set('Authorization', `Bearer ${testData.receptionist.token}`)
        .send({
          fullName: 'Paciente Sin Histo',
          phone: '70001122',
          medicalHistory: 'Datos medicos confidenciales',
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.patient).toBeDefined();
      // El historial medico no debe estar presente o debe ser nulo/indefinido para recepcionista
      expect(createRes.body.patient.medicalHistory).toBeFalsy();
    });

    it('Bug 18 & 20: Validar manejo de JSON inválido con 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"email": "admin@test.com", invalid_json}');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid JSON payload');
    });
  });
});
