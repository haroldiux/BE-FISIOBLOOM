import { Response } from 'express';
import { ServiceCategory, TreatmentType } from '@prisma/client';
import prisma from '../services/prisma';
import { AuthenticatedRequest } from '../middlewares/auth';

// ── Service Endpoints ─────────────────────────────────────────────────────────

export const getAllServices = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { category, search } = req.query;
    const tenantId = req.user!.tenantId;

    const where: any = { isActive: true, tenantId };

    if (category && Object.values(ServiceCategory).includes(category as ServiceCategory)) {
      where.category = category as ServiceCategory;
    }

    if (search) {
      where.name = { contains: search as string, mode: 'insensitive' };
    }

    const services = await prisma.service.findMany({
      where,
      include: {
        consumables: {
          include: {
            product: true
          }
        },
        campaigns: {
          include: {
            campaign: true
          }
        }
      },
      orderBy: { name: 'asc' },
    });

    const now = new Date();
    const servicesWithPromotions = services.map(service => {
      const activeCampaignRelations = (service as any).campaigns || [];
      const activeCampaigns = activeCampaignRelations
        .map((sc: any) => sc.campaign)
        .filter((c: any) => c && c.isActive && now >= new Date(c.startDate) && now <= new Date(c.endDate));

      let activeCampaign = null;
      let promotionalPrice = service.defaultPrice;

      if (activeCampaigns.length > 0) {
        let maxDiscount = 0;
        for (const camp of activeCampaigns) {
          if (!camp) continue;
          let discount = 0;
          if (camp.discountType === 'PERCENTAGE') {
            discount = service.defaultPrice * (camp.discountValue / 100);
          } else if (camp.discountType === 'FIXED') {
            discount = camp.discountValue;
          }
          if (discount > maxDiscount) {
            maxDiscount = discount;
            activeCampaign = camp;
            promotionalPrice = Math.max(0, service.defaultPrice - discount);
          }
        }
      }

      const { campaigns: _c, ...serviceData } = service as any;
      return {
        ...serviceData,
        activeCampaign,
        promotionalPrice
      };
    });

    res.json(servicesWithPromotions);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al obtener los servicios.' });
  }
};

export const createService = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { name, category, treatmentType, defaultDuration, defaultPrice, retouchConfig, requiresConsent, contraindications } = req.body;
    const tenantId = req.user!.tenantId;

    if (!name || !category || defaultPrice === undefined) {
      res.status(400).json({ error: 'name, category, and defaultPrice are required.' });
      return;
    }

    const service = await prisma.service.create({
      data: {
        name,
        category: category as ServiceCategory,
        treatmentType: (treatmentType as TreatmentType) || TreatmentType.SINGLE_SESSION,
        defaultDuration: defaultDuration !== undefined ? Number(defaultDuration) : 60,
        defaultPrice: Number(defaultPrice),
        retouchConfig: retouchConfig || undefined,
        requiresConsent: !!requiresConsent,
        contraindications: contraindications || undefined,
        tenantId,
      },
      include: {
        consumables: {
          include: {
            product: true
          }
        }
      }
    });

    res.status(201).json(service);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al crear el servicio.' });
  }
};

export const updateService = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, category, treatmentType, defaultDuration, defaultPrice, retouchConfig, requiresConsent, contraindications, isActive } = req.body;
    const tenantId = req.user!.tenantId;

    const existing = await prisma.service.findFirst({ where: { id: String(id), tenantId } });
    if (!existing) {
      res.status(404).json({ error: 'Servicio no encontrado.' });
      return;
    }

    const service = await prisma.service.update({
      where: { id: String(id), tenantId },
      data: {
        ...(name !== undefined && { name }),
        ...(category !== undefined && { category: category as ServiceCategory }),
        ...(treatmentType !== undefined && { treatmentType: treatmentType as TreatmentType }),
        ...(defaultDuration !== undefined && { defaultDuration: Number(defaultDuration) }),
        ...(defaultPrice !== undefined && { defaultPrice: Number(defaultPrice) }),
        ...(retouchConfig !== undefined && { retouchConfig }),
        ...(requiresConsent !== undefined && { requiresConsent: !!requiresConsent }),
        ...(contraindications !== undefined && { contraindications }),
        ...(isActive !== undefined && { isActive }),
      },
      include: {
        consumables: {
          include: {
            product: true
          }
        }
      }
    });

    res.json(service);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al actualizar el servicio.' });
  }
};

