import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { cleanDatabase, seedTestDatabase, prisma } from './helpers';

let testData: any;

describe('Módulo de Pacientes (CRUD e Integridad)', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
  });

  beforeEach(async () => {
    await cleanDatabase();
    testData = await seedTestDatabase();
  });

  describe('POST /api/patients', () => {
    it('Debe crear un paciente correctamente si es recepcionista (ignora medicalHistory)', async () => {
      const response = await request(app)
        .post('/api/patients')
        .set('Authorization', `Bearer ${testData.receptionist.token}`)
        .send({
          fullName: 'Juan Perez',
          phone: '+52 55 9999 8888',
          email: 'juan@perez.com',
          medicalHistory: 'Notas de historial clinico que deberian ser ignoradas',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('patient');
      expect(response.body.patient.fullName).toBe('Juan Perez');
      
      // Consultamos directamente en la BD para validar que el historial clinico no se guardo
      const dbPatient = await prisma.patient.findUnique({
        where: { id: response.body.patient.id },
      });
      expect(dbPatient?.medicalHistory).toBeNull();
    });

    it('Debe crear un paciente correctamente si es Fisioterapeuta (guarda medicalHistory)', async () => {
      const response = await request(app)
        .post('/api/patients')
        .set('Authorization', `Bearer ${testData.physio.token}`)
        .send({
          fullName: 'Maria Gomez',
          phone: '+52 55 7777 6666',
          medicalHistory: 'Paciente con dolor lumbar cronico.',
        });

      expect(response.status).toBe(201);
      
      const dbPatient = await prisma.patient.findUnique({
        where: { id: response.body.patient.id },
      });
      expect(dbPatient?.medicalHistory).toBe('Paciente con dolor lumbar cronico.');
    });

    it('Debe fallar al crear un paciente sin fullName o phone', async () => {
      const response = await request(app)
        .post('/api/patients')
        .set('Authorization', `Bearer ${testData.receptionist.token}`)
        .send({
          email: 'invalido@test.com',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/patients', () => {
    it('Debe listar todos los pacientes del Tenant', async () => {
      // Creamos dos pacientes primero
      await prisma.patient.createMany({
        data: [
          {
            fullName: 'Paciente Uno',
            phone: '123',
            tenantId: testData.tenant.id,
            branchId: testData.branch.id,
          },
          {
            fullName: 'Paciente Dos',
            phone: '456',
            tenantId: testData.tenant.id,
            branchId: testData.branch.id,
          },
        ],
      });

      const response = await request(app)
        .get('/api/patients')
        .set('Authorization', `Bearer ${testData.physio.token}`);

      expect(response.status).toBe(200);
      expect(response.body.length).toBe(2);
      expect(response.body[0].fullName).toBe('Paciente Dos'); // Orden alfabetico asc
      expect(response.body[1].fullName).toBe('Paciente Uno');
    });

    it('Un recepcionista no debe ver el medicalHistory en el listado de pacientes', async () => {
      await prisma.patient.create({
        data: {
          fullName: 'Paciente Oculto',
          phone: '999',
          medicalHistory: 'Confidencial',
          tenantId: testData.tenant.id,
          branchId: testData.branch.id,
        },
      });

      const response = await request(app)
        .get('/api/patients')
        .set('Authorization', `Bearer ${testData.receptionist.token}`);

      expect(response.status).toBe(200);
      expect(response.body[0]).not.toHaveProperty('medicalHistory');
    });

    it('Debe aislar pacientes entre tenants', async () => {
      // Creamos otro tenant
      const otherTenant = await prisma.tenant.create({
        data: {
          id: 'other-tenant-id',
          name: 'Clinica Infiltrada',
          slug: 'infiltrada',
        },
      });

      // Paciente en el tenant infilatrado
      await prisma.patient.create({
        data: {
          fullName: 'Paciente Secreto B',
          phone: '0000',
          tenantId: otherTenant.id,
        },
      });

      // El usuario del Tenant A no debe ver el paciente del Tenant B
      const response = await request(app)
        .get('/api/patients')
        .set('Authorization', `Bearer ${testData.physio.token}`);

      expect(response.status).toBe(200);
      const secretFound = response.body.some((p: any) => p.fullName === 'Paciente Secreto B');
      expect(secretFound).toBe(false);
    });
  });

  describe('Notificaciones y Alertas de Inactividad / Expiración', () => {
    it('Debe reportar paciente inactivo y bono por vencer con las reglas de 30 días y 15 días', async () => {
      // 1. Setup Patient 1 (Inactive: last appt 31 days ago, has sessions left, no future appt)
      const patientInactive = await prisma.patient.create({
        data: {
          fullName: 'Juan Inactivo',
          phone: '11111111',
          tenantId: testData.tenant.id,
          branchId: testData.branch.id,
        },
      });

      const pkgInactive = await prisma.treatmentPackage.create({
        data: {
          tenantId: testData.tenant.id,
          patientId: patientInactive.id,
          packageName: 'Bono Inactivo',
          purchasedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000), // Comprado hace 40 días
          expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),   // Vence en 60 días
          status: 'ACTIVE',
        },
      });

      await prisma.treatmentPackageLine.create({
        data: {
          tenantId: testData.tenant.id,
          packageId: pkgInactive.id,
          serviceId: testData.service.id,
          serviceName: testData.service.name,
          totalSessions: 10,
          usedSessions: 2,
        },
      });

      // Cita pasada hace 31 días
      const date31DaysAgo = new Date();
      date31DaysAgo.setDate(date31DaysAgo.getDate() - 31);
      await prisma.appointment.create({
        data: {
          tenantId: testData.tenant.id,
          branchId: testData.branch.id,
          patientId: patientInactive.id,
          professionalId: testData.physio.user.id,
          serviceId: testData.service.id,
          dateTime: date31DaysAgo,
          duration: 60,
          status: 'COMPLETADA',
        },
      });

      // 2. Setup Patient 2 (Active: last appt 31 days ago, has sessions left, but WITH future appt)
      const patientActiveWithFuture = await prisma.patient.create({
        data: {
          fullName: 'Maria Con Futura Cita',
          phone: '22222222',
          tenantId: testData.tenant.id,
          branchId: testData.branch.id,
        },
      });

      const pkgActiveWithFuture = await prisma.treatmentPackage.create({
        data: {
          tenantId: testData.tenant.id,
          patientId: patientActiveWithFuture.id,
          packageName: 'Bono Activo Futuro',
          purchasedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
          expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
          status: 'ACTIVE',
        },
      });

      await prisma.treatmentPackageLine.create({
        data: {
          tenantId: testData.tenant.id,
          packageId: pkgActiveWithFuture.id,
          serviceId: testData.service.id,
          serviceName: testData.service.name,
          totalSessions: 10,
          usedSessions: 2,
        },
      });

      // Cita pasada hace 31 días
      await prisma.appointment.create({
        data: {
          tenantId: testData.tenant.id,
          branchId: testData.branch.id,
          patientId: patientActiveWithFuture.id,
          professionalId: testData.physio.user.id,
          serviceId: testData.service.id,
          dateTime: date31DaysAgo,
          duration: 60,
          status: 'COMPLETADA',
        },
      });

      // Cita futura en 5 días (PENDIENTE)
      const dateIn5Days = new Date();
      dateIn5Days.setDate(dateIn5Days.getDate() + 5);
      await prisma.appointment.create({
        data: {
          tenantId: testData.tenant.id,
          branchId: testData.branch.id,
          patientId: patientActiveWithFuture.id,
          professionalId: testData.physio.user.id,
          serviceId: testData.service.id,
          dateTime: dateIn5Days,
          duration: 60,
          status: 'PENDIENTE',
        },
      });

      // 3. Setup Patient 3 (Expiring: expires in 12 days => warning, and another expires in 1 day => critical)
      const patientExpiring = await prisma.patient.create({
        data: {
          fullName: 'Jose Vencimiento',
          phone: '33333333',
          tenantId: testData.tenant.id,
          branchId: testData.branch.id,
        },
      });

      const pkgWarning = await prisma.treatmentPackage.create({
        data: {
          tenantId: testData.tenant.id,
          patientId: patientExpiring.id,
          packageName: 'Bono Vence en 12 Dias',
          purchasedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
          expiresAt: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000), // 12 dias
          status: 'ACTIVE',
        },
      });

      const pkgCritical = await prisma.treatmentPackage.create({
        data: {
          tenantId: testData.tenant.id,
          patientId: patientExpiring.id,
          packageName: 'Bono Vence en 1 Dia',
          purchasedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
          expiresAt: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000), // 1 dia
          status: 'ACTIVE',
        },
      });

      // Call Notifications API
      const response = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${testData.receptionist.token}`);

      expect(response.status).toBe(200);
      const notifs = response.body.notifications;

      // Validate Patient 1 (Inactive Package alert triggered)
      const inactiveAlert = notifs.find((n: any) => n.id === `inactive_package_${pkgInactive.id}`);
      expect(inactiveAlert).toBeDefined();
      expect(inactiveAlert.type).toBe('inactive_package');
      expect(inactiveAlert.severity).toBe('warning');
      expect(inactiveAlert.patientId).toBe(patientInactive.id);
      expect(inactiveAlert.message).toContain('Juan Inactivo');

      // Validate Patient 2 (With future appt => no inactive package alert)
      const activeFutureAlert = notifs.find((n: any) => n.id === `inactive_package_${pkgActiveWithFuture.id}`);
      expect(activeFutureAlert).toBeUndefined();

      // Validate Patient 3 (Warning expiring package alert)
      const warningAlert = notifs.find((n: any) => n.id === `expiring_package_${pkgWarning.id}`);
      expect(warningAlert).toBeDefined();
      expect(warningAlert.type).toBe('expiring_package');
      expect(warningAlert.severity).toBe('warning');

      // Validate Patient 3 (Critical expiring package alert)
      const criticalAlert = notifs.find((n: any) => n.id === `expiring_package_${pkgCritical.id}`);
      expect(criticalAlert).toBeDefined();
      expect(criticalAlert.type).toBe('expiring_package');
      expect(criticalAlert.severity).toBe('critical');
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
