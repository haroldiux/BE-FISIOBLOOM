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
      res.status(400).json({ error: 'serviceId and signatureData are required.' });
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
      res.status(404).json({ error: 'Patient not found.' });
      return;
    }

    let finalServiceId = serviceId;
    if (serviceId === 'general') {
      let generalService = await prisma.service.findFirst({
        where: { name: 'Consentimiento General', tenantId },
      });
      if (!generalService) {
        generalService = await prisma.service.create({
          data: {
            id: `general-service-${tenantId}`,
            name: 'Consentimiento General',
            category: 'ESTETICA',
            defaultDuration: 0,
            defaultPrice: 0,
            requiresConsent: true,
            tenantId,
          },
        });
      }
      finalServiceId = generalService.id;
    } else {
      const service = await prisma.service.findFirst({
        where: { id: serviceId, tenantId },
      });

      if (!service) {
        res.status(404).json({ error: 'Service not found.' });
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

    const patient = await prisma.patient.findFirst({
      where: { id: patientId, tenantId },
    });

    if (!patient) {
      res.status(404).json({ error: 'Patient not found.' });
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

    const consents = await prisma.consentDocument.findMany({
      where: { tenantId },
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
