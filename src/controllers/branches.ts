import { Response } from 'express';
import { Role } from '@prisma/client';
import bcrypt from 'bcrypt';
import prisma from '../services/prisma';
import { AuthenticatedRequest } from '../middlewares/auth';

export const getAll = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;
    // Solo SUPER_ADMIN puede ver el listado completo de sucursales (para elegir
    // cuál mirar o "todas"). El resto de roles queda atado a la suya propia.
    const isSuperAdmin = req.user!.role === Role.SUPER_ADMIN;
    const where: any = { isActive: true, tenantId };
    if (!isSuperAdmin) {
      where.id = req.user!.branchId || '__none__';
    }
    const branches = await prisma.branch.findMany({
      where,
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
      res.status(404).json({ error: 'Sucursal no encontrada.' });
      return;
    }

    res.json(branch);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred fetching branch.' });
  }
};

export const create = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== Role.SUPER_ADMIN) {
      res.status(403).json({ error: 'Prohibido. Se requieren privilegios de administrador.' });
      return;
    }

    const { name, address, phone, adminName, adminEmail, adminPassword } = req.body;
    const tenantId = req.user!.tenantId;

    if (!name) {
      res.status(400).json({ error: 'El nombre (name) es obligatorio.' });
      return;
    }

    // El Admin de la sucursal es opcional al crearla (se puede agregar después
    // desde Ajustes > Sucursales), pero si se manda alguno de sus datos, se
    // exigen los tres.
    const wantsAdmin = adminName || adminEmail || adminPassword;
    if (wantsAdmin && (!adminName || !adminEmail || !adminPassword)) {
      res.status(400).json({ error: 'Para crear el administrador de la sucursal se requieren adminName, adminEmail y adminPassword.' });
      return;
    }

    if (wantsAdmin) {
      const existingUser = await prisma.user.findFirst({ where: { email: adminEmail, tenantId } });
      if (existingUser) {
        res.status(400).json({ error: 'Ya existe un usuario con ese email en esta clínica.' });
        return;
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const newBranch = await tx.branch.create({
        data: {
          name,
          address: address || null,
          phone: phone || null,
          tenantId,
        },
      });

      let admin = null;
      if (wantsAdmin) {
        const hashedPassword = await bcrypt.hash(adminPassword, 10);
        admin = await tx.user.create({
          data: {
            tenantId,
            branchId: newBranch.id,
            name: adminName,
            email: adminEmail,
            password: hashedPassword,
            role: Role.ADMIN,
            isActive: true,
          },
          select: { id: true, name: true, email: true, role: true },
        });
      }

      return { newBranch, admin };
    });

    res.status(201).json({
      message: 'Branch created successfully.',
      branch: result.newBranch,
      admin: result.admin,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred creating branch.' });
  }
};

export const update = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== Role.SUPER_ADMIN) {
      res.status(403).json({ error: 'Prohibido. Se requieren privilegios de administrador.' });
      return;
    }

    const id = req.params.id as string;
    const { name, address, phone, isActive } = req.body;
    const tenantId = req.user!.tenantId;

    const branch = await prisma.branch.findFirst({
      where: { id, tenantId },
    });

    if (!branch) {
      res.status(404).json({ error: 'Sucursal no encontrada.' });
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
    if (req.user?.role !== Role.SUPER_ADMIN) {
      res.status(403).json({ error: 'Prohibido. Se requieren privilegios de administrador.' });
      return;
    }

    const id = req.params.id as string;
    const tenantId = req.user!.tenantId;

    const branch = await prisma.branch.findFirst({
      where: { id, tenantId },
    });

    if (!branch) {
      res.status(404).json({ error: 'Sucursal no encontrada.' });
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
