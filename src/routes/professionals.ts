import { Router } from 'express';
import { getAll, getById, create, update, deleteProfessional, reactivateProfessional, unlockProfessional, updateWorkingHours, addException, deleteException } from '../controllers/professionals';
import { requireAuth, requireRole } from '../middlewares/auth';
import { Role } from '@prisma/client';

const router = Router();

// List professionals - ADMIN, RECEPTIONIST, PHYSIO, AESTHETICIAN and SUPER_ADMIN allowed
router.get('/', requireAuth, requireRole([Role.ADMIN, Role.RECEPTIONIST, Role.PHYSIO, Role.AESTHETICIAN, Role.SUPER_ADMIN]), getAll);

// Create professional - ADMIN (solo trabajadores de su sucursal) o SUPER_ADMIN (incluye Admins)
router.post('/', requireAuth, requireRole([Role.ADMIN, Role.SUPER_ADMIN]), create);

// Get professional by ID
router.get('/:id', requireAuth, getById);

// Reactivate professional - ADMIN only
router.patch('/:id/reactivate', requireAuth, requireRole([Role.ADMIN]), reactivateProfessional);

// Unlock account blocked by 3 failed login attempts - ADMIN only
router.patch('/:id/unlock', requireAuth, requireRole([Role.ADMIN]), unlockProfessional);

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

