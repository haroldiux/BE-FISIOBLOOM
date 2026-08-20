import { Response } from 'express';
import { AppointmentStatus, Role } from '@prisma/client';
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
  checkRequiredConsents,
} from '../services/appointment.service';

export const getAll = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { professionalId, patientId, startDate, endDate } = req.query;

    const whereClause: any = {
      tenantId: req.user!.tenantId,
    };

    if (professionalId) {
      whereClause.professionalId = professionalId as string;
    } else if (req.user && (req.user.role === Role.PHYSIO || req.user.role === Role.AESTHETICIAN)) {
      whereClause.professionalId = req.user.id;
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
        invoice: {
          select: { id: true },
        },
      },
      orderBy: {
        dateTime: 'asc',
      },
    });

    // Una factura solo puede apuntar a UNA cita vía appointmentId (relación
    // 1:1), pero puede cobrar VARIAS a la vez (ver additionalAppointmentIds
    // en Invoice) — sin este parche, esas otras citas seguirían apareciendo
    // como "sin cobrar" para siempre aunque ya se hayan pagado juntas en la
    // misma venta.
    const appointmentsWithoutInvoice = appointments.filter((a) => !a.invoice);
    if (appointmentsWithoutInvoice.length > 0) {
      const invoicesWithAdditional = await prisma.invoice.findMany({
        where: {
          tenantId: req.user!.tenantId,
          additionalAppointmentIds: { hasSome: appointmentsWithoutInvoice.map((a) => a.id) },
        },
        select: { id: true, additionalAppointmentIds: true },
      });
      const invoiceIdByAppointmentId = new Map<string, string>();
      for (const inv of invoicesWithAdditional) {
        for (const apptId of inv.additionalAppointmentIds) {
          invoiceIdByAppointmentId.set(apptId, inv.id);
        }
      }
      for (const appt of appointmentsWithoutInvoice) {
        const invoiceId = invoiceIdByAppointmentId.get(appt.id);
        if (invoiceId) {
          (appt as any).invoice = { id: invoiceId };
        }
      }
    }

    res.json(appointments);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred fetching appointments.' });
  }
};

