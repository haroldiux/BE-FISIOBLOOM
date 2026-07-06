import { Router } from 'express';
import { requireAuth, requireRole } from '../middlewares/auth';
import { Role } from '@prisma/client';
import * as servicesController from '../controllers/services';

const router = Router();

// Todas las rutas requieren inicio de sesión
router.use(requireAuth);

// ── Rutas de Catálogo de Servicios ────────────────────────────────────────────

// GET /api/services?category=&search= - Todos los profesionales pueden listarlos
router.get('/', servicesController.getAllServices);

// POST /api/services - Solo administradores
router.post('/', requireRole([Role.ADMIN]), servicesController.createService);

// PUT /api/services/:id - Solo administradores
router.put('/:id', requireRole([Role.ADMIN]), servicesController.updateService);

// POST /api/services/:id/consumables - Solo administradores
router.post('/:id/consumables', requireRole([Role.ADMIN]), servicesController.updateConsumables);

// DELETE /api/services/:id - Solo administradores (soft delete)
router.delete('/:id', requireRole([Role.ADMIN]), servicesController.removeService);

// ── Rutas de Insumos de Servicios (Consumables) ───────────────────────────────

// GET /api/services/:id/consumables - Todos los autenticados pueden listarlos
router.get('/:id/consumables', servicesController.getConsumables);

// POST /api/services/:id/consumables - Solo administradores
router.post('/:id/consumables', requireRole([Role.ADMIN]), servicesController.saveConsumables);

// DELETE /api/services/:serviceId/consumables/:productId - Solo administradores
router.delete('/:serviceId/consumables/:productId', requireRole([Role.ADMIN]), servicesController.deleteConsumable);

// ── Rutas de Plantillas de Paquetes (Combos) ──────────────────────────────────

// GET /api/services/templates - Todos pueden listarlos
router.get('/templates', servicesController.getAllTemplates);

// POST /api/services/templates - Solo administradores
router.post('/templates', requireRole([Role.ADMIN]), servicesController.createTemplate);

// PUT /api/services/templates/:id - Solo administradores
router.put('/templates/:id', requireRole([Role.ADMIN]), servicesController.updateTemplate);

// DELETE /api/services/templates/:id - Solo administradores
router.delete('/templates/:id', requireRole([Role.ADMIN]), servicesController.removeTemplate);

export default router;
