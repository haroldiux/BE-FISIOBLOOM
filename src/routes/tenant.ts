import { Router } from 'express';
import { getSettings, updateSettings } from '../controllers/tenant';
import { requireAuth, requireRole } from '../middlewares/auth';
import { Role } from '@prisma/client';

const router = Router();

router.get('/settings', requireAuth, getSettings);
router.put('/settings', requireAuth, requireRole([Role.ADMIN, Role.SUPER_ADMIN]), updateSettings);

export default router;
