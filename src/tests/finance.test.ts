import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { cleanDatabase, seedTestDatabase, prisma } from './helpers';
import { CashStatus, PaymentMethod } from '@prisma/client';

let testData: any;

describe('Módulo de Finanzas (Caja Registradora y Facturación)', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
  });

  beforeEach(async () => {
    await cleanDatabase();
    testData = await seedTestDatabase();
  });

  describe('Flujo de Caja Completo', () => {
    it('Debe abrir la caja, procesar una factura en efectivo, registrar el movimiento de caja automático, y cerrar la caja', async () => {
      // 1. Abrir caja registradora con un saldo inicial de $500
      const openResponse = await request(app)
        .post('/api/finance/cash/open')
        .set('Authorization', `Bearer ${testData.receptionist.token}`)
        .send({
          initialBalance: 500,
          notes: 'Apertura de turno de prueba',
        });

      expect(openResponse.status).toBe(201);
      expect(openResponse.body.register.status).toBe(CashStatus.OPEN);
      expect(openResponse.body.register.initialBalance).toBe(500);

      // 2. Crear un paciente de prueba
      const patient = await prisma.patient.create({
        data: {
          fullName: 'Maria Finanzas',
          phone: '99998888',
          tenantId: testData.tenant.id,
          branchId: testData.branch.id,
        },
      });

      // 3. Crear una factura de $100 en efectivo por un servicio
      const invoiceResponse = await request(app)
        .post('/api/invoices')
        .set('Authorization', `Bearer ${testData.receptionist.token}`)
        .send({
          patientId: patient.id,
          paymentMethod: PaymentMethod.EFECTIVO,
          subtotal: 100,
          tax: 0,
          total: 100,
          items: [
            {
              productId: testData.product.id,
              description: 'Gel Conductor e Insumos',
              unitPrice: 100,
              quantity: 1,
              total: 100,
            }
          ]
        });

      expect(invoiceResponse.status).toBe(201);
      expect(invoiceResponse.body.invoice.total).toBe(100);

      // 4. Verificar que se creó el movimiento de caja automático
      const registerWithMovements = await prisma.cashRegister.findUnique({
        where: { id: openResponse.body.register.id },
        include: { movements: true },
      });

      expect(registerWithMovements?.movements.length).toBe(1);
      expect(registerWithMovements?.movements[0].amount).toBe(100);

      // 5. Cerrar la caja (requiere ADMIN). Conteo físico de $600 ($500 iniciales + $100 de la venta)
      const closeResponse = await request(app)
        .post('/api/finance/cash/close')
        .set('Authorization', `Bearer ${testData.admin.token}`)
        .send({
          actualBalance: 600,
          notes: 'Cierre de turno correcto sin descuadres',
        });

      expect(closeResponse.status).toBe(200);
      expect(closeResponse.body.register.status).toBe(CashStatus.CLOSED);
      expect(closeResponse.body.register.expectedBalance).toBe(600);
      expect(closeResponse.body.register.actualBalance).toBe(600);
      expect(closeResponse.body.register.discrepancy).toBe(0);
    });

    it('Debe fallar al intentar abrir una caja si ya hay una abierta', async () => {
      // Primera apertura
      await request(app)
        .post('/api/finance/cash/open')
        .set('Authorization', `Bearer ${testData.receptionist.token}`)
        .send({ initialBalance: 100 });

      // Segunda apertura (debe fallar)
      const secondOpenResponse = await request(app)
        .post('/api/finance/cash/open')
        .set('Authorization', `Bearer ${testData.receptionist.token}`)
        .send({ initialBalance: 200 });

      expect(secondOpenResponse.status).toBe(400);
      expect(secondOpenResponse.body.error).toContain('sesión de caja abierta');
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
