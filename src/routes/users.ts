import { Router } from 'express';
import { updateUser, reactivateUser } from '../controllers/users';
import { requireAuth, requireRole } from '../middlewares/auth';
import { Role } from '@prisma/client';

const router = Router();

router.use(requireAuth);

router.put('/:id', updateUser);
router.patch('/:id/reactivate', requireRole([Role.ADMIN, Role.SUPER_ADMIN]), reactivateUser);

export default router;