export const removeService = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    const existing = await prisma.service.findFirst({ where: { id: String(id), tenantId } });
    if (!existing) {
      res.status(404).json({ error: 'Servicio no encontrado.' });
      return;
    }

    // Soft delete
    await prisma.service.update({
      where: { id: String(id), tenantId },
      data: { isActive: false },
    });

    res.json({ message: 'Servicio desactivado con éxito.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al desactivar el servicio.' });
  }
};

export const updateConsumables = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    const { consumables } = req.body; // Array of { productId: string, quantity: number }
    const tenantId = req.user!.tenantId;

    if (!Array.isArray(consumables)) {
      res.status(400).json({ error: 'consumables must be an array.' });
      return;
    }

    const serviceExists = await prisma.service.findFirst({ where: { id: String(id), tenantId } });
    if (!serviceExists) {
      res.status(404).json({ error: 'Servicio no encontrado.' });
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      // Delete current consumables
      await tx.serviceConsumable.deleteMany({
        where: { serviceId: String(id), tenantId }
      });

      // Create new consumables
      if (consumables.length > 0) {
        await tx.serviceConsumable.createMany({
          data: consumables.map((c: any) => ({
            serviceId: String(id),
            productId: String(c.productId),
            quantity: Number(c.quantity),
            tenantId,
          }))
        });
      }

      // Return service with new consumables
      return tx.service.findFirst({
        where: { id: String(id), tenantId },
        include: {
          consumables: {
            include: {
              product: true
            }
          }
        }
      });
    });

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al actualizar los insumos.' });
  }
};

// ── Package Template Endpoints ────────────────────────────────────────────────

export const getAllTemplates = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;
    const templates = await prisma.packageTemplate.findMany({
      where: { isActive: true, tenantId },
      include: {
        lines: {
          include: {
            service: {
              select: {
                name: true,
                defaultPrice: true,
              }
            }
          }
        }
      },
      orderBy: { name: 'asc' },
    });

    // Mapear para devolver un formato limpio con serviceName integrado en la respuesta
    const formatted = templates.map((tmpl) => ({
      id: tmpl.id,
      name: tmpl.name,
      description: tmpl.description,
      validityDays: tmpl.validityDays,
      totalPrice: tmpl.totalPrice,
      isActive: tmpl.isActive,
      lines: tmpl.lines.map((line) => ({
        id: line.id,
        serviceId: line.serviceId,
        serviceName: line.service?.name || 'Servicio Desconocido',
        sessions: line.sessions,
      }))
    }));

    res.json(formatted);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al obtener las plantillas de paquetes.' });
  }
};

export const createTemplate = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { name, description, validityDays, totalPrice, lines } = req.body;
    const tenantId = req.user!.tenantId;

    if (!name || totalPrice === undefined || !lines || !Array.isArray(lines) || lines.length === 0) {
      res.status(400).json({ error: 'name, totalPrice, and a non-empty lines array are required.' });
      return;
    }

    // Crear la plantilla con sus líneas en una transacción
    const template = await prisma.packageTemplate.create({
      data: {
        name,
        description,
        validityDays: validityDays !== undefined ? Number(validityDays) : 90,
        totalPrice: Number(totalPrice),
        tenantId,
        lines: {
          create: lines.map((line: any) => ({
            serviceId: line.serviceId,
            sessions: Number(line.sessions),
            tenantId,
          })),
        },
      },
      include: {
        lines: true
      }
    });

    res.status(201).json(template);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al crear la plantilla de paquete.' });
  }
};

