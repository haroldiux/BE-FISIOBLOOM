import { Response } from 'express';
import { AppointmentStatus } from '@prisma/client';
import prisma from '../services/prisma';
import { AuthenticatedRequest } from '../middlewares/auth';
import { scheduleAppointmentReminder } from '../services/reminderQueue';

// Helper: Check if appointment fits in professional's working hours
const checkWorkingHours = async (professionalId: string, dateTime: Date, duration: number, tenantId: string): Promise<{ valid: boolean; error?: string }> => {
  const professional = await prisma.user.findUnique({
    where: { id: professionalId, tenantId },
    select: { workingHours: true },
  });

  if (!professional) {
    return { valid: false, error: 'Professional not found.' };
  }

  if (!professional.workingHours) {
    return { valid: false, error: 'Professional working hours are not configured.' };
  }

  const workingHours = professional.workingHours as any;
  const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayName = daysOfWeek[dateTime.getDay()];

  const daySchedule = workingHours[dayName];
  if (!daySchedule) {
    return { valid: false, error: `Professional does not work on ${dayName}.` };
  }

  // Parse appointment start/end in minutes since midnight
  const startMinutes = dateTime.getHours() * 60 + dateTime.getMinutes();
  const endMinutes = startMinutes + duration;

  // Parse schedule start/end in minutes since midnight
  const [startH, startM] = daySchedule.start.split(':').map(Number);
  const [endH, endM] = daySchedule.end.split(':').map(Number);
  const workStartMinutes = startH * 60 + startM;
  const workEndMinutes = endH * 60 + endM;

  if (startMinutes < workStartMinutes || endMinutes > workEndMinutes) {
    return {
      valid: false,
      error: `Appointment is outside working hours (${daySchedule.start} - ${daySchedule.end}).`,
    };
  }

  return { valid: true };
};

// Helper: Check if professional has overlapping appointments (active status: PENDIENTE, CONFIRMADA, COMPLETADA)
const checkProfessionalCollision = async (
  professionalId: string,
  dateTime: Date,
  duration: number,
  tenantId: string,
  excludeAppointmentId?: string
): Promise<boolean> => {
  const newStart = dateTime.getTime();
  const newEnd = newStart + duration * 60 * 1000;

  const existingAppointments = await prisma.appointment.findMany({
    where: {
      tenantId,
      professionalId,
      status: {
        in: [AppointmentStatus.PENDIENTE, AppointmentStatus.CONFIRMADA, AppointmentStatus.COMPLETADA],
      },
      id: excludeAppointmentId ? { not: excludeAppointmentId } : undefined,
    },
  });

  for (const appt of existingAppointments) {
    const extStart = new Date(appt.dateTime).getTime();
    const extEnd = extStart + appt.duration * 60 * 1000;

    // Overlap condition
    if (newStart < extEnd && extStart < newEnd) {
      return true;
    }
  }

  return false;
};

// Helper: Check if cabin has overlapping appointments (active status: PENDIENTE, CONFIRMADA, COMPLETADA)
const checkCabinCollision = async (
  cabin: string,
  dateTime: Date,
  duration: number,
  tenantId: string,
  excludeAppointmentId?: string
): Promise<boolean> => {
  const newStart = dateTime.getTime();
  const newEnd = newStart + duration * 60 * 1000;

  const existingAppointments = await prisma.appointment.findMany({
    where: {
      tenantId,
      cabin,
      status: {
        in: [AppointmentStatus.PENDIENTE, AppointmentStatus.CONFIRMADA, AppointmentStatus.COMPLETADA],
      },
      id: excludeAppointmentId ? { not: excludeAppointmentId } : undefined,
    },
  });

  for (const appt of existingAppointments) {
    const extStart = new Date(appt.dateTime).getTime();
    const extEnd = extStart + appt.duration * 60 * 1000;

    // Overlap condition
    if (newStart < extEnd && extStart < newEnd) {
      return true;
    }
  }

  return false;
};

export const getAll = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { professionalId, patientId, startDate, endDate } = req.query;

    const whereClause: any = {
      tenantId: req.user!.tenantId,
    };

    if (professionalId) {
      whereClause.professionalId = professionalId as string;
    }

    if (patientId) {
      whereClause.patientId = patientId as string;
    }

    if (startDate || endDate) {
      whereClause.dateTime = {};
      if (startDate) {
        whereClause.dateTime.gte = new Date(startDate as string);
      }
      if (endDate) {
        whereClause.dateTime.lte = new Date(endDate as string);
      }
    }

    const appointments = await prisma.appointment.findMany({
      where: whereClause,
      include: {
        patient: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            consentSigned: true,
            medicalHistory: true,
          },
        },
        professional: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
        service: true,
        sessionDetail: true,
      },
      orderBy: {
        dateTime: 'asc',
      },
    });

    res.json(appointments);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred fetching appointments.' });
  }
};

