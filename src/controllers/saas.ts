import { Request, Response } from 'express';
import prisma from '../services/prisma';

export const getAllTenants = async (_req: Request, res: Response): Promise<void> => {
  try {
    const tenants = await prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json(tenants);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred while fetching tenants.' });
  }
};

export const createTenant = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, slug, plan } = req.body;
    if (!name || !slug) {
      res.status(400).json({ error: 'Name and slug are required.' });
      return;
    }

    const existing = await prisma.tenant.findUnique({
      where: { slug },
    });
    if (existing) {
      res.status(400).json({ error: 'Tenant slug already exists.' });
      return;
    }

    // Default settings
    const settings = {
      features: {
        multiBranch: false,
        inventory: false,
        portalPaciente: false,
      },
      branding: {
        primaryColor: '#ec4899', // Default pink
        palette: 'aura',         // Default palette
      },
    };

    const tenant = await prisma.tenant.create({
      data: {
        name,
        slug,
        plan: plan || 'BASIC',
        isActive: true,
        settings,
      },
    });

    res.status(201).json(tenant);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred while creating tenant.' });
  }
};

export const updateTenant = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, slug, plan, isActive, settings } = req.body;

    const existing = await prisma.tenant.findUnique({ where: { id: String(id) } });
    if (!existing) {
      res.status(404).json({ error: 'Tenant not found.' });
      return;
    }

    const tenant = await prisma.tenant.update({
      where: { id: String(id) },
      data: {
        name: name !== undefined ? String(name) : undefined,
        slug: slug !== undefined ? String(slug) : undefined,
        plan: plan !== undefined ? String(plan) : undefined,
        isActive: isActive !== undefined ? Boolean(isActive) : undefined,
        settings: settings !== undefined ? settings : undefined,
      },
    });

    res.json(tenant);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred while updating tenant.' });
  }
};
