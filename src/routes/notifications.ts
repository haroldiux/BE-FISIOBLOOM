import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import { getNotifications } from '../controllers/notifications';

const router = Router();

// GET /api/notifications
router.get('/', requireAuth, getNotifications);

export default router;
