import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { cleanDatabase, seedTestDatabase, prisma } from './helpers';

let testData: any;

describe('Módulo de Inventario / Productos', () => {
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

  describe('POST /api/products', () => {
    it('Debe crear un producto exitosamente como ADMIN', async () => {
      const response = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${testData.admin.token}`)
        .set('x-tenant-id', testData.tenant.id)
        .send({
          name: 'Agujas de acupuntura',
          category: 'CONSUMIBLE',
          price: 15.5,
          stock: 100,
          unit: 'caja',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('product');
      expect(response.body.product.name).toBe('Agujas de acupuntura');
      expect(response.body.product.stock).toBe(100);
      expect(response.body.product.price).toBe(15.5);
    });

    it('Debe fallar si faltan campos obligatorios', async () => {
      const response = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${testData.admin.token}`)
        .set('x-tenant-id', testData.tenant.id)
        .send({
          name: 'Agujas de acupuntura',
        });

      expect(response.status).toBe(400);
    });

    it('Debe denegar acceso a un rol que no sea ADMIN (ej. PHYSIO)', async () => {
      const response = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${testData.physio.token}`)
        .set('x-tenant-id', testData.tenant.id)
        .send({
          name: 'Agujas de acupuntura',
          category: 'CONSUMIBLE',
          price: 15.5,
        });

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/products', () => {
    it('Debe obtener todos los productos activos para el tenant', async () => {
      const response = await request(app)
        .get('/api/products')
        .set('Authorization', `Bearer ${testData.admin.token}`)
        .set('x-tenant-id', testData.tenant.id);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0].name).toBe('Gel Conductor 1L');
    });
  });

  describe('PUT /api/products/:id', () => {
    it('Debe actualizar un producto exitosamente como ADMIN', async () => {
      const response = await request(app)
        .put(`/api/products/${testData.product.id}`)
        .set('Authorization', `Bearer ${testData.admin.token}`)
        .set('x-tenant-id', testData.tenant.id)
        .send({
          price: 30,
          stock: 60,
        });

      expect(response.status).toBe(200);
      expect(response.body.product.price).toBe(30);
      expect(response.body.product.stock).toBe(60);
    });
  });

  describe('POST /api/products/:id/adjust-stock', () => {
    it('Debe ajustar stock incrementándolo (STOCK_IN)', async () => {
      const response = await request(app)
        .post(`/api/products/${testData.product.id}/adjust-stock`)
        .set('Authorization', `Bearer ${testData.admin.token}`)
        .set('x-tenant-id', testData.tenant.id)
        .send({
          quantity: 10,
          type: 'STOCK_IN',
          notes: 'Compra de inventario',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('product');
      expect(response.body.product.stock).toBe(60); // 50 + 10
      expect(response.body).toHaveProperty('movement');
      expect(response.body.movement.type).toBe('STOCK_IN');
      expect(response.body.movement.quantity).toBe(10);
    });

    it('Debe ajustar stock reduciéndolo (STOCK_OUT)', async () => {
      const response = await request(app)
        .post(`/api/products/${testData.product.id}/adjust-stock`)
        .set('Authorization', `Bearer ${testData.admin.token}`)
        .set('x-tenant-id', testData.tenant.id)
        .send({
          quantity: 20,
          type: 'STOCK_OUT',
          notes: 'Uso en cabina',
        });

      expect(response.status).toBe(200);
      expect(response.body.product.stock).toBe(30); // 50 - 20
      expect(response.body.movement.type).toBe('STOCK_OUT');
      expect(response.body.movement.quantity).toBe(20);
    });

    it('Debe rechazar un ajuste que resulte en stock negativo', async () => {
      const response = await request(app)
        .post(`/api/products/${testData.product.id}/adjust-stock`)
        .set('Authorization', `Bearer ${testData.admin.token}`)
        .set('x-tenant-id', testData.tenant.id)
        .send({
          quantity: 100, // excede los 50 en stock
          type: 'STOCK_OUT',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('stock resultante no puede ser negativo');
    });

    it('Debe rechazar cantidades inválidas', async () => {
      const response = await request(app)
        .post(`/api/products/${testData.product.id}/adjust-stock`)
        .set('Authorization', `Bearer ${testData.admin.token}`)
        .set('x-tenant-id', testData.tenant.id)
        .send({
          quantity: -5,
          type: 'STOCK_IN',
        });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/products/branch-stock', () => {
    it('Debe obtener registros de stock por sucursal', async () => {
      // Create a branch stock entry first
      await prisma.branchStock.create({
        data: {
          tenantId: testData.tenant.id,
          branchId: testData.branch.id,
          productId: testData.product.id,
          stock: 20,
        },
      });

      const response = await request(app)
        .get('/api/products/branch-stock')
        .set('Authorization', `Bearer ${testData.admin.token}`)
        .set('x-tenant-id', testData.tenant.id);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0].productId).toBe(testData.product.id);
      expect(response.body[0].stock).toBe(20);
    });
  });

  describe('POST /api/products/transfer', () => {
    it('Debe transferir stock de una sucursal a otra exitosamente', async () => {
      // 1. Create a second branch
      const destBranch = await prisma.branch.create({
        data: {
          tenantId: testData.tenant.id,
          name: 'Sucursal Test Sur',
        },
      });

      // 2. Create source BranchStock with 30 items
      await prisma.branchStock.create({
        data: {
          tenantId: testData.tenant.id,
          branchId: testData.branch.id,
          productId: testData.product.id,
          stock: 30,
        },
      });

      // 3. Perform transfer of 10 items
      const response = await request(app)
        .post('/api/products/transfer')
        .set('Authorization', `Bearer ${testData.admin.token}`)
        .set('x-tenant-id', testData.tenant.id)
        .send({
          productId: testData.product.id,
          sourceBranchId: testData.branch.id,
          destinationBranchId: destBranch.id,
          quantity: 10,
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Stock transferred successfully.');

      // 4. Verify DB changes
      const sourceStock = await prisma.branchStock.findUnique({
        where: { branchId_productId: { branchId: testData.branch.id, productId: testData.product.id } },
      });
      const destStock = await prisma.branchStock.findUnique({
        where: { branchId_productId: { branchId: destBranch.id, productId: testData.product.id } },
      });
      expect(sourceStock?.stock).toBe(20);
      expect(destStock?.stock).toBe(10);

      // Verify global product stock is unchanged (since +10, -10 cancels out)
      const updatedProduct = await prisma.product.findUnique({
        where: { id: testData.product.id },
      });
      expect(updatedProduct?.stock).toBe(50); // Original was 50

      // Verify movement logs
      const movements = await prisma.inventoryMovement.findMany({
        where: { productId: testData.product.id },
      });
      const stockIn = movements.find(m => m.type === 'STOCK_IN');
      const stockOut = movements.find(m => m.type === 'STOCK_OUT');

      expect(stockIn).toBeDefined();
      expect(stockOut).toBeDefined();
      expect(stockIn?.notes).toContain('Sucursal Test Norte');
      expect(stockOut?.notes).toContain('Sucursal Test Sur');
    });

    it('Debe rechazar la transferencia si el stock de origen es insuficiente', async () => {
      const destBranch = await prisma.branch.create({
        data: {
          tenantId: testData.tenant.id,
          name: 'Sucursal Test Sur',
        },
      });

      await prisma.branchStock.create({
        data: {
          tenantId: testData.tenant.id,
          branchId: testData.branch.id,
          productId: testData.product.id,
          stock: 5,
        },
      });

      const response = await request(app)
        .post('/api/products/transfer')
        .set('Authorization', `Bearer ${testData.admin.token}`)
        .set('x-tenant-id', testData.tenant.id)
        .send({
          productId: testData.product.id,
          sourceBranchId: testData.branch.id,
          destinationBranchId: destBranch.id,
          quantity: 10, // Exceeds 5
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('insuficiente');
    });
  });
});
