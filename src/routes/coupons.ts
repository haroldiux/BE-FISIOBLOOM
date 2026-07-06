import { Router } from 'express';
import { requireAuth, requireRole } from '../middlewares/auth';
import { Role } from '@prisma/client';
import * as couponsController from '../controllers/coupons';

const router = Router();

// Todas las rutas de cupones requieren autenticación
router.use(requireAuth);

// POST /api/coupons/validate - Valida un código de cupón
router.post('/validate', couponsController.validateCoupon);

// GET /api/coupons - Listar todos los cupones (cualquier usuario autenticado)
router.get('/', couponsController.getAllCoupons);

// POST /api/coupons - Crear un cupón (solo ADMIN)
router.post('/', requireRole([Role.ADMIN]), couponsController.createCoupon);

// PUT /api/coupons/:id - Actualizar un cupón (solo ADMIN)
router.put('/:id', requireRole([Role.ADMIN]), couponsController.updateCoupon);

// DELETE /api/coupons/:id - Eliminar un cupón (solo ADMIN)
router.delete('/:id', requireRole([Role.ADMIN]), couponsController.deleteCoupon);

export default router;
