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

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
