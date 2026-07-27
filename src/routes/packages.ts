import { Router } from 'express';
import { createPackage, sellPackageAndSchedule, getAlerts } from '../controllers/packages';
import { requireAuth, requireRole } from '../middlewares/auth';
import { requireActiveShift } from '../middlewares/shiftGate';
import { Role } from '@prisma/client';

const router = Router();

// Alerts (available to all authenticated users)
router.get('/alerts', requireAuth, getAlerts);

// Sell a package (only ADMIN can sell/register package billing)
router.post('/', requireAuth, requireRole([Role.ADMIN]), createPackage);

// Vender un paquete pre-armado y agendar su primera cita en un solo paso
// atómico, invocado desde "Nueva Cita" → pestaña "Paquete".
router.post('/sell-and-schedule', requireAuth, requireActiveShift, sellPackageAndSchedule);

export default router;
