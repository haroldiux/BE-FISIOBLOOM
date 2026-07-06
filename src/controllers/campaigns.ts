import { Response } from 'express';
import { DiscountType } from '@prisma/client';
import prisma from '../services/prisma';
import { AuthenticatedRequest } from '../middlewares/auth';

export const getAllCampaigns = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const campaigns = await prisma.campaign.findMany({
      include: {
        services: {
          include: {
            service: true
          }
        }
      },
      orderBy: { startDate: 'desc' }
    });
    res.json(campaigns);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al obtener las campañas.' });
  }
};

export const createCampaign = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const {
      name,
      description,
      discountType,
      discountValue,
      startDate,
      endDate,
      isActive,
      serviceIds
    } = req.body;

    if (!name || !discountType || discountValue === undefined || !startDate || !endDate) {
      res.status(400).json({ error: 'Los campos name, discountType, discountValue, startDate y endDate son requeridos.' });
      return;
    }

    const campaign = await prisma.campaign.create({
      data: {
        name,
        description,
        discountType: discountType as DiscountType,
        discountValue: Number(discountValue),
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        isActive: isActive !== undefined ? !!isActive : true,
        services: {
          create: serviceIds && Array.isArray(serviceIds)
            ? serviceIds.map((id: string) => ({ serviceId: id }))
            : []
        }
      },
      include: {
        services: {
          include: {
            service: true
          }
        }
      }
    });

    res.status(201).json(campaign);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al crear la campaña.' });
  }
};

export const updateCampaign = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      discountType,
      discountValue,
      startDate,
      endDate,
      isActive,
      serviceIds
    } = req.body;

    const existing = await prisma.campaign.findUnique({ where: { id: String(id) } });
    if (!existing) {
      res.status(404).json({ error: 'Campaña no encontrada.' });
      return;
    }

    const data: any = {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(discountType !== undefined && { discountType: discountType as DiscountType }),
      ...(discountValue !== undefined && { discountValue: Number(discountValue) }),
      ...(startDate !== undefined && { startDate: new Date(startDate) }),
      ...(endDate !== undefined && { endDate: new Date(endDate) }),
      ...(isActive !== undefined && { isActive: !!isActive })
    };

    if (serviceIds !== undefined && Array.isArray(serviceIds)) {
      data.services = {
        deleteMany: {},
        create: serviceIds.map((srvId: string) => ({ serviceId: srvId }))
      };
    }

    const campaign = await prisma.campaign.update({
      where: { id: String(id) },
      data,
      include: {
        services: {
          include: {
            service: true
          }
        }
      }
    });

    res.json(campaign);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al actualizar la campaña.' });
  }
};

export const deleteCampaign = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const existing = await prisma.campaign.findUnique({ where: { id: String(id) } });
    if (!existing) {
      res.status(404).json({ error: 'Campaña no encontrada.' });
      return;
    }

    await prisma.campaign.delete({ where: { id: String(id) } });
    res.json({ message: 'Campaña eliminada exitosamente.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al eliminar la campaña.' });
  }
};
