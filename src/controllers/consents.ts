import { Response } from 'express';
import { Role } from '@prisma/client';
import prisma from '../services/prisma';
import { AuthenticatedRequest } from '../middlewares/auth';

export const signConsent = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const patientId = req.params.id as string;
    const { id, serviceId, signatureData } = req.body;
    const tenantId = req.user!.tenantId;

    if (!serviceId || !signatureData) {
      res.status(400).json({ error: 'serviceId y signatureData son obligatorios.' });
      return;
    }

    // Check if consent already exists
    if (id) {
      const existingConsent = await prisma.consentDocument.findFirst({
        where: { id: String(id), tenantId },
        include: {
          service: {
            select: {
              name: true,
            },
          },
        },
      });
      if (existingConsent) {
        res.status(200).json({
          message: 'Consent signed successfully.',
          consent: existingConsent,
        });
        return;
      }
    }

    const patient = await prisma.patient.findFirst({
      where: { id: patientId, tenantId },
    });

    if (!patient) {
      res.status(404).json({ error: 'Paciente no encontrado.' });
      return;
    }

    let finalServiceId = serviceId;
    if (serviceId === 'general') {
      const branchId = req.user!.branchId || patient.branchId;
      let generalService = await prisma.service.findFirst({
        where: { name: 'Consentimiento General', tenantId },
      });
      if (!generalService) {
        if (!branchId) {
          res.status(400).json({ error: 'No se pudo determinar la sucursal para crear el Consentimiento General.' });
          return;
        }
        generalService = await prisma.service.create({
          data: {
            id: `general-service-${tenantId}-${branchId}`,
            name: 'Consentimiento General',
            category: 'ESTETICA',
            defaultDuration: 0,
            defaultPrice: 0,
            requiresConsent: true,
            tenantId,
            branchId,
          },
        });
      }
      finalServiceId = generalService.id;
    } else {
      const service = await prisma.service.findFirst({
        where: { id: serviceId, tenantId },
      });

      if (!service) {
        res.status(404).json({ error: 'Servicio no encontrado.' });
        return;
      }
    }

    const consent = await prisma.consentDocument.create({
      data: {
        id: id ? String(id) : undefined,
        patientId,
        serviceId: finalServiceId,
        signatureData,
        tenantId,
        branchId: patient.branchId,
      },
      include: {
        service: {
          select: {
            name: true,
          },
        },
      },
    });

    await prisma.patient.update({
      where: { id: patientId, tenantId },
      data: { consentSigned: true },
    });

    res.status(201).json({
      message: 'Consent signed successfully.',
      consent,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred signing consent.' });
  }
};

export const getConsents = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const patientId = req.params.id as string;
    const tenantId = req.user!.tenantId;
    const userRole = req.user!.role;

    const patientWhere: any = { id: patientId, tenantId };
    if (userRole === Role.PHYSIO || userRole === Role.AESTHETICIAN) {
      patientWhere.OR = [
        { appointments: { some: { professionalId: req.user!.id } } },
        { createdById: req.user!.id },
      ];
    }

    const patient = await prisma.patient.findFirst({
      where: patientWhere,
    });

    if (!patient) {
      res.status(404).json({ error: 'Paciente no encontrado.' });
      return;
    }

    const consents = await prisma.consentDocument.findMany({
      where: { patientId, tenantId },
      include: {
        service: {
          select: {
            name: true,
            category: true,
          },
        },
      },
      orderBy: {
        signedAt: 'desc',
      },
    });

    // Privacy restriction: Mask signature data for RECEPTIONIST
    const sanitizedConsents = consents.map(consent => {
      if (userRole === Role.RECEPTIONIST) {
        const { signatureData, ...rest } = consent;
        return rest;
      }
      return consent;
    });

    res.json(sanitizedConsents);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred fetching consent documents.' });
  }
};

export const getAllConsents = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;
    const userRole = req.user!.role;

    const whereClause: any = { tenantId };

    // Un profesional (fisio/esteticista) solo debe ver las firmas de sus propios
    // pacientes, igual que en la ficha clínica de Pacientes.
    if (userRole === Role.PHYSIO || userRole === Role.AESTHETICIAN) {
      whereClause.patient = {
        OR: [
          { appointments: { some: { professionalId: req.user!.id } } },
          { createdById: req.user!.id },
        ],
      };
    }

    const consents = await prisma.consentDocument.findMany({
      where: whereClause,
      include: {
        patient: {
          select: {
            fullName: true,
            phone: true,
            email: true,
          },
        },
        service: {
          select: {
            name: true,
            category: true,
          },
        },
      },
      orderBy: {
        signedAt: 'desc',
      },
    });

    // Privacy restriction: Mask signature data for RECEPTIONIST
    const sanitizedConsents = consents.map(consent => {
      if (userRole === Role.RECEPTIONIST) {
        const { signatureData, ...rest } = consent;
        return rest;
      }
      return consent;
    });

    res.json(sanitizedConsents);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred fetching all consent documents.' });
  }
};
