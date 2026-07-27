import { Router } from 'express';
import { getAll, create, update, deleteAppointment, complete, cancelCharge, getRetouchAlerts, updateRetouch, updateStatus } from '../controllers/appointments';
import { requireAuth, requireRole } from '../middlewares/auth';
import { requireActiveShift } from '../middlewares/shiftGate';
import { Role } from '@prisma/client';

const router = Router();

// Rutas específicas de retoques (deben ir antes de las rutas con :id dinámico)
router.get('/alerts/retouches', requireAuth, getRetouchAlerts);
router.put('/retouches/:id', requireAuth, requireActiveShift, updateRetouch);

// General CRUD (all authenticated users can read, schedule and reschedule appointments)
router.get('/', requireAuth, getAll);
router.post('/', requireAuth, requireActiveShift, create);
router.put('/:id', requireAuth, requireActiveShift, update);
router.put('/:id/status', requireAuth, requireActiveShift, updateStatus);
router.delete('/:id', requireAuth, requireActiveShift, deleteAppointment);

// Session Consumption / Completion (Restricted to clinical staff/ADMIN - no RECEPTIONIST allowed)
router.post('/:id/complete', requireAuth, requireRole([Role.ADMIN, Role.PHYSIO, Role.AESTHETICIAN]), requireActiveShift, complete);
router.post('/:id/cancel-charge', requireAuth, requireActiveShift, cancelCharge); // Receptionists can mark no-shows with charge

export default router;
