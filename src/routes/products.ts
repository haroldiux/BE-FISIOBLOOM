import { Router } from 'express';
import { requireAuth, requireRole } from '../middlewares/auth';
import { Role } from '@prisma/client';
import * as productsController from '../controllers/products';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// GET /api/products/movements
router.get('/movements', productsController.getMovements);

// GET /api/products/branch-stock
router.get('/branch-stock', productsController.getBranchStock);

// POST /api/products/transfer
router.post('/transfer', productsController.transferStock);

// POST /api/products/:id/adjust-stock — ADMIN only
router.post('/:id/adjust-stock', requireRole([Role.ADMIN]), productsController.adjustStock);

// GET /api/products?category=&search=
router.get('/', productsController.getAll);

// GET /api/products/low-stock — must be before /:id
router.get('/low-stock', productsController.getLowStock);

// POST /api/products — ADMIN only
router.post('/', requireRole([Role.ADMIN]), productsController.create);

// PUT /api/products/:id — ADMIN only
router.put('/:id', requireRole([Role.ADMIN]), productsController.update);

// DELETE /api/products/:id — ADMIN only (soft delete)
router.delete('/:id', requireRole([Role.ADMIN]), productsController.remove);

export default router;
