import { Router } from 'express';
import { getAll, getById, create, update, deleteBranch } from '../controllers/branches';
import { requireAuth, requireRole } from '../middlewares/auth';
import { Role } from '@prisma/client';

const router = Router();

// Crear/editar/borrar sucursales es exclusivo del Súper Admin: cada Admin de
// sucursal ya no puede crear otras sucursales (ni verse a sí mismo con acceso
// a otras).
router.get('/', requireAuth, getAll);
router.get('/:id', requireAuth, getById);
router.post('/', requireAuth, requireRole([Role.SUPER_ADMIN]), create);
router.put('/:id', requireAuth, requireRole([Role.SUPER_ADMIN]), update);
router.delete('/:id', requireAuth, requireRole([Role.SUPER_ADMIN]), deleteBranch);

export default router;