export const create = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;
    const { id, patientId, professionalId, serviceId, additionalServiceIds, dateTime, duration, status, cabin, notes } = req.body;

    if (!patientId || !professionalId || !dateTime || !duration) {
      res.status(400).json({ error: 'patientId, professionalId, dateTime y duration son obligatorios.' });
      return;
    }

    if (status && !validateAppointmentStatus(status)) {
      res.status(400).json({ error: `Estado de cita inválido. Valores permitidos: ${Object.values(AppointmentStatus).join(', ')}` });
      return;
    }

    const apptDate = normalizeToBoliviaTime(dateTime);
    const dateCheck = validateAppointmentDate(apptDate);
    if (!dateCheck.valid) {
      res.status(400).json({ error: dateCheck.error });
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
          service: true,
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

    // Resolvemos la sucursal de la cita a partir de la del profesional que
    // atiende — se usa para que la colisión de cabina compare solo dentro de
    // la misma sucursal (dos sucursales pueden tener una cabina con el mismo
    // nombre, ej. "Cabina Facial 1", sin que se bloqueen entre sí).
    const professional = await prisma.user.findFirst({
      where: { id: professionalId, tenantId },
      select: { branchId: true },
    });
    if (!professional) {
      res.status(404).json({ error: 'Profesional no encontrado.' });
      return;
    }

    // 1. Check working hours availability
    const scheduleCheck = await checkWorkingHours(prisma, professionalId, apptDate, Number(duration), tenantId);
    if (!scheduleCheck.valid) {
      res.status(400).json({ error: scheduleCheck.error });
      return;
    }

    // 1.5 Check schedule exceptions
    const exceptionCheck = await checkScheduleExceptions(prisma, professionalId, apptDate, Number(duration), tenantId);
    if (!exceptionCheck.valid) {
      res.status(400).json({ error: exceptionCheck.error });
      return;
    }

    // 2. Check for professional collision
    const professionalCollision = await checkProfessionalCollision(prisma, professionalId, apptDate, Number(duration), tenantId);
    if (professionalCollision) {
      res.status(400).json({ error: 'El profesional ya cuenta con una cita en ese horario' });
      return;
    }

    // 3. Check for cabin collision
    if (cabin) {
      const cabinCollision = await checkCabinCollision(prisma, cabin, apptDate, Number(duration), tenantId, undefined, professional.branchId);
      if (cabinCollision) {
        res.status(400).json({ error: 'La cabina ya está ocupada en ese horario' });
        return;
      }
    }

    // 4. Check required consents for the service(s) being booked
    const consentCheck = await checkRequiredConsents(
      prisma,
      patientId,
      [serviceId, ...(Array.isArray(additionalServiceIds) ? additionalServiceIds : [])],
      tenantId
    );
    if (!consentCheck.valid) {
      res.status(400).json({ error: consentCheck.error });
      return;
    }

    // Create the appointment
    const newAppointment = await prisma.appointment.create({
      data: {
        id: id ? String(id) : undefined,
        tenantId,
        branchId: professional.branchId,
        patientId,
        professionalId,
        serviceId: serviceId || null,
        additionalServiceIds: Array.isArray(additionalServiceIds) ? additionalServiceIds : [],
        dateTime: apptDate,
        duration: Number(duration),
        status: (status as AppointmentStatus) || AppointmentStatus.PENDIENTE,
        cabin: cabin || null,
        notes: notes || null,
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
        service: true,
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
    const { professionalId, serviceId, additionalServiceIds, dateTime, duration, status, cabin, notes } = req.body;

    const existingAppt = await prisma.appointment.findUnique({
      where: { id: id as string, tenantId },
    });

    if (!existingAppt) {
      res.status(404).json({ error: 'Cita no encontrada.' });
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

    // Si cambia el profesional, la cita puede pasar a otra sucursal — se
    // vuelve a resolver desde el nuevo profesional. Si no cambia, se
    // conserva la que ya tenía la cita.
    let targetBranchId = existingAppt.branchId;
    if (professionalId && professionalId !== existingAppt.professionalId) {
      const newProfessional = await prisma.user.findFirst({
        where: { id: professionalId, tenantId },
        select: { branchId: true },
      });
      if (!newProfessional) {
        res.status(404).json({ error: 'Profesional no encontrado.' });
        return;
      }
      targetBranchId = newProfessional.branchId;
    }

    // Validate working hours and overlap only if date, time, duration, professional, or cabin changed
    if (professionalId || dateTime || duration !== undefined || cabin !== undefined) {
      const scheduleCheck = await checkWorkingHours(prisma, targetProfessionalId, targetDateTime, targetDuration, tenantId);
      if (!scheduleCheck.valid) {
        res.status(400).json({ error: scheduleCheck.error });
        return;
      }

      // Check schedule exceptions
      const exceptionCheck = await checkScheduleExceptions(prisma, targetProfessionalId, targetDateTime, targetDuration, tenantId);
      if (!exceptionCheck.valid) {
        res.status(400).json({ error: exceptionCheck.error });
        return;
      }

      const professionalCollision = await checkProfessionalCollision(
        prisma,
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
          prisma,
          targetCabin,
          targetDateTime,
          targetDuration,
          tenantId,
          id as string,
          targetBranchId
        );
        if (cabinCollision) {
          res.status(400).json({ error: 'La cabina ya está ocupada en ese horario' });
          return;
        }
      }
    }

    // Check required consents only if the service(s) attached to this cita
    // actually changed — re-checking on every reprogramación would block
    // unrelated edits (hora, cabina) for a cita that was already validated.
    if (serviceId !== undefined || additionalServiceIds !== undefined) {
      const targetServiceId = serviceId !== undefined ? serviceId : existingAppt.serviceId;
      const targetAdditionalServiceIds = Array.isArray(additionalServiceIds)
        ? additionalServiceIds
        : existingAppt.additionalServiceIds;
      const consentCheck = await checkRequiredConsents(
        prisma,
        existingAppt.patientId,
        [targetServiceId, ...targetAdditionalServiceIds],
        tenantId
      );
      if (!consentCheck.valid) {
        res.status(400).json({ error: consentCheck.error });
        return;
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
            branchId: targetBranchId,
            serviceId: serviceId !== undefined ? serviceId : existingAppt.serviceId,
            additionalServiceIds: Array.isArray(additionalServiceIds) ? additionalServiceIds : existingAppt.additionalServiceIds,
            dateTime: targetDateTime,
            duration: targetDuration,
            status: status as AppointmentStatus,
            cabin: targetCabin,
            notes: notes !== undefined ? notes : existingAppt.notes,
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
          branchId: targetBranchId,
          serviceId: serviceId !== undefined ? serviceId : existingAppt.serviceId,
          additionalServiceIds: Array.isArray(additionalServiceIds) ? additionalServiceIds : existingAppt.additionalServiceIds,
          dateTime: targetDateTime,
          duration: targetDuration,
          status: status || existingAppt.status,
          cabin: targetCabin,
          notes: notes !== undefined ? notes : existingAppt.notes,
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
      res.status(404).json({ error: 'Cita no encontrada.' });
      return;
    }

    if (existingAppt.professionalId !== req.user!.id && !['ADMIN', 'SUPER_ADMIN'].includes(req.user!.role)) {
      res.status(403).json({ error: 'Solo podés eliminar tus propias citas.' });
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
    const { packageLineId, additionalPackageLineIds, evolutionNotes, measurements } = req.body;

    if (!evolutionNotes) {
      res.status(400).json({ error: 'evolutionNotes es obligatorio.' });
      return;
    }

    // Todas las líneas de paquete que esta sesión va a descontar juntas (ej.
    // una cita combinada de "Nueva Cita" → "Paquete" con varios servicios del
    // mismo combo: se completan y descuentan todas a la vez, no solo la
    // principal).
    const allPackageLineIds: string[] = [
      packageLineId,
      ...(Array.isArray(additionalPackageLineIds) ? additionalPackageLineIds : []),
    ].filter(Boolean);

    const appointment = await prisma.appointment.findUnique({
      where: { id: id as string, tenantId },
    });

    if (!appointment) {
      res.status(404).json({ error: 'Cita no encontrada.' });
      return;
    }

    if (appointment.status === AppointmentStatus.COMPLETADA || appointment.status === AppointmentStatus.CANCELADA_CON_CARGO) {
      res.status(400).json({ error: 'La cita ya fue completada o cancelada con cobro.' });
      return;
    }

    if (new Date() < appointment.dateTime) {
      res.status(400).json({ error: 'No se puede completar una cita antes de su hora programada.' });
      return;
    }

    // Fetch and validate package lines (opcional: una cita puede completarse como sesión
    // única sin descontar de ningún bono/paquete de tratamiento). Si hay varias (cita
    // combinada de un mismo paquete), se validan y descuentan todas juntas.
    let packageLine: (Awaited<ReturnType<typeof prisma.treatmentPackageLine.findUnique>> & { package: any }) | null = null;
    let allPackageLines: (Awaited<ReturnType<typeof prisma.treatmentPackageLine.findUnique>> & { package: any })[] = [];
    if (allPackageLineIds.length > 0) {
      allPackageLines = await prisma.treatmentPackageLine.findMany({
        where: { id: { in: allPackageLineIds }, tenantId },
        include: { package: true },
      }) as any;

      if (allPackageLines.length !== allPackageLineIds.length) {
        res.status(404).json({ error: 'Una o más líneas del paquete de tratamiento no fueron encontradas.' });
        return;
      }

      for (const line of allPackageLines) {
        if (line.package.patientId !== appointment.patientId) {
          res.status(400).json({ error: 'El paquete de tratamiento no pertenece al paciente de esta cita.' });
          return;
        }
        if (line.package.status !== 'ACTIVE') {
          res.status(400).json({ error: 'El paquete de tratamiento no está activo.' });
          return;
        }
        if (line.usedSessions >= line.totalSessions) {
          res.status(400).json({ error: `No quedan sesiones disponibles en "${line.serviceName}" de este paquete.` });
          return;
        }
      }

      packageLine = allPackageLines.find((l) => l.id === packageLineId) || allPackageLines[0];
    }

    // Transaction to update appointment, package line, create session details, and check package completion
    await prisma.$transaction(async (tx) => {
      // 1. Update appointment status
      await tx.appointment.update({
        where: { id: id as string, tenantId },
        data: { status: AppointmentStatus.COMPLETADA },
      });

      // 2. Increment used sessions en TODAS las líneas de paquete que aplican
      // (solo si la sesión pertenece a un paquete)
      const updatedLines = await Promise.all(
        allPackageLineIds.map((lineId) =>
          tx.treatmentPackageLine.update({
            where: { id: lineId, tenantId },
            data: { usedSessions: { increment: 1 } },
          })
        )
      );
      // 3. Create Session Detail
      await tx.sessionDetail.create({
        data: {
          tenantId,
          appointmentId: id as string,
          packageLineId: packageLineId || null,
          additionalPackageLineIds: Array.isArray(additionalPackageLineIds) ? additionalPackageLineIds : [],
          evolutionNotes,
          measurements: measurements || undefined,
        },
      });

      // 3.5. Consumo Automático de Insumos
      const targetServiceId = appointment.serviceId || packageLine?.serviceId;
      if (targetServiceId) {
        const consumables = await tx.serviceConsumable.findMany({
          where: { serviceId: targetServiceId, tenantId },
        });

        for (const consumable of consumables) {
          const product = await tx.product.findFirst({
            where: { id: consumable.productId, tenantId },
          });

          if (!product || product.stock < consumable.quantity) {
            throw new Error(
              `INSUFFICIENT_STOCK: No hay suficiente stock de "${product?.name || consumable.productId}" para completar esta sesión. Disponible: ${product?.stock ?? 0}, necesario: ${consumable.quantity}.`
            );
          }

          // Descontar la cantidad del stock del Product
          await tx.product.update({
            where: { id: consumable.productId, tenantId },
            data: {
              stock: {
                decrement: consumable.quantity,
              },
            },
          });

          // Mantener sincronizado el stock por sucursal (el que usa Terminal POS
          // para bloquear ventas): si no hay fila para esta sucursal, no hace nada.
          if (appointment.branchId) {
            await tx.branchStock.updateMany({
              where: { productId: consumable.productId, branchId: appointment.branchId, tenantId },
              data: { stock: { decrement: consumable.quantity } },
            });
          }

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
          const serviceId = appointment.serviceId || packageLine?.serviceId;
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

      // 5. Evaluate package completion (solo aplica si esta sesión pertenece a un paquete;
      // una cita combinada puede tocar líneas de un mismo paquete, se evalúa una sola vez)
      const touchedPackageIds = [...new Set(allPackageLines.map((l) => l.packageId))];
      for (const packageId of touchedPackageIds) {
        const allLines = await tx.treatmentPackageLine.findMany({
          where: { packageId, tenantId },
        });

        const allSessionsUsed = allLines.every((line) => {
          const updated = updatedLines.find((u) => u.id === line.id);
          const used = updated ? updated.usedSessions : line.usedSessions;
          return used >= line.totalSessions;
        });

        if (allSessionsUsed) {
          await tx.treatmentPackage.update({
            where: { id: packageId, tenantId },
            data: { status: 'COMPLETED' },
          });
        }
      }
    });

    res.json({
      message: 'Appointment completed and session consumed successfully.',
    });
  } catch (error: any) {
    if (typeof error.message === 'string' && error.message.startsWith('INSUFFICIENT_STOCK: ')) {
      res.status(400).json({ error: error.message.replace('INSUFFICIENT_STOCK: ', '') });
      return;
    }
    res.status(500).json({ error: error.message || 'An error occurred completing appointment.' });
  }
};

export const cancelCharge = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const { packageLineId } = req.body;

    if (!packageLineId) {
      res.status(400).json({ error: 'packageLineId es obligatorio.' });
      return;
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id: id as string, tenantId },
    });

    if (!appointment) {
      res.status(404).json({ error: 'Cita no encontrada.' });
      return;
    }

    if (appointment.status === AppointmentStatus.COMPLETADA || appointment.status === AppointmentStatus.CANCELADA_CON_CARGO) {
      res.status(400).json({ error: 'La cita ya fue completada o cancelada con cobro.' });
      return;
    }

    // Fetch and validate package line
    const packageLine = await prisma.treatmentPackageLine.findUnique({
      where: { id: packageLineId, tenantId },
      include: { package: true },
    });

    if (!packageLine) {
      res.status(404).json({ error: 'Línea del paquete de tratamiento no encontrada.' });
      return;
    }

    if (packageLine.package.patientId !== appointment.patientId) {
      res.status(400).json({ error: 'El paquete de tratamiento no pertenece al paciente de esta cita.' });
      return;
    }

    if (packageLine.package.status !== 'ACTIVE') {
      res.status(400).json({ error: 'El paquete de tratamiento no está activo.' });
      return;
    }

    if (packageLine.usedSessions >= packageLine.totalSessions) {
      res.status(400).json({ error: 'No quedan sesiones disponibles en esta línea del paquete.' });
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
      res.status(401).json({ error: 'No autorizado.' });
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
      res.status(401).json({ error: 'No autorizado.' });
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
      where: { id: String(id) },
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
      res.status(400).json({ error: 'El estado es obligatorio.' });
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
      res.status(404).json({ error: 'Cita no encontrada.' });
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
