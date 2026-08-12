import { Response } from 'express';
import { Role, ServiceCategory, TreatmentType } from '@prisma/client';
import prisma from '../services/prisma';
import { AuthenticatedRequest } from '../middlewares/auth';

// ── Service Endpoints ─────────────────────────────────────────────────────────

export const getAllServices = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { category, search } = req.query;
    const tenantId = req.user!.tenantId;

    const where: any = { isActive: true, tenantId };

    // Igual que en Productos: un Admin/staff de sucursal solo ve el catálogo
    // de servicios de SU sucursal, nunca el de otras. Solo el Súper Admin ve
    // todo el tenant.
    if (req.user!.role !== Role.SUPER_ADMIN) {
      where.branchId = req.user!.branchId;
    }

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
    const { name, category, treatmentType, defaultDuration, defaultPrice, price, retouchConfig, requiresConsent, contraindications } = req.body;
    const tenantId = req.user!.tenantId;
    const branchId = req.user!.branchId;

    const resolvedPrice = defaultPrice !== undefined ? defaultPrice : price;

    if (!name || !category || resolvedPrice === undefined) {
      res.status(400).json({ error: 'name, category y defaultPrice (o price) son obligatorios.' });
      return;
    }

    if (!branchId) {
      res.status(400).json({ error: 'No hay una sucursal activa seleccionada para crear el servicio.' });
      return;
    }

    const service = await prisma.service.create({
      data: {
        name,
        category: category as ServiceCategory,
        treatmentType: (treatmentType as TreatmentType) || TreatmentType.SINGLE_SESSION,
        defaultDuration: defaultDuration !== undefined ? Number(defaultDuration) : 60,
        defaultPrice: Number(resolvedPrice),
        retouchConfig: retouchConfig || undefined,
        requiresConsent: !!requiresConsent,
        contraindications: contraindications || undefined,
        tenantId,
        branchId,
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
    const { name, category, treatmentType, defaultDuration, defaultPrice, price, retouchConfig, requiresConsent, contraindications, isActive } = req.body;
    const tenantId = req.user!.tenantId;

    const existing = await prisma.service.findFirst({ where: { id: String(id), tenantId } });
    if (!existing) {
      res.status(404).json({ error: 'Servicio no encontrado.' });
      return;
    }

    if (req.user!.role !== Role.SUPER_ADMIN && existing.branchId !== req.user!.branchId) {
      res.status(403).json({ error: 'No podés modificar servicios de otra sucursal.' });
      return;
    }

    const resolvedPrice = defaultPrice !== undefined ? defaultPrice : price;

    const service = await prisma.service.update({
      where: { id: String(id), tenantId },
      data: {
        ...(name !== undefined && { name }),
        ...(category !== undefined && { category: category as ServiceCategory }),
        ...(treatmentType !== undefined && { treatmentType: treatmentType as TreatmentType }),
        ...(defaultDuration !== undefined && { defaultDuration: Number(defaultDuration) }),
        ...(resolvedPrice !== undefined && { defaultPrice: Number(resolvedPrice) }),
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

    if (req.user!.role !== Role.SUPER_ADMIN && existing.branchId !== req.user!.branchId) {
      res.status(403).json({ error: 'No podés desactivar servicios de otra sucursal.' });
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
      res.status(400).json({ error: 'consumables debe ser un array.' });
      return;
    }

    const serviceExists = await prisma.service.findFirst({ where: { id: String(id), tenantId } });
    if (!serviceExists) {
      res.status(404).json({ error: 'Servicio no encontrado.' });
      return;
    }

    if (req.user!.role !== Role.SUPER_ADMIN && serviceExists.branchId !== req.user!.branchId) {
      res.status(403).json({ error: 'No podés modificar insumos de servicios de otra sucursal.' });
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
      category: tmpl.category,
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
    const { name, description, category, validityDays, totalPrice, lines } = req.body;
    const tenantId = req.user!.tenantId;

    if (!name || totalPrice === undefined || !lines || !Array.isArray(lines) || lines.length === 0) {
      res.status(400).json({ error: 'name, totalPrice y un array de lines no vacío son obligatorios.' });
      return;
    }

    if (!category || !Object.values(ServiceCategory).includes(category as ServiceCategory)) {
      res.status(400).json({ error: 'Debés elegir una especialidad/categoría válida para el paquete.' });
      return;
    }

    // Todos los servicios del paquete deben pertenecer a la misma
    // especialidad elegida — evita paquetes mezclados (ej. fisioterapia +
    // facial) que después no se pueden asignar a un solo profesional.
    const lineServices = await prisma.service.findMany({
      where: { id: { in: lines.map((l: any) => l.serviceId) }, tenantId },
      select: { id: true, category: true },
    });
    const mismatched = lineServices.some((s) => s.category !== category);
    if (mismatched) {
      res.status(400).json({ error: 'Todos los servicios del paquete deben ser de la misma especialidad elegida.' });
      return;
    }

    // Crear la plantilla con sus líneas en una transacción
    const template = await prisma.packageTemplate.create({
      data: {
        name,
        description,
        category: category as ServiceCategory,
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
    const { name, description, category, validityDays, totalPrice, lines, isActive } = req.body;
    const tenantId = req.user!.tenantId;

    const existing = await prisma.packageTemplate.findFirst({ where: { id: String(id), tenantId } });
    if (!existing) {
      res.status(404).json({ error: 'Plantilla de paquete no encontrada.' });
      return;
    }

    if (category !== undefined && !Object.values(ServiceCategory).includes(category as ServiceCategory)) {
      res.status(400).json({ error: 'Categoría/especialidad inválida.' });
      return;
    }

    // Misma regla que al crear: todos los servicios del paquete deben ser de
    // la especialidad efectiva (la nueva si se manda, si no la ya guardada).
    if (lines && Array.isArray(lines)) {
      const effectiveCategory = category !== undefined ? category : existing.category;
      const lineServices = await prisma.service.findMany({
        where: { id: { in: lines.map((l: any) => l.serviceId) }, tenantId },
        select: { id: true, category: true },
      });
      const mismatched = lineServices.some((s) => s.category !== effectiveCategory);
      if (mismatched) {
        res.status(400).json({ error: 'Todos los servicios del paquete deben ser de la misma especialidad elegida.' });
        return;
      }
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
          ...(category !== undefined && { category: category as ServiceCategory }),
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

    if (req.user!.role !== Role.SUPER_ADMIN && service.branchId !== req.user!.branchId) {
      res.status(403).json({ error: 'No podés ver insumos de servicios de otra sucursal.' });
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
      },
      include: { service: true },
    });

    if (!consumable) {
      res.status(404).json({ error: 'Insumo no encontrado en este servicio.' });
      return;
    }

    if (req.user!.role !== Role.SUPER_ADMIN && consumable.service.branchId !== req.user!.branchId) {
      res.status(403).json({ error: 'No podés modificar insumos de servicios de otra sucursal.' });
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
