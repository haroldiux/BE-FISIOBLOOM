import { Router } from 'express';
import { Role } from '@prisma/client';
import { requireAuth, requireRole } from '../middlewares/auth';
import {
  getFinancialReport,
  getStaffReport,
  getInventoryReport,
  exportCSVReport,
  getGeneralReport,
} from '../controllers/reports';

const router = Router();

// Protect all report routes to ADMIN and SUPER_ADMIN
router.get('/', requireAuth, requireRole([Role.ADMIN, Role.SUPER_ADMIN]), getGeneralReport);
router.get('/financial', requireAuth, requireRole([Role.ADMIN, Role.SUPER_ADMIN]), getFinancialReport);
router.get('/staff', requireAuth, requireRole([Role.ADMIN, Role.SUPER_ADMIN]), getStaffReport);
router.get('/inventory', requireAuth, requireRole([Role.ADMIN, Role.SUPER_ADMIN]), getInventoryReport);
router.get('/export', requireAuth, requireRole([Role.ADMIN, Role.SUPER_ADMIN]), exportCSVReport);

export default router;
