import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import { getOnboardingProgress, upsertOnboardingProgress } from '../controllers/onboarding';

const router = Router();

// GET /api/onboarding  → returns current user's progress (null if not started)
router.get('/', requireAuth, getOnboardingProgress);

// PUT /api/onboarding  → upsert progress (phase, step, completed, dismissed)
router.put('/', requireAuth, upsertOnboardingProgress);

export default router;
