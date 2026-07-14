import { Router } from 'express';
import { getAll, update, deleteProfessional, updateWorkingHours, addException, deleteException } from '../controllers/professionals';
import { requireAuth, requireRole } from '../middlewares/auth';
import { Role } from '@prisma/client';

const router = Router();

// List professionals - ADMIN, RECEPTIONIST, PHYSIO and AESTHETICIAN allowed
router.get('/', requireAuth, requireRole([Role.ADMIN, Role.RECEPTIONIST, Role.PHYSIO, Role.AESTHETICIAN]), getAll);

// Create schedule exception for a professional
router.post('/:id/exceptions', requireAuth, addException);

// Delete schedule exception
router.delete('/exceptions/:id', requireAuth, deleteException);

// Update professional profile or working hours - Authenticated (internal checks for self or ADMIN)
router.put('/:id', requireAuth, update);

// Update professional working hours specifically
router.put('/:id/working-hours', requireAuth, updateWorkingHours);

// Delete/deactivate professional - ADMIN only
router.delete('/:id', requireAuth, requireRole([Role.ADMIN]), deleteProfessional);

export default router;

