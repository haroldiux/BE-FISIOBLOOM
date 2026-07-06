import { Response } from 'express';
import { Role } from '@prisma/client';
import prisma from '../services/prisma';
import { AuthenticatedRequest } from '../middlewares/auth';

export const getAll = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    // List all users, excluding passwords
    const professionals = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        workingHours: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    res.json(professionals);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred fetching professionals.' });
  }
};

export const update = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, email, role, isActive, workingHours } = req.body;

    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    // Check if user is ADMIN or updating their own profile
    if (req.user.role !== Role.ADMIN && req.user.id !== id) {
      res.status(403).json({ error: 'Access denied. You can only update your own profile.' });
      return;
    }

    // Check if target user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: id as string },
    });

    if (!existingUser) {
      res.status(404).json({ error: 'Professional not found.' });
      return;
    }

    // Prepare update data
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (workingHours !== undefined) updateData.workingHours = workingHours;

    // Only ADMIN can change role or isActive status
    if (req.user.role === Role.ADMIN) {
      if (role !== undefined) {
        if (!Object.values(Role).includes(role as Role)) {
          res.status(400).json({ error: 'Invalid role.' });
          return;
        }
        updateData.role = role as Role;
      }
      if (isActive !== undefined) {
        updateData.isActive = isActive;
      }
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
        workingHours: true,
        updatedAt: true,
      },
    });

    res.json({
      message: 'Professional updated successfully.',
      user: updatedUser,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred during update.' });
  }
};

export const deleteProfessional = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Check if target user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: id as string },
    });

    if (!existingUser) {
      res.status(404).json({ error: 'Professional not found.' });
      return;
    }

    // Deactivate user (soft delete to keep referential integrity for appointments)
    const deactivatedUser = await prisma.user.update({
      where: { id: id as string },
      data: { isActive: false },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
      },
    });

    res.json({
      message: 'Professional deactivated successfully.',
      user: deactivatedUser,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred during deactivation.' });
  }
};
