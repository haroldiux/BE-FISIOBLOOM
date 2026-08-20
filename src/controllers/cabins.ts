import { Response } from 'express';
import { Role, ServiceCategory } from '@prisma/client';
import prisma from '../services/prisma';
import { AuthenticatedRequest } from '../middlewares/auth';

// Cuántas cabinas activas hay de una categoría es literalmente cuántas citas
// de esa especialidad pueden pasar al mismo tiempo (ver checkCabinCollision
// en appointment.service.ts) — por eso este catálogo vive en la base de
// datos y no como constante fija, y solo lo administra el Admin/Súper Admin.

export const getAll = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { category, branchId, isActive } = req.query;
    const tenantId = req.user!.tenantId;

    const where: any = { tenantId };

    // Igual que Productos/Servicios: un Admin/staff de sucursal solo ve las
    // cabinas de SU sucursal. El Súper Admin ve todas, o filtra por
    // branchId si lo manda explícito.
    if (req.user!.role !== Role.SUPER_ADMIN) {
      where.branchId = req.user!.branchId;
    } else if (branchId) {
      where.branchId = String(branchId);
    }

    if (category && Object.values(ServiceCategory).includes(category as ServiceCategory)) {
      where.category = category as ServiceCategory;
    }

    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    const cabins = await prisma.cabin.findMany({
      where,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });

    res.json(cabins);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al obtener las cabinas.' });
  }
};

export const create = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { name, category, branchId: requestedBranchId } = req.body;
    const tenantId = req.user!.tenantId;
    const requesterRole = req.user!.role;

    if (!name || !category) {
      res.status(400).json({ error: 'name y category son obligatorios.' });
      return;
    }

    if (!Object.values(ServiceCategory).includes(category as ServiceCategory)) {
      res.status(400).json({ error: `category debe ser una de: ${Object.values(ServiceCategory).join(', ')}` });
      return;
    }

    // El Súper Admin (sin sucursal propia) debe indicar a qué sucursal
    // pertenece la cabina nueva. Un Admin de sucursal siempre usa la suya.
    let branchIdForNewCabin: string | undefined = req.user!.branchId;
    if (requesterRole === Role.SUPER_ADMIN) {
      if (!requestedBranchId) {
        res.status(400).json({ error: 'branchId es obligatorio para que el Súper Admin cree una cabina.' });
        return;
      }
      const branch = await prisma.branch.findFirst({ where: { id: requestedBranchId, tenantId } });
      if (!branch) {
        res.status(404).json({ error: 'La sucursal indicada no existe en esta clínica.' });
        return;
      }
      branchIdForNewCabin = branch.id;
    }

    if (!branchIdForNewCabin) {
      res.status(400).json({ error: 'No hay una sucursal activa seleccionada para crear la cabina.' });
      return;
    }

    const existing = await prisma.cabin.findFirst({
      where: { name, branchId: branchIdForNewCabin, tenantId },
    });
    if (existing) {
      res.status(400).json({ error: 'Ya existe una cabina con ese nombre en esta sucursal.' });
      return;
    }

    const cabin = await prisma.cabin.create({
      data: {
        name,
        category: category as ServiceCategory,
        tenantId,
        branchId: branchIdForNewCabin,
      },
    });

    res.status(201).json(cabin);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al crear la cabina.' });
  }
};

export const update = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, category, isActive } = req.body;
    const tenantId = req.user!.tenantId;

    const existing = await prisma.cabin.findFirst({ where: { id: String(id), tenantId } });
    if (!existing) {
      res.status(404).json({ error: 'Cabina no encontrada.' });
      return;
    }

    if (req.user!.role !== Role.SUPER_ADMIN && existing.branchId !== req.user!.branchId) {
      res.status(403).json({ error: 'No podés modificar cabinas de otra sucursal.' });
      return;
    }

    if (category !== undefined && !Object.values(ServiceCategory).includes(category as ServiceCategory)) {
      res.status(400).json({ error: `category debe ser una de: ${Object.values(ServiceCategory).join(', ')}` });
      return;
    }

    if (name !== undefined && name !== existing.name) {
      const nameTaken = await prisma.cabin.findFirst({
        where: { name, branchId: existing.branchId, tenantId, id: { not: existing.id } },
      });
      if (nameTaken) {
        res.status(400).json({ error: 'Ya existe una cabina con ese nombre en esta sucursal.' });
        return;
      }
    }

    const cabin = await prisma.cabin.update({
      where: { id: String(id), tenantId },
      data: {
        ...(name !== undefined && { name }),
        ...(category !== undefined && { category: category as ServiceCategory }),
        ...(isActive !== undefined && { isActive: !!isActive }),
      },
    });

    res.json(cabin);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al actualizar la cabina.' });
  }
};
