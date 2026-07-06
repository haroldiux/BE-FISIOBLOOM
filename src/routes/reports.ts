import { Router } from 'express';
import { Role } from '@prisma/client';
import { requireAuth, requireRole } from '../middlewares/auth';
import {
  getFinancialReport,
  getStaffReport,
  getInventoryReport,
  exportCSVReport,
} from '../controllers/reports';

const router = Router();

// Protect all report routes to ADMIN only
router.get('/financial', requireAuth, requireRole([Role.ADMIN]), getFinancialReport);
router.get('/staff', requireAuth, requireRole([Role.ADMIN]), getStaffReport);
router.get('/inventory', requireAuth, requireRole([Role.ADMIN]), getInventoryReport);
router.get('/export', requireAuth, requireRole([Role.ADMIN]), exportCSVReport);

export default router;