export const create = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;
    const { id, patientId, professionalId, dateTime, duration, status, cabin } = req.body;

    if (!patientId || !professionalId || !dateTime || !duration) {
      res.status(400).json({ error: 'patientId, professionalId, dateTime, and duration are required.' });
      return;
    }

    // Check if appointment already exists (idempotency for offline sync)
    if (id) {
      const existingAppointment = await prisma.appointment.findUnique({
        where: { id: String(id), tenantId },
        include: {
          patient: {
            select: {
              id: true,
              fullName: true,
            },
          },
          professional: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });
      if (existingAppointment) {
        res.status(200).json({
          message: 'Appointment already exists.',
          appointment: existingAppointment,
        });
        return;
      }
    }

    const apptDate = new Date(dateTime);

    // 1. Check working hours availability
    const scheduleCheck = await checkWorkingHours(professionalId, apptDate, Number(duration), tenantId);
    if (!scheduleCheck.valid) {
      res.status(400).json({ error: scheduleCheck.error });
      return;
    }

    // 2. Check for professional collision
    const professionalCollision = await checkProfessionalCollision(professionalId, apptDate, Number(duration), tenantId);
    if (professionalCollision) {
      res.status(400).json({ error: 'El profesional ya cuenta con una cita en ese horario' });
      return;
    }

    // 3. Check for cabin collision
    if (cabin) {
      const cabinCollision = await checkCabinCollision(cabin, apptDate, Number(duration), tenantId);
      if (cabinCollision) {
        res.status(400).json({ error: 'La cabina ya está ocupada en ese horario' });
        return;
      }
    }

    // Create the appointment
    const newAppointment = await prisma.appointment.create({
      data: {
        id: id ? String(id) : undefined,
        tenantId,
        patientId,
        professionalId,
        dateTime: apptDate,
        duration: Number(duration),
        status: status || AppointmentStatus.PENDIENTE,
        cabin: cabin || null,
      },
      include: {
        patient: {
          select: {
            id: true,
            fullName: true,
          },
        },
        professional: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Schedule WhatsApp reminder
    await scheduleAppointmentReminder(newAppointment.id, newAppointment.dateTime);

    res.status(201).json({
      message: 'Appointment created successfully.',
      appointment: newAppointment,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred creating appointment.' });
  }
};

export const update = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const { professionalId, dateTime, duration, status, cabin } = req.body;

    const existingAppt = await prisma.appointment.findUnique({
      where: { id: id as string, tenantId },
    });

    if (!existingAppt) {
      res.status(404).json({ error: 'Appointment not found.' });
      return;
    }

    if (status && status !== existingAppt.status) {
      if (status === 'COMPLETADA' || status === 'CANCELADA_CON_CARGO') {
        res.status(400).json({ error: 'No se permiten actualizaciones de estado directas a COMPLETADA o CANCELADA_CON_CARGO a través de esta ruta genérica.' });
        return;
      }
    }

    const targetProfessionalId = professionalId || existingAppt.professionalId;
    const targetDateTime = dateTime ? new Date(dateTime) : new Date(existingAppt.dateTime);
    const targetDuration = duration !== undefined ? Number(duration) : existingAppt.duration;
    const targetCabin = cabin !== undefined ? cabin : existingAppt.cabin;

    // Validate working hours and overlap only if date, time, duration, professional, or cabin changed
    if (professionalId || dateTime || duration !== undefined || cabin !== undefined) {
      const scheduleCheck = await checkWorkingHours(targetProfessionalId, targetDateTime, targetDuration, tenantId);
      if (!scheduleCheck.valid) {
        res.status(400).json({ error: scheduleCheck.error });
        return;
      }

      const professionalCollision = await checkProfessionalCollision(
        targetProfessionalId,
        targetDateTime,
        targetDuration,
        tenantId,
        id as string
      );
      if (professionalCollision) {
        res.status(400).json({ error: 'El profesional ya cuenta con una cita en ese horario' });
        return;
      }

      if (targetCabin) {
        const cabinCollision = await checkCabinCollision(
          targetCabin,
          targetDateTime,
          targetDuration,
          tenantId,
          id as string
        );
        if (cabinCollision) {
          res.status(400).json({ error: 'La cabina ya está ocupada en ese horario' });
          return;
        }
      }
    }

    const isReversion =
      status &&
      status !== existingAppt.status &&
      (existingAppt.status === 'COMPLETADA' || existingAppt.status === 'CANCELADA_CON_CARGO') &&
      (status === 'PENDIENTE' || status === 'CONFIRMADA' || status === 'CANCELADA_SIN_CARGO' || status === 'NO_ASISTIO');

    let updatedAppt;
    if (isReversion) {
      updatedAppt = await prisma.$transaction(async (tx) => {
        // 1. Decrement used sessions and restore package status
        const sessionDetail = await tx.sessionDetail.findUnique({
          where: { appointmentId: id as string },
        });

        if (sessionDetail && sessionDetail.packageLineId) {
          const line = await tx.treatmentPackageLine.findUnique({
            where: { id: sessionDetail.packageLineId, tenantId },
            include: { package: true },
          });

          if (line) {
            await tx.treatmentPackageLine.update({
              where: { id: line.id, tenantId },
              data: { usedSessions: { decrement: 1 } },
            });

            if (line.package.status === 'COMPLETED') {
              await tx.treatmentPackage.update({
                where: { id: line.packageId, tenantId },
                data: { status: 'ACTIVE' },
              });
            }
          }
        }

        // 2. Delete Session Detail
        if (sessionDetail) {
          await tx.sessionDetail.delete({
            where: { id: sessionDetail.id },
          });
        }

        // 3. Cancel Commission (set to 'CANCELLED')
        const commission = await tx.commission.findUnique({
          where: { appointmentId: id as string },
        });
        if (commission) {
          await tx.commission.update({
            where: { id: commission.id, tenantId },
            data: { status: 'CANCELLED' },
          });
        }

        // 4. Restore product stock and delete inventory movements
        const movements = await tx.inventoryMovement.findMany({
          where: { appointmentId: id as string, type: 'SESSION_CONSUMPTION', tenantId },
        });

        for (const movement of movements) {
          await tx.product.update({
            where: { id: movement.productId, tenantId },
            data: { stock: { increment: movement.quantity } },
          });

          await tx.inventoryMovement.delete({
            where: { id: movement.id, tenantId },
          });
        }

        // 5. Delete Retouch Schedule if PENDING
        const retouch = await tx.retouchSchedule.findFirst({
          where: { originalAppointmentId: id as string, tenantId },
        });
        if (retouch && retouch.status === 'PENDING') {
          await tx.retouchSchedule.delete({
            where: { id: retouch.id, tenantId },
          });
        }

        // 6. Update appointment
        return tx.appointment.update({
          where: { id: id as string, tenantId },
          data: {
            professionalId: targetProfessionalId,
            dateTime: targetDateTime,
            duration: targetDuration,
            status: status as AppointmentStatus,
            cabin: targetCabin,
          },
          include: {
            patient: {
              select: {
                id: true,
                fullName: true,
              },
            },
            professional: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        });
      });
    } else {
      updatedAppt = await prisma.appointment.update({
        where: { id: id as string, tenantId },
        data: {
          professionalId: targetProfessionalId,
          dateTime: targetDateTime,
          duration: targetDuration,
          status: status || existingAppt.status,
          cabin: targetCabin,
        },
        include: {
          patient: {
            select: {
              id: true,
              fullName: true,
            },
          },
          professional: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });
    }

    // Reschedule WhatsApp reminder
    await scheduleAppointmentReminder(updatedAppt.id, updatedAppt.dateTime);

    res.json({
      message: 'Appointment updated successfully.',
      appointment: updatedAppt,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred updating appointment.' });
  }
};

export const deleteAppointment = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const existingAppt = await prisma.appointment.findUnique({
      where: { id: id as string, tenantId },
    });

    if (!existingAppt) {
      res.status(404).json({ error: 'Appointment not found.' });
      return;
    }

    await prisma.appointment.delete({
      where: { id: id as string, tenantId },
    });

    res.json({
      message: 'Appointment deleted successfully.',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred deleting appointment.' });
  }
};

export const complete = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const { packageLineId, evolutionNotes, measurements } = req.body;

    if (!packageLineId || !evolutionNotes || !measurements) {
      res.status(400).json({ error: 'packageLineId, evolutionNotes, and measurements are required.' });
      return;
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id: id as string, tenantId },
    });

    if (!appointment) {
      res.status(404).json({ error: 'Appointment not found.' });
      return;
    }

    if (appointment.status === AppointmentStatus.COMPLETADA || appointment.status === AppointmentStatus.CANCELADA_CON_CARGO) {
      res.status(400).json({ error: 'Appointment is already completed or cancelled with charge.' });
      return;
    }

    // Fetch and validate package line
    const packageLine = await prisma.treatmentPackageLine.findUnique({
      where: { id: packageLineId, tenantId },
      include: { package: true },
    });

    if (!packageLine) {
      res.status(404).json({ error: 'Treatment package line not found.' });
      return;
    }

    if (packageLine.package.patientId !== appointment.patientId) {
      res.status(400).json({ error: 'Treatment package does not belong to this appointment\'s patient.' });
      return;
    }

    if (packageLine.package.status !== 'ACTIVE') {
      res.status(400).json({ error: 'Treatment package is not active.' });
      return;
    }

    if (packageLine.usedSessions >= packageLine.totalSessions) {
      res.status(400).json({ error: 'No remaining sessions in this package line.' });
      return;
    }

    // Transaction to update appointment, package line, create session details, and check package completion
    await prisma.$transaction(async (tx) => {
      // 1. Update appointment status
      await tx.appointment.update({
        where: { id: id as string, tenantId },
        data: { status: AppointmentStatus.COMPLETADA },
      });

      // 2. Increment used sessions on line
      const updatedLine = await tx.treatmentPackageLine.update({
        where: { id: packageLineId, tenantId },
        data: { usedSessions: { increment: 1 } },
      });

      // 3. Create Session Detail
      await tx.sessionDetail.create({
        data: {
          tenantId,
          appointmentId: id as string,
          packageLineId,
          evolutionNotes,
          measurements,
        },
      });

      // 3.5. Consumo Automático de Insumos
      const targetServiceId = appointment.serviceId || packageLine.serviceId;
      if (targetServiceId) {
        const consumables = await tx.serviceConsumable.findMany({
          where: { serviceId: targetServiceId, tenantId },
        });

        for (const consumable of consumables) {
          // Descontar la cantidad del stock del Product
          await tx.product.update({
            where: { id: consumable.productId, tenantId },
            data: {
              stock: {
                decrement: consumable.quantity,
              },
            },
          });

          // Crear un InventoryMovement de tipo SESSION_CONSUMPTION apuntando al id de la cita
          await tx.inventoryMovement.create({
            data: {
              productId: consumable.productId,
              type: 'SESSION_CONSUMPTION',
              quantity: consumable.quantity,
              appointmentId: appointment.id,
              notes: `Consumo automático por completar cita.`,
              tenantId: appointment.tenantId,
            },
          });
        }
      }

      // 4. Lógica de Retoque Automático (Trigger)
      // Buscamos si hay un servicio asociado (de la cita o de la línea del paquete)
      if (targetServiceId) {
        const service = await tx.service.findUnique({
          where: { id: targetServiceId, tenantId }
        });
        
        if (service && service.treatmentType === 'RETOUCHABLE') {
          const config = service.retouchConfig as any;
          const days = config?.retouchAfterDays || 30;
          
          const scheduledDate = new Date(appointment.dateTime);
          scheduledDate.setDate(scheduledDate.getDate() + Number(days));

          await tx.retouchSchedule.create({
            data: {
              patientId: appointment.patientId,
              serviceId: service.id,
              originalAppointmentId: appointment.id,
              scheduledDate,
              status: 'PENDING',
              retouchNumber: 1,
              tenantId: appointment.tenantId,
            }
          });
        }
      }

      // 4.5. Lógica de Comisión Automática
      const staffProfile = await tx.staffProfile.findUnique({
        where: { userId: appointment.professionalId, tenantId },
      });

      if (staffProfile) {
        const invoice = await tx.invoice.findFirst({
          where: { appointmentId: appointment.id, tenantId },
        });

        let price = 0;
        if (invoice) {
          price = invoice.total;
        } else {
          const serviceId = appointment.serviceId || packageLine.serviceId;
          if (serviceId) {
            const service = await tx.service.findUnique({
              where: { id: serviceId, tenantId },
            });
            if (service) {
              price = service.defaultPrice;
            }
          }
        }

        const commissionAmount = price * staffProfile.commissionRate;

        // Check if commission already exists (to prevent duplicates)
        const existingCommission = await tx.commission.findUnique({
          where: { appointmentId: appointment.id, tenantId },
        });

        if (!existingCommission) {
          await tx.commission.create({
            data: {
              staffId: appointment.professionalId,
              appointmentId: appointment.id,
              amount: commissionAmount,
              status: 'PENDING',
              tenantId: appointment.tenantId,
            },
          });
        }
      }

      // 5. Evaluate package completion
      const allLines = await tx.treatmentPackageLine.findMany({
        where: { packageId: packageLine.packageId, tenantId },
      });

      const allSessionsUsed = allLines.every((line) => {
        // Use updatedLine's value for the current line
        const used = line.id === packageLineId ? updatedLine.usedSessions : line.usedSessions;
        return used >= line.totalSessions;
      });

      if (allSessionsUsed) {
        await tx.treatmentPackage.update({
          where: { id: packageLine.packageId, tenantId },
          data: { status: 'COMPLETED' },
        });
      }
    });

    res.json({
      message: 'Appointment completed and session consumed successfully.',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred completing appointment.' });
  }
};

export const cancelCharge = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const { packageLineId } = req.body;

    if (!packageLineId) {
      res.status(400).json({ error: 'packageLineId is required.' });
      return;
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id: id as string, tenantId },
    });

    if (!appointment) {
      res.status(404).json({ error: 'Appointment not found.' });
      return;
    }

    if (appointment.status === AppointmentStatus.COMPLETADA || appointment.status === AppointmentStatus.CANCELADA_CON_CARGO) {
      res.status(400).json({ error: 'Appointment is already completed or cancelled with charge.' });
      return;
    }

    // Fetch and validate package line
    const packageLine = await prisma.treatmentPackageLine.findUnique({
      where: { id: packageLineId, tenantId },
      include: { package: true },
    });

    if (!packageLine) {
      res.status(404).json({ error: 'Treatment package line not found.' });
      return;
    }

    if (packageLine.package.patientId !== appointment.patientId) {
      res.status(400).json({ error: 'Treatment package does not belong to this appointment\'s patient.' });
      return;
    }

    if (packageLine.package.status !== 'ACTIVE') {
      res.status(400).json({ error: 'Treatment package is not active.' });
      return;
    }

    if (packageLine.usedSessions >= packageLine.totalSessions) {
      res.status(400).json({ error: 'No remaining sessions in this package line.' });
      return;
    }

    // Transaction to update status, consume session, and record missed session detail
    await prisma.$transaction(async (tx) => {
      // 1. Update appointment status
      await tx.appointment.update({
        where: { id: id as string, tenantId },
        data: { status: AppointmentStatus.CANCELADA_CON_CARGO },
      });

      // 2. Increment used sessions on line
      const updatedLine = await tx.treatmentPackageLine.update({
        where: { id: packageLineId, tenantId },
        data: { usedSessions: { increment: 1 } },
      });

      // 3. Create Session Detail for No-Show
      await tx.sessionDetail.create({
        data: {
          tenantId,
          appointmentId: id as string,
          packageLineId,
          evolutionNotes: 'Inasistencia - Cita Penalizada con Cargo',
        },
      });

      // 4. Evaluate package completion
      const allLines = await tx.treatmentPackageLine.findMany({
        where: { packageId: packageLine.packageId, tenantId },
      });

      const allSessionsUsed = allLines.every((line) => {
        const used = line.id === packageLineId ? updatedLine.usedSessions : line.usedSessions;
        return used >= line.totalSessions;
      });

      if (allSessionsUsed) {
        await tx.treatmentPackage.update({
          where: { id: packageLine.packageId, tenantId },
          data: { status: 'COMPLETED' },
        });
      }
    });

    res.json({
      message: 'Appointment cancelled with charge and session consumed.',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred cancelling appointment.' });
  }
};

export const getRetouchAlerts = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }
    const tenantId = req.user.tenantId;

    const retouches = await prisma.retouchSchedule.findMany({
      where: {
        tenantId,
        status: { in: ['PENDING', 'SCHEDULED'] },
        patient: { isActive: true },
      },
      include: {
        patient: {
          select: {
            id: true,
            fullName: true,
            phone: true,
          }
        },
        service: {
          select: {
            id: true,
            name: true,
          }
        },
        originalAppointment: {
          select: {
            dateTime: true,
          }
        }
      },
      orderBy: { scheduledDate: 'asc' },
    });

    res.json(retouches);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al obtener alertas de retoques.' });
  }
};

