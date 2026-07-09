import { Router } from 'express';
import { checkIn, checkOut, getCurrentStatus, getAttendanceHistory } from '../controllers/attendance';
import { requireAuth, requireRole } from '../middlewares/auth';
import { Role } from '@prisma/client';

const router = Router();

router.get('/status', requireAuth, getCurrentStatus);
router.post('/check-in', requireAuth, checkIn);
router.post('/check-out', requireAuth, checkOut);
router.get('/history', requireAuth, requireRole([Role.ADMIN]), getAttendanceHistory);

export default router;
