import { Router } from 'express';
import { getAll, update, deleteProfessional } from '../controllers/professionals';
import { requireAuth, requireRole } from '../middlewares/auth';
import { Role } from '@prisma/client';

const router = Router();

// List professionals - ADMIN and RECEPTIONIST allowed
router.get('/', requireAuth, requireRole([Role.ADMIN, Role.RECEPTIONIST]), getAll);

// Update professional profile or working hours - Authenticated (internal checks for self or ADMIN)
router.put('/:id', requireAuth, update);

// Delete/deactivate professional - ADMIN only
router.delete('/:id', requireAuth, requireRole([Role.ADMIN]), deleteProfessional);

export default router;
