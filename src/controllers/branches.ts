import { Response } from 'express';
import { Role } from '@prisma/client';
import prisma from '../services/prisma';
import { AuthenticatedRequest } from '../middlewares/auth';

export const getAll = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;
    const branches = await prisma.branch.findMany({
      where: { isActive: true, tenantId },
      orderBy: { name: 'asc' },
    });

    res.json(branches);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred fetching branches.' });
  }
};

export const getById = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const tenantId = req.user!.tenantId;

    const branch = await prisma.branch.findFirst({
      where: { id, isActive: true, tenantId },
    });

    if (!branch) {
      res.status(404).json({ error: 'Branch not found.' });
      return;
    }

    res.json(branch);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred fetching branch.' });
  }
};

export const create = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== Role.ADMIN) {
      res.status(403).json({ error: 'Forbidden. Admin privileges required.' });
      return;
    }

    const { name, address, phone } = req.body;
    const tenantId = req.user!.tenantId;

    if (!name) {
      res.status(400).json({ error: 'name is required.' });
      return;
    }

    const newBranch = await prisma.branch.create({
      data: {
        name,
        address: address || null,
        phone: phone || null,
        tenantId,
      },
    });

    res.status(201).json({
      message: 'Branch created successfully.',
      branch: newBranch,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred creating branch.' });
  }
};

export const update = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== Role.ADMIN) {
      res.status(403).json({ error: 'Forbidden. Admin privileges required.' });
      return;
    }

    const id = req.params.id as string;
    const { name, address, phone, isActive } = req.body;
    const tenantId = req.user!.tenantId;

    const branch = await prisma.branch.findFirst({
      where: { id, tenantId },
    });

    if (!branch) {
      res.status(404).json({ error: 'Branch not found.' });
      return;
    }

    const updatedBranch = await prisma.branch.update({
      where: { id, tenantId },
      data: {
        name: name !== undefined ? name : branch.name,
        address: address !== undefined ? address : branch.address,
        phone: phone !== undefined ? phone : branch.phone,
        isActive: isActive !== undefined ? Boolean(isActive) : branch.isActive,
      },
    });

    res.json({
      message: 'Branch updated successfully.',
      branch: updatedBranch,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred updating branch.' });
  }
};

export const deleteBranch = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== Role.ADMIN) {
      res.status(403).json({ error: 'Forbidden. Admin privileges required.' });
      return;
    }

    const id = req.params.id as string;
    const tenantId = req.user!.tenantId;

    const branch = await prisma.branch.findFirst({
      where: { id, tenantId },
    });

    if (!branch) {
      res.status(404).json({ error: 'Branch not found.' });
      return;
    }

    // Soft delete by setting isActive to false
    await prisma.branch.update({
      where: { id, tenantId },
      data: { isActive: false },
    });

    res.json({ message: 'Branch deactivated successfully.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred deactivating branch.' });
  }
};