export const updateRetouch = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }
    const tenantId = req.user.tenantId;
    const { id } = req.params;
    const { status, retouchAppointmentId, notes } = req.body;

    const existing = await prisma.retouchSchedule.findFirst({
      where: {
        id: String(id),
        tenantId,
      },
    });
    if (!existing) {
      res.status(404).json({ error: 'Retoque no encontrado o no pertenece a este tenant.' });
      return;
    }

    const updated = await prisma.retouchSchedule.update({
      where: { id: String(id), tenantId },
      data: {
        ...(status !== undefined && { status }),
        ...(retouchAppointmentId !== undefined && { retouchAppointmentId }),
        ...(notes !== undefined && { notes }),
      },
    });

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al actualizar el retoque.' });
  }
};


export const updateStatus = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      res.status(400).json({ error: 'Status is required.' });
      return;
    }

    // Block direct transition to COMPLETADA or CANCELADA_CON_CARGO
    if (status === 'COMPLETADA' || status === 'CANCELADA_CON_CARGO') {
      res.status(400).json({ error: 'No se permiten actualizaciones de estado directas a COMPLETADA o CANCELADA_CON_CARGO a través de esta ruta genérica.' });
      return;
    }

    const existingAppt = await prisma.appointment.findUnique({
      where: { id: id as string, tenantId },
    });

    if (!existingAppt) {
      res.status(404).json({ error: 'Appointment not found.' });
      return;
    }

    const previousStatus = existingAppt.status;
    const isReversion =
      (previousStatus === 'COMPLETADA' || previousStatus === 'CANCELADA_CON_CARGO') &&
      (status === 'PENDIENTE' || status === 'CONFIRMADA' || status === 'CANCELADA_SIN_CARGO' || status === 'NO_ASISTIO');

    if (isReversion) {
      await prisma.$transaction(async (tx) => {
        // 1. Decrement used sessions and restore package status
        const sessionDetail = await tx.sessionDetail.findUnique({
          where: { appointmentId: id as string },
        });

        if (sessionDetail && sessionDetail.packageLineId) {
          const line = await tx.treatmentPackageLine.findUnique({
            where: { id: sessionDetail.packageLineId, tenantId },
            include: { package: true },
          });

          if (line) {
            await tx.treatmentPackageLine.update({
              where: { id: line.id, tenantId },
              data: { usedSessions: { decrement: 1 } },
            });

            if (line.package.status === 'COMPLETED') {
              await tx.treatmentPackage.update({
                where: { id: line.packageId, tenantId },
                data: { status: 'ACTIVE' },
              });
            }
          }
        }

        // 2. Delete Session Detail
        if (sessionDetail) {
          await tx.sessionDetail.delete({
            where: { id: sessionDetail.id },
          });
        }

        // 3. Cancel Commission (set to 'CANCELLED')
        const commission = await tx.commission.findUnique({
          where: { appointmentId: id as string },
        });
        if (commission) {
          await tx.commission.update({
            where: { id: commission.id, tenantId },
            data: { status: 'CANCELLED' },
          });
        }

        // 4. Restore product stock and delete inventory movements
        const movements = await tx.inventoryMovement.findMany({
          where: { appointmentId: id as string, type: 'SESSION_CONSUMPTION', tenantId },
        });

        for (const movement of movements) {
          await tx.product.update({
            where: { id: movement.productId, tenantId },
            data: { stock: { increment: movement.quantity } },
          });

          await tx.inventoryMovement.delete({
            where: { id: movement.id, tenantId },
          });
        }

        // 5. Delete Retouch Schedule if PENDING
        const retouch = await tx.retouchSchedule.findFirst({
          where: { originalAppointmentId: id as string, tenantId },
        });
        if (retouch && retouch.status === 'PENDING') {
          await tx.retouchSchedule.delete({
            where: { id: retouch.id, tenantId },
          });
        }

        // 6. Update appointment status
        await tx.appointment.update({
          where: { id: id as string, tenantId },
          data: { status: status as AppointmentStatus },
        });
      });
    } else {
      // Normal transition update
      await prisma.appointment.update({
        where: { id: id as string, tenantId },
        data: { status: status as AppointmentStatus },
      });
    }

    const updatedAppt = await prisma.appointment.findUnique({
      where: { id: id as string, tenantId },
      include: {
        patient: {
          select: {
            id: true,
            fullName: true,
          },
        },
        professional: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    res.json({
      message: 'Appointment status updated successfully.',
      appointment: updatedAppt,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred updating appointment status.' });
  }
};