export const updateTemplate = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, description, validityDays, totalPrice, lines, isActive } = req.body;
    const tenantId = req.user!.tenantId;

    const existing = await prisma.packageTemplate.findFirst({ where: { id: String(id), tenantId } });
    if (!existing) {
      res.status(404).json({ error: 'Plantilla de paquete no encontrada.' });
      return;
    }

    // Si nos pasan líneas, las eliminamos e insertamos de nuevo dentro de una transacción
    const updated = await prisma.$transaction(async (tx) => {
      if (lines && Array.isArray(lines)) {
        // Eliminar líneas viejas
        await tx.packageTemplateLine.deleteMany({ where: { templateId: String(id), tenantId } });
      }

      return tx.packageTemplate.update({
        where: { id: String(id), tenantId },
        data: {
          ...(name !== undefined && { name }),
          ...(description !== undefined && { description }),
          ...(validityDays !== undefined && { validityDays: Number(validityDays) }),
          ...(totalPrice !== undefined && { totalPrice: Number(totalPrice) }),
          ...(isActive !== undefined && { isActive }),
          ...(lines && Array.isArray(lines) && {
            lines: {
              create: lines.map((line: any) => ({
                serviceId: line.serviceId,
                sessions: Number(line.sessions),
                tenantId,
              })),
            }
          }),
        },
        include: {
          lines: true
        }
      });
    });

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al actualizar la plantilla de paquete.' });
  }
};

export const removeTemplate = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    const existing = await prisma.packageTemplate.findFirst({ where: { id: String(id), tenantId } });
    if (!existing) {
      res.status(404).json({ error: 'Plantilla de paquete no encontrada.' });
      return;
    }

    // Soft delete
    await prisma.packageTemplate.update({
      where: { id: String(id), tenantId },
      data: { isActive: false },
    });

    res.json({ message: 'Plantilla de paquete desactivada con éxito.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al desactivar la plantilla de paquete.' });
  }
};

// ── Service Consumables Endpoints ─────────────────────────────────────────────

export const getConsumables = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    const tenantId = req.user!.tenantId;

    const service = await prisma.service.findFirst({
      where: { id, tenantId },
    });
    if (!service) {
      res.status(404).json({ error: 'Servicio no encontrado.' });
      return;
    }

    const consumables = await prisma.serviceConsumable.findMany({
      where: { serviceId: id, tenantId },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            price: true,
            stock: true,
            unit: true,
          }
        }
      }
    });

    res.json(consumables);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al obtener los insumos.' });
  }
};

export const saveConsumables = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    const body = req.body;
    const tenantId = req.user!.tenantId;
    
    const items = Array.isArray(body) ? body : (body.consumables || body.items || []);

    if (!Array.isArray(items)) {
      res.status(400).json({ error: 'Body must be an array or contain a consumables array.' });
      return;
    }

    const service = await prisma.service.findFirst({
      where: { id, tenantId },
    });
    if (!service) {
      res.status(404).json({ error: 'Servicio no encontrado.' });
      return;
    }

    const saved = await prisma.$transaction(async (tx) => {
      await tx.serviceConsumable.deleteMany({
        where: { serviceId: id, tenantId },
      });

      if (items.length > 0) {
        for (const item of items) {
          if (!item.productId || item.quantity === undefined || Number(item.quantity) <= 0) {
            throw new Error('Cada insumo debe tener productId y una cantidad mayor a 0.');
          }
          const product = await tx.product.findFirst({
            where: { id: String(item.productId), tenantId },
          });
          if (!product) {
            throw new Error(`Producto con id ${item.productId} no encontrado.`);
          }
        }

        await tx.serviceConsumable.createMany({
          data: items.map((item: any) => ({
            serviceId: id,
            productId: String(item.productId),
            quantity: Math.round(Number(item.quantity)),
            tenantId,
          })),
        });
      }

      return tx.serviceConsumable.findMany({
        where: { serviceId: id, tenantId },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              price: true,
              stock: true,
              unit: true,
            }
          }
        }
      });
    });

    res.json(saved);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Error al guardar los insumos.' });
  }
};

export const deleteConsumable = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const serviceId = String(req.params.serviceId);
    const productId = String(req.params.productId);
    const tenantId = req.user!.tenantId;

    const consumable = await prisma.serviceConsumable.findFirst({
      where: {
        serviceId,
        productId,
        tenantId,
      }
    });

    if (!consumable) {
      res.status(404).json({ error: 'Insumo no encontrado en este servicio.' });
      return;
    }

    await prisma.serviceConsumable.delete({
      where: {
        id: consumable.id
      }
    });

    res.json({ message: 'Insumo eliminado con éxito.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al eliminar el insumo.' });
  }
};
