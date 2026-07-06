import { Router } from 'express';
import { requireAuth, requireRole } from '../middlewares/auth';
import { Role } from '@prisma/client';
import * as campaignsController from '../controllers/campaigns';

const router = Router();

// Todas las rutas de campañas requieren autenticación
router.use(requireAuth);

// GET /api/campaigns - Listar todas las campañas
router.get('/', campaignsController.getAllCampaigns);

// POST /api/campaigns - Crear una campaña (solo ADMIN)
router.post('/', requireRole([Role.ADMIN]), campaignsController.createCampaign);

// PUT /api/campaigns/:id - Actualizar una campaña (solo ADMIN)
router.put('/:id', requireRole([Role.ADMIN]), campaignsController.updateCampaign);

// DELETE /api/campaigns/:id - Eliminar una campaña (solo ADMIN)
router.delete('/:id', requireRole([Role.ADMIN]), campaignsController.deleteCampaign);

export default router;
