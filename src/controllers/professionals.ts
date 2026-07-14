import { Response } from 'express';
import { Role } from '@prisma/client';
import prisma from '../services/prisma';
import { AuthenticatedRequest } from '../middlewares/auth';

export const getAll = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    // List all users for the current tenant, excluding passwords
    const professionals = await prisma.user.findMany({
      where: {
        tenantId: _req.user!.tenantId,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        workingHours: true,
        createdAt: true,
        updatedAt: true,
        scheduleExceptions: true,
        staffProfile: {
          select: {
            contractType: true,
            baseSalary: true,
            commissionRate: true,
            salesTarget: true,
          }
        }
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
    const { name, email, role, isActive, workingHours, contractType, baseSalary, commissionRate, salesTarget } = req.body;

    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    // Check if user is ADMIN or updating their own profile
    if (req.user.role !== Role.ADMIN && req.user.id !== id) {
      res.status(403).json({ error: 'Access denied. You can only update your own profile.' });
      return;
    }

    // Check if target user exists and belongs to the same tenant
    const existingUser = await prisma.user.findFirst({
      where: { id: id as string, tenantId: req.user!.tenantId },
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

    if (contractType !== undefined || baseSalary !== undefined || commissionRate !== undefined || salesTarget !== undefined) {
      await prisma.staffProfile.upsert({
        where: { userId: id as string },
        update: {
          ...(contractType !== undefined && { contractType }),
          ...(baseSalary !== undefined && { baseSalary: Number(baseSalary) }),
          ...(commissionRate !== undefined && { commissionRate: Number(commissionRate) }),
          ...(salesTarget !== undefined && { salesTarget: salesTarget !== null ? Number(salesTarget) : null }),
        },
        create: {
          tenantId: req.user!.tenantId,
          userId: id as string,
          contractType: contractType || 'FIXED',
          baseSalary: baseSalary !== undefined ? Number(baseSalary) : 0,
          commissionRate: commissionRate !== undefined ? Number(commissionRate) : 0,
          salesTarget: salesTarget !== undefined && salesTarget !== null ? Number(salesTarget) : null,
        },
      });
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
        scheduleExceptions: true,
        staffProfile: {
          select: {
            contractType: true,
            baseSalary: true,
            commissionRate: true,
            salesTarget: true,
          }
        }
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

    // Check if target user exists and belongs to the same tenant
    const existingUser = await prisma.user.findFirst({
      where: { id: id as string, tenantId: req.user!.tenantId },
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

export const updateWorkingHours = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { workingHours, scheduleExceptions } = req.body;

    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    // Check if user is ADMIN or updating their own profile
    if (req.user.role !== Role.ADMIN && req.user.id !== id) {
      res.status(403).json({ error: 'Access denied. You can only update your own profile.' });
      return;
    }

    // Check if target user exists and belongs to the same tenant
    const existingUser = await prisma.user.findFirst({
      where: { id: id as string, tenantId: req.user!.tenantId },
    });

    if (!existingUser) {
      res.status(404).json({ error: 'Professional not found.' });
      return;
    }

    // Prepare update data
    const updateData: any = {};
    if (workingHours !== undefined) {
      updateData.workingHours = workingHours;
    }

    // Update the user
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

    // Handle schedule exceptions if provided
    if (Array.isArray(scheduleExceptions)) {
      for (const exception of scheduleExceptions) {
        const { date, isAvailable, startTime, endTime, reason } = exception;
        if (exception.id) {
          await prisma.scheduleException.upsert({
            where: { id: exception.id },
            update: {
              date: new Date(date),
              isAvailable: isAvailable ?? false,
              startTime: startTime || null,
              endTime: endTime || null,
              reason: reason || null,
            },
            create: {
              id: exception.id,
              tenantId: req.user!.tenantId,
              professionalId: String(id),
              date: new Date(date),
              isAvailable: isAvailable ?? false,
              startTime: startTime || null,
              endTime: endTime || null,
              reason: reason || null,
            },
          });
        } else {
          await prisma.scheduleException.create({
            data: {
              tenantId: req.user!.tenantId,
              professionalId: String(id),
              date: new Date(date),
              isAvailable: isAvailable ?? false,
              startTime: startTime || null,
              endTime: endTime || null,
              reason: reason || null,
            },
          });
        }
      }
    }

    res.json({
      message: 'Working hours updated successfully.',
      user: updatedUser,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred during update.' });
  }
};

export const addException = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params; // professionalId
    const { date, isAvailable, startTime, endTime, reason } = req.body;
    const tenantId = req.user!.tenantId;

    if (!date) {
      res.status(400).json({ error: 'date is required.' });
      return;
    }

    // Verify user exists and belongs to tenant
    const professional = await prisma.user.findFirst({
      where: { id: String(id), tenantId }
    });

    if (!professional) {
      res.status(404).json({ error: 'Professional not found.' });
      return;
    }

    const exception = await prisma.scheduleException.create({
      data: {
        tenantId,
        professionalId: String(id),
        date: new Date(date),
        isAvailable: isAvailable !== undefined ? Boolean(isAvailable) : false,
        startTime: startTime || null,
        endTime: endTime || null,
        reason: reason || null,
      }
    });

    res.status(201).json({ message: 'Schedule exception created successfully.', exception });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error creating schedule exception.' });
  }
};

export const deleteException = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params; // exception id
    const tenantId = req.user!.tenantId;

    // Verify exception exists and belongs to tenant
    const exception = await prisma.scheduleException.findFirst({
      where: { id: String(id), tenantId }
    });

    if (!exception) {
      res.status(404).json({ error: 'Schedule exception not found.' });
      return;
    }

    await prisma.scheduleException.delete({
      where: { id: String(id) }
    });

    res.json({ message: 'Schedule exception deleted successfully.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error deleting schedule exception.' });
  }
};

