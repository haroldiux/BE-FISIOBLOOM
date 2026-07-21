import { describe, it, expect, vi } from 'vitest';
import { requireAuth } from '../../middlewares/auth';
import { tenantMiddleware } from '../../middlewares/tenant';

describe('Unit Tests: Middlewares & Sanitization (Task 5.1)', () => {
  describe('requireAuth Middleware', () => {
    it('debe rechazar solicitudes sin encabezado Authorization con 401', async () => {
      const req: any = { headers: {} };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      await requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Access denied. No token provided.' });
      expect(next).not.toHaveBeenCalled();
    });

    it('debe procesar el formato de token Bearer correctamente', async () => {
      const req: any = {
        headers: { authorization: 'InvalidBearerFormat' },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      await requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Access denied. No token provided.' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('tenantMiddleware', () => {
    it('debe rechazar un x-tenant-id inexistente con 403', async () => {
      const req: any = {
        headers: { 'x-tenant-id': 'non-existent-tenant' },
        query: {},
        path: '/api/test',
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const next = vi.fn();

      await tenantMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Tenant no válido o inexistente.' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('XSS Sanitization Helper', () => {
    it('debe eliminar etiquetas HTML peligrosas <script> e <iframe>', () => {
      const sanitizeHtml = (str: string) => str.replace(/<[^>]*>?/gm, '');
      const input = '<script>alert("xss")</script>Juan Perez';
      const clean = sanitizeHtml(input);
      expect(clean).toBe('alert("xss")Juan Perez');
      expect(clean).not.toContain('<script>');
    });
  });
});
