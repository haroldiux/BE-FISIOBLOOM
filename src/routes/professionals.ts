import { Router } from 'express';
import { getAll, getById, create, update, deleteProfessional, reactivateProfessional, updateWorkingHours, addException, deleteException } from '../controllers/professionals';
import { requireAuth, requireRole } from '../middlewares/auth';
import { Role } from '@prisma/client';

const router = Router();

// List professionals - ADMIN, RECEPTIONIST, PHYSIO and AESTHETICIAN allowed
router.get('/', requireAuth, requireRole([Role.ADMIN, Role.RECEPTIONIST, Role.PHYSIO, Role.AESTHETICIAN]), getAll);

// Create professional - ADMIN only
router.post('/', requireAuth, requireRole([Role.ADMIN]), create);

// Get professional by ID
router.get('/:id', requireAuth, getById);

// Reactivate professional - ADMIN only
router.patch('/:id/reactivate', requireAuth, requireRole([Role.ADMIN]), reactivateProfessional);

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

