import { Router } from 'express';
import { getAllTenants, createTenant, updateTenant } from '../controllers/saas';
import { requireAuth, requireRole } from '../middlewares/auth';
import { Role } from '@prisma/client';

const router = Router();

// Only SUPER_ADMIN can manage tenants globally
router.get('/tenants', requireAuth, requireRole([Role.SUPER_ADMIN]), getAllTenants);
router.post('/tenants', requireAuth, requireRole([Role.SUPER_ADMIN]), createTenant);
router.put('/tenants/:id', requireAuth, requireRole([Role.SUPER_ADMIN]), updateTenant);

export default router;
