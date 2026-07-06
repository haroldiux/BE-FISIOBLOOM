import { Router } from 'express';
import { getAll, create, update, deleteAppointment, complete, cancelCharge, getRetouchAlerts, updateRetouch, updateStatus } from '../controllers/appointments';
import { requireAuth, requireRole } from '../middlewares/auth';
import { Role } from '@prisma/client';

const router = Router();

// Rutas específicas de retoques (deben ir antes de las rutas con :id dinámico)
router.get('/alerts/retouches', requireAuth, getRetouchAlerts);
router.put('/retouches/:id', requireAuth, updateRetouch);

// General CRUD (all authenticated users can read, schedule and reschedule appointments)
router.get('/', requireAuth, getAll);
router.post('/', requireAuth, create);
router.put('/:id', requireAuth, update);
router.put('/:id/status', requireAuth, updateStatus);
router.delete('/:id', requireAuth, deleteAppointment);

// Session Consumption / Completion (Restricted to clinical staff/ADMIN - no RECEPTIONIST allowed)
router.post('/:id/complete', requireAuth, requireRole([Role.ADMIN, Role.PHYSIO, Role.AESTHETICIAN]), complete);
router.post('/:id/cancel-charge', requireAuth, cancelCharge); // Receptionists can mark no-shows with charge

export default router;
