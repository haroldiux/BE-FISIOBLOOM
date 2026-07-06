import { Request, Response } from 'express';
import { Role, AppointmentStatus } from '@prisma/client';
import prisma from '../services/prisma';

// Helper to check if two time ranges overlap
function doRangesOverlap(start1: Date, end1: Date, start2: Date, end2: Date): boolean {
  return start1 < end2 && start2 < end1;
}

export const getServices = async (_req: Request, res: Response): Promise<void> => {
  try {
    const services = await prisma.service.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    res.json(services);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al obtener servicios públicos.' });
  }
};

export const getProfessionals = async (_req: Request, res: Response): Promise<void> => {
  try {
    const staff = await prisma.user.findMany({
      where: {
        isActive: true,
        role: { in: [Role.ADMIN, Role.PHYSIO, Role.AESTHETICIAN] },
      },
      select: {
        id: true,
        name: true,
        role: true,
        workingHours: true,
      },
      orderBy: { name: 'asc' },
    });
    res.json(staff);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al obtener profesionales públicos.' });
  }
};

export const getSlots = async (req: Request, res: Response): Promise<void> => {
  try {
    const { date, serviceId, professionalId } = req.query;

    if (!date || !serviceId || !professionalId) {
      res.status(400).json({ error: 'date, serviceId, and professionalId are required.' });
      return;
    }

    // 1. Fetch service to get default duration
    const service = await prisma.service.findUnique({
      where: { id: String(serviceId) },
    });
    if (!service) {
      res.status(404).json({ error: 'Servicio no encontrado.' });
      return;
    }
    const duration = service.defaultDuration || 60;

    // 2. Fetch professional to get working hours
    const professional = await prisma.user.findUnique({
      where: { id: String(professionalId) },
    });
    if (!professional) {
      res.status(404).json({ error: 'Profesional no encontrado.' });
      return;
    }

    const dayName = new Date(String(date)).toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const wh = (professional.workingHours as any)?.[dayName];

    if (!wh || !wh.start || !wh.end) {
      res.json([]); // No working hours configured or day off
      return;
    }

    // 3. Get existing appointments for this professional on this day
    const startOfDay = new Date(String(date));
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(String(date));
    endOfDay.setHours(23, 59, 59, 999);

    const appointments = await prisma.appointment.findMany({
      where: {
        professionalId: String(professionalId),
        dateTime: {
          gte: startOfDay,
          lte: endOfDay,
        },
        status: {
          notIn: [AppointmentStatus.CANCELADA_CON_CARGO, AppointmentStatus.CANCELADA_SIN_CARGO],
        },
      },
    });

    // 4. Generate slots in 30-min increments
    const slots: string[] = [];
    const [startHour, startMin] = wh.start.split(':').map(Number);
    const [endHour, endMin] = wh.end.split(':').map(Number);

    const currentTime = new Date(startOfDay);
    currentTime.setHours(startHour, startMin, 0, 0);

    const endTimeLimit = new Date(startOfDay);
    endTimeLimit.setHours(endHour, endMin, 0, 0);

    while (currentTime.getTime() + duration * 60 * 1000 <= endTimeLimit.getTime()) {
      const slotStart = new Date(currentTime);
      const slotEnd = new Date(currentTime.getTime() + duration * 60 * 1000);

      // Check overlap
      const hasOverlap = appointments.some((appt) => {
        const apptStart = new Date(appt.dateTime);
        const apptEnd = new Date(apptStart.getTime() + appt.duration * 60 * 1000);
        return doRangesOverlap(slotStart, slotEnd, apptStart, apptEnd);
      });

      if (!hasOverlap) {
        // Format as HH:MM
        const hh = String(slotStart.getHours()).padStart(2, '0');
        const mm = String(slotStart.getMinutes()).padStart(2, '0');
        slots.push(`${hh}:${mm}`);
      }

      // Add 30-minute step
      currentTime.setMinutes(currentTime.getMinutes() + 30);
    }

    res.json(slots);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al calcular slots disponibles.' });
  }
};

export const createBooking = async (req: Request, res: Response): Promise<void> => {
  try {
    const { fullName, phone, email, serviceId, professionalId, dateTime } = req.body;

    if (!fullName || !phone || !serviceId || !professionalId || !dateTime) {
      res.status(400).json({ error: 'fullName, phone, serviceId, professionalId, and dateTime are required.' });
      return;
    }

    const parsedDate = new Date(dateTime);
    if (isNaN(parsedDate.getTime())) {
      res.status(400).json({ error: 'Fecha/hora dateTime inválida.' });
      return;
    }

    // Resolve tenantId from request context (set by tenantMiddleware via AsyncLocalStorage)
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      res.status(400).json({ error: 'No se pudo resolver el inquilino para la reserva.' });
      return;
    }

    // 1. Find or create patient
    let patient = await prisma.patient.findFirst({
      where: {
        tenantId,
        OR: [
          { phone },
          { email: email || undefined }
        ]
      }
    });

    if (!patient) {
      patient = await prisma.patient.create({
        data: {
          fullName,
          phone,
          email: email || null,
          consentSigned: false,
          tenantId,
        }
      });
    }

    // 2. Fetch service to get duration
    const service = await prisma.service.findUnique({
      where: { id: serviceId }
    });
    if (!service) {
      res.status(404).json({ error: 'Servicio no encontrado.' });
      return;
    }

    // 3. Create appointment
    const appointment = await prisma.appointment.create({
      data: {
        patientId: patient.id,
        serviceId,
        professionalId,
        dateTime: parsedDate,
        duration: service.defaultDuration || 60,
        status: AppointmentStatus.PENDIENTE,
        tenantId,
      }
    });

    // 4. Simulate WhatsApp reminder confirmation logging
    console.log(`
📱 ===================================================
📱 [RECORDATORIO PORTAL DE PACIENTES]
📱 Para: ${patient.fullName} (${patient.phone})
📱 Mensaje: Hola ${patient.fullName}, confirmamos la reserva de tu cita para ${service.name} el ${parsedDate.toLocaleString('es-MX')}.
📱 Responde: 
📱   1 para CONFIRMAR
📱   2 para CANCELAR
📱 ===================================================
    `);

    res.status(201).json({
      message: 'Reserva creada con éxito. Pendiente de confirmar.',
      appointment,
      patient
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al procesar reserva.' });
  }
};
