import { Response } from 'express';
import { AppointmentStatus } from '@prisma/client';
import prisma from '../services/prisma';
import { AuthenticatedRequest } from '../middlewares/auth';
import { scheduleAppointmentReminder } from '../services/reminderQueue';
import {
  normalizeToBoliviaTime,
  validateAppointmentDate,
  validateAppointmentStatus,
  checkWorkingHours,
  checkScheduleExceptions,
  checkProfessionalCollision,
  checkCabinCollision,
} from '../services/appointment.service';

export const createPackage = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { patientId, packageName, totalPrice, expiresAt, lines } = req.body;
    const tenantId = req.user!.tenantId;

    if (!patientId || !packageName || !expiresAt || !lines || !Array.isArray(lines) || lines.length === 0) {
      res.status(400).json({ error: 'patientId, packageName, expiresAt y un array de lines no vacío son obligatorios.' });
      return;
    }

    // Check if patient exists and is active
    const patient = await prisma.patient.findFirst({
      where: { id: patientId, tenantId, isActive: true },
    });

    if (!patient) {
      res.status(404).json({ error: 'Paciente no encontrado.' });
      return;
    }

    // Validate lines data structure
    for (const line of lines) {
      if (!line.serviceName || typeof line.totalSessions !== 'number' || line.totalSessions <= 0) {
        res.status(400).json({ error: 'Cada línea debe tener un serviceName y un totalSessions positivo.' });
        return;
      }
    }

    // Create TreatmentPackage and TreatmentPackageLines in a transaction
    const newPackage = await prisma.treatmentPackage.create({
      data: {
        tenantId,
        branchId: patient.branchId,
        patientId,
        packageName,
        totalPrice: totalPrice !== undefined ? Number(totalPrice) : null,
        expiresAt: new Date(expiresAt),
        status: 'ACTIVE',
        lines: {
          create: lines.map((line: any) => ({
            tenantId,
            serviceId: line.serviceId || null,
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

// Error controlado (mensaje seguro para mostrar al usuario) vs. un error
// inesperado (500). Permite abortar la transacción de abajo sin perder el
// mensaje específico de cada validación.
class SellPackageValidationError extends Error {}

/**
 * Vende un paquete pre-armado (PackageTemplate) a un paciente Y agenda su
 * primera cita, en una única operación atómica: si agendar la cita falla
 * (turno ocupado, fuera de horario, etc.), la venta del paquete se revierte
 * también — nunca queda un paquete pagado sin cita agendada. Se invoca desde
 * "Nueva Cita" cuando se elige la pestaña "Paquete" en vez de armar la cita
 * con servicios sueltos.
 */
export const sellPackageAndSchedule = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { templateId, patientId, professionalId, dateTime, duration, cabin, notes, status } = req.body;
    const tenantId = req.user!.tenantId;

    if (!templateId || !patientId || !professionalId || !dateTime || !duration) {
      res.status(400).json({ error: 'templateId, patientId, professionalId, dateTime y duration son obligatorios.' });
      return;
    }

    if (status && !validateAppointmentStatus(status)) {
      res.status(400).json({ error: `Estado de cita inválido. Valores permitidos deben coincidir con los estados de cita soportados.` });
      return;
    }

    const apptDate = normalizeToBoliviaTime(dateTime);
    const dateCheck = validateAppointmentDate(apptDate);
    if (!dateCheck.valid) {
      res.status(400).json({ error: dateCheck.error });
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      const template = await tx.packageTemplate.findFirst({
        where: { id: templateId, tenantId, isActive: true },
        include: { lines: { include: { service: { select: { name: true } } } } },
      });
      if (!template) {
        throw new SellPackageValidationError('Paquete pre-armado no encontrado.');
      }

      const patient = await tx.patient.findFirst({
        where: { id: patientId, tenantId, isActive: true },
      });
      if (!patient) {
        throw new SellPackageValidationError('Paciente no encontrado.');
      }

      const scheduleCheck = await checkWorkingHours(tx, professionalId, apptDate, Number(duration), tenantId);
      if (!scheduleCheck.valid) {
        throw new SellPackageValidationError(scheduleCheck.error!);
      }

      const exceptionCheck = await checkScheduleExceptions(tx, professionalId, apptDate, Number(duration), tenantId);
      if (!exceptionCheck.valid) {
        throw new SellPackageValidationError(exceptionCheck.error!);
      }

      const professionalCollision = await checkProfessionalCollision(tx, professionalId, apptDate, Number(duration), tenantId);
      if (professionalCollision) {
        throw new SellPackageValidationError('El profesional ya cuenta con una cita en ese horario');
      }

      if (cabin) {
        const cabinCollision = await checkCabinCollision(tx, cabin, apptDate, Number(duration), tenantId);
        if (cabinCollision) {
          throw new SellPackageValidationError('La cabina ya está ocupada en ese horario');
        }
      }

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + (template.validityDays || 90));

      const newPackage = await tx.treatmentPackage.create({
        data: {
          tenantId,
          branchId: patient.branchId,
          patientId,
          packageName: template.name,
          totalPrice: template.totalPrice,
          expiresAt,
          status: 'ACTIVE',
          lines: {
            create: template.lines.map((line) => ({
              tenantId,
              serviceId: line.serviceId,
              serviceName: line.service?.name || 'Servicio Desconocido',
              totalSessions: line.sessions,
              usedSessions: 0,
            })),
          },
        },
        include: { lines: true },
      });

      const serviceIds = template.lines.map((l) => l.serviceId).filter(Boolean);

      const newAppointment = await tx.appointment.create({
        data: {
          tenantId,
          patientId,
          professionalId,
          serviceId: serviceIds[0] || null,
          additionalServiceIds: serviceIds.slice(1),
          dateTime: apptDate,
          duration: Number(duration),
          status: (status as AppointmentStatus) || AppointmentStatus.PENDIENTE,
          cabin: cabin || null,
          notes: notes || null,
        },
        include: {
          patient: { select: { id: true, fullName: true } },
          professional: { select: { id: true, name: true } },
          service: true,
        },
      });

      return { newPackage, newAppointment };
    });

    await scheduleAppointmentReminder(result.newAppointment.id, result.newAppointment.dateTime);

    res.status(201).json({
      message: 'Paquete vendido y cita agendada correctamente.',
      package: result.newPackage,
      appointment: result.newAppointment,
    });
  } catch (error: any) {
    if (error instanceof SellPackageValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: error.message || 'An error occurred selling the package.' });
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
      res.status(404).json({ error: 'Paciente no encontrado.' });
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
