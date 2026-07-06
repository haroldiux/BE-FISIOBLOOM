import { Router } from 'express';
import { createPackage, getAlerts } from '../controllers/packages';
import { requireAuth, requireRole } from '../middlewares/auth';
import { Role } from '@prisma/client';

const router = Router();

// Alerts (available to all authenticated users)
router.get('/alerts', requireAuth, getAlerts);

// Sell a package (only ADMIN can sell/register package billing)
router.post('/', requireAuth, requireRole([Role.ADMIN]), createPackage);

export default router;
