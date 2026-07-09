import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { cleanDatabase, seedTestDatabase, prisma } from './helpers';

let testData: any;

describe('Módulo de Autenticación y RBAC', () => {
  beforeAll(async () => {
    // Configurar entorno de test
    process.env.NODE_ENV = 'test';
  });

  beforeEach(async () => {
    await cleanDatabase();
    testData = await seedTestDatabase();
  });

  describe('POST /api/auth/login', () => {
    it('Debe iniciar sesión exitosamente con credenciales válidas', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@test.com',
          password: 'password123',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe('admin@test.com');
      expect(response.body.user.role).toBe('ADMIN');
    });

    it('Debe denegar inicio de sesión con contraseña incorrecta', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@test.com',
          password: 'wrongpassword',
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('Debe denegar inicio de sesión con email inexistente', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@test.com',
          password: 'password123',
        });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/auth/me', () => {
    it('Debe devolver el perfil del usuario con un token válido', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${testData.admin.token}`)
        .set('x-tenant-id', testData.tenant.id);

      expect(response.status).toBe(200);
      expect(response.body.email).toBe('admin@test.com');
      expect(response.body.role).toBe('ADMIN');
    });

    it('Debe devolver 401 si no se envía cabecera de autorización', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('x-tenant-id', testData.tenant.id);

      expect(response.status).toBe(401);
    });
  });

  describe('Control de Acceso Basado en Roles (RBAC)', () => {
    it('Un ADMIN no debe poder acceder a rutas de SUPER_ADMIN (/api/saas/tenants)', async () => {
      const response = await request(app)
        .get('/api/saas/tenants')
        .set('Authorization', `Bearer ${testData.admin.token}`);

      expect(response.status).toBe(403);
    });

    it('Un SUPER_ADMIN debe poder acceder a rutas de SUPER_ADMIN (/api/saas/tenants)', async () => {
      const response = await request(app)
        .get('/api/saas/tenants')
        .set('Authorization', `Bearer ${testData.superAdmin.token}`);

      // El endpoint puede devolver 200 o 400 si falta información, pero no un 403 de acceso denegado
      expect(response.status).not.toBe(403);
      expect(response.status).not.toBe(401);
    });

    it('Un PHYSIO no debe poder acceder a rutas de ADMIN de reportes (/api/reports)', async () => {
      const response = await request(app)
        .get('/api/reports')
        .set('Authorization', `Bearer ${testData.physio.token}`)
        .set('x-tenant-id', testData.tenant.id);

      expect(response.status).toBe(403);
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
