import { Response } from 'express';
import prisma from '../services/prisma';
import { AuthenticatedRequest } from '../middlewares/auth';

export const createPackage = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { patientId, packageName, expiresAt, lines } = req.body;

    if (!patientId || !packageName || !expiresAt || !lines || !Array.isArray(lines) || lines.length === 0) {
      res.status(400).json({ error: 'patientId, packageName, expiresAt, and a non-empty lines array are required.' });
      return;
    }

    // Check if patient exists and is active
    const patient = await prisma.patient.findFirst({
      where: { id: patientId, isActive: true },
    });

    if (!patient) {
      res.status(404).json({ error: 'Patient not found.' });
      return;
    }

    // Validate lines data structure
    for (const line of lines) {
      if (!line.serviceName || typeof line.totalSessions !== 'number' || line.totalSessions <= 0) {
        res.status(400).json({ error: 'Each line must have a serviceName and a positive totalSessions number.' });
        return;
      }
    }

    // Create TreatmentPackage and TreatmentPackageLines in a transaction
    const newPackage = await prisma.treatmentPackage.create({
      data: {
        patientId,
        packageName,
        expiresAt: new Date(expiresAt),
        status: 'ACTIVE',
        lines: {
          create: lines.map((line) => ({
            serviceName: line.serviceName,
            totalSessions: line.totalSessions,
            usedSessions: 0,
          })),
        },
      },
      include: {
        lines: true,
      },
    });

    res.status(201).json({
      message: 'Treatment package created successfully.',
      package: newPackage,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred creating treatment package.' });
  }
};

export const getPatientPackages = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Check if patient exists
    const patient = await prisma.patient.findFirst({
      where: { id: id as string, isActive: true },
    });

    if (!patient) {
      res.status(404).json({ error: 'Patient not found.' });
      return;
    }

    const packages = await prisma.treatmentPackage.findMany({
      where: {
        patientId: id as string,
        status: 'ACTIVE',
      },
      include: {
        lines: true,
      },
      orderBy: {
        purchasedAt: 'desc',
      },
    });

    res.json(packages);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred fetching patient packages.' });
  }
};

export const getAlerts = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const now = new Date();
    
    // 30 days ago limit for follow-up/retoque alerts
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // 15 days from now limit for expiration alerts
    const fifteenDaysFromNow = new Date();
    fifteenDaysFromNow.setDate(fifteenDaysFromNow.getDate() + 15);

    // Fetch all active packages with lines and patient info
    const activePackages = await prisma.treatmentPackage.findMany({
      where: {
        status: 'ACTIVE',
        patient: {
          isActive: true
        }
      },
      include: {
        patient: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            email: true,
            appointments: {
              where: {
                // completed or pending or confirmed appointments
                // we want to check if they have scheduled or attended anything recently
                status: {
                  in: ['PENDIENTE', 'CONFIRMADA', 'COMPLETADA']
                }
              },
              orderBy: {
                dateTime: 'desc'
              },
              take: 1
            }
          }
        },
        lines: true
      }
    });

    const inactiveFollowUpAlerts: any[] = [];
    const expiringAlerts: any[] = [];

    for (const pkg of activePackages) {
      // 1. Expiration Check (less than 15 days to expire, but not already expired)
      const expiresAtDate = new Date(pkg.expiresAt);
      if (expiresAtDate > now && expiresAtDate <= fifteenDaysFromNow) {
        expiringAlerts.push({
          packageId: pkg.id,
          packageName: pkg.packageName,
          patientId: pkg.patient.id,
          patientName: pkg.patient.fullName,
          expiresAt: pkg.expiresAt,
          daysRemaining: Math.ceil((expiresAtDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        });
      }

      // 2. Follow-up / Retoque check (has remaining sessions, but no appointments in past 30 days)
      const hasSessionsRemaining = pkg.lines.some(line => line.usedSessions < line.totalSessions);
      if (hasSessionsRemaining) {
        const latestAppointment = pkg.patient.appointments[0];
        
        // If there's no appointments or the latest one was more than 30 days ago
        const noRecentAppointment = !latestAppointment || new Date(latestAppointment.dateTime) < thirtyDaysAgo;

        if (noRecentAppointment) {
          inactiveFollowUpAlerts.push({
            packageId: pkg.id,
            packageName: pkg.packageName,
            patientId: pkg.patient.id,
            patientName: pkg.patient.fullName,
            phone: pkg.patient.phone,
            latestAppointmentDate: latestAppointment ? latestAppointment.dateTime : null,
            lines: pkg.lines.map(line => ({
              serviceName: line.serviceName,
              remaining: line.totalSessions - line.usedSessions
            }))
          });
        }
      }
    }

    res.json({
      followUpAlerts: inactiveFollowUpAlerts,
      expirationAlerts: expiringAlerts
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred fetching alerts.' });
  }
};
