import { Request, Response } from 'express';
import prisma from '../services/prisma';

export async function getOnboardingProgress(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).userId;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const progress = await prisma.onboardingProgress.findUnique({
      where: { userId },
    });

    res.json(progress ?? null);
  } catch (error) {
    console.error('Error getting onboarding progress:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function upsertOnboardingProgress(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).userId;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const { role, currentPhase, currentStep, completed, dismissed } = req.body;

    const progress = await prisma.onboardingProgress.upsert({
      where: { userId },
      update: {
        role,
        currentPhase: currentPhase ?? 0,
        currentStep: currentStep ?? 0,
        completed: completed ?? false,
        dismissed: dismissed ?? false,
      },
      create: {
        userId,
        role,
        currentPhase: currentPhase ?? 0,
        currentStep: currentStep ?? 0,
        completed: completed ?? false,
        dismissed: dismissed ?? false,
      },
    });

    res.json(progress);
  } catch (error) {
    console.error('Error saving onboarding progress:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
