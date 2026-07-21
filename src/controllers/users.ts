import { Response } from 'express';
import { Role } from '@prisma/client';
import prisma from '../services/prisma';
import { AuthenticatedRequest } from '../middlewares/auth';

export const updateUser = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, email, role, isActive } = req.body;

    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    const tenantId = req.user.tenantId;

    // Check target user
    const targetUser = await prisma.user.findFirst({
      where: { id: id as string, tenantId },
    });

    if (!targetUser) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    // Bug #7: Admin self-deactivation guard
    if (id === req.user.id && isActive === false) {
      res.status(400).json({ error: 'Cannot deactivate your own account' });
      return;
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (req.user.role === Role.ADMIN || req.user.role === Role.SUPER_ADMIN) {
      if (role !== undefined) updateData.role = role as Role;
      if (isActive !== undefined) updateData.isActive = Boolean(isActive);
    }

    const updatedUser = await prisma.user.update({
      where: { id: id as string },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        tenantId: true,
        updatedAt: true,
      },
    });

    res.json({
      message: 'User updated successfully.',
      user: updatedUser,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred updating user.' });
  }
};

export const reactivateUser = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    const tenantId = req.user.tenantId;

    const targetUser = await prisma.user.findFirst({
      where: { id: id as string, tenantId },
    });

    if (!targetUser) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const reactivatedUser = await prisma.user.update({
      where: { id: id as string },
      data: { isActive: true },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        tenantId: true,
        updatedAt: true,
      },
    });

    res.json({
      message: 'User reactivated successfully.',
      user: reactivatedUser,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred reactivating user.' });
  }
};
