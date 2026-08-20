import { Router } from 'express';
import { requireAuth, requireRole } from '../middlewares/auth';
import { Role } from '@prisma/client';
import * as cabinsController from '../controllers/cabins';

const router = Router();

router.use(requireAuth);

// GET /api/cabins?category=&branchId=&isActive= — todos los autenticados
router.get('/', cabinsController.getAll);

// POST /api/cabins — Admin (de su sucursal) o Súper Admin
router.post('/', requireRole([Role.ADMIN, Role.SUPER_ADMIN]), cabinsController.create);

// PUT /api/cabins/:id — activar/desactivar o editar nombre/categoría
router.put('/:id', requireRole([Role.ADMIN, Role.SUPER_ADMIN]), cabinsController.update);

export default router;
