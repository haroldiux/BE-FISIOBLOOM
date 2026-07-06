import { Router } from 'express';
import { register, login, me } from '../controllers/auth';
import { requireAuth, requireRole } from '../middlewares/auth';
import { Role } from '@prisma/client';

const router = Router();

// Public routes
router.post('/login', login);

// Authenticated routes
router.get('/me', requireAuth, me);

// Admin-only route for registering new professionals/users
router.post('/register', requireAuth, requireRole([Role.ADMIN]), register);

export default router;
