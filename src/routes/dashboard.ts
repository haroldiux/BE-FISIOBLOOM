import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import { getDashboard } from '../controllers/dashboard';

const router = Router();

// GET /api/dashboard
router.get('/', requireAuth, getDashboard);

export default router;
