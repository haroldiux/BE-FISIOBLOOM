import { Router } from 'express';
import { getAll, getById, create, update, deleteBranch } from '../controllers/branches';
import { requireAuth, requireRole } from '../middlewares/auth';
import { Role } from '@prisma/client';

const router = Router();

router.get('/', requireAuth, getAll);
router.get('/:id', requireAuth, getById);
router.post('/', requireAuth, requireRole([Role.ADMIN]), create);
router.put('/:id', requireAuth, requireRole([Role.ADMIN]), update);
router.delete('/:id', requireAuth, requireRole([Role.ADMIN]), deleteBranch);

export default router;
