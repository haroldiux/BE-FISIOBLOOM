import { Response } from 'express';
import prisma from '../services/prisma';
import { AuthenticatedRequest } from '../middlewares/auth';
import { getBoliviaDayAndMinutes, getBoliviaTodayRange } from '../services/appointment.service';
import { evaluateShift, getTodaySchedule, autoCloseExpiredAttendance } from '../services/shift.service';

export const checkIn = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const tenantId = req.user!.tenantId;

    const now = new Date();

    // Si quedó una entrada de un turno anterior sin salida fichada (se le
    // olvidó), se cierra sola antes de evaluar nada más.
    await autoCloseExpiredAttendance(userId, tenantId, now);

    const { start: todayStart } = getBoliviaTodayRange(now);

    // Buscar si ya hay un fichaje activo hoy sin checkOut
    const activeAttendance = await prisma.attendance.findFirst({
      where: {
        userId,
        tenantId,
        checkIn: { gte: todayStart },
        checkOut: null,
      },
    });

    if (activeAttendance) {
      res.status(400).json({ error: 'Ya has registrado tu entrada para el turno de hoy.' });
      return;
    }

    const schedule = await getTodaySchedule(userId, tenantId, now);

    if (schedule.isDayOff) {
      res.status(400).json({ error: 'No tienes turno programado para hoy (Día libre).' });
      return;
    }

    const { minutesOfDay: actualMinutes } = getBoliviaDayAndMinutes(now);

    // Si ya pasó la hora de fin de turno de hoy, no tiene sentido fichar
    // entrada de nuevo: el turno de hoy ya terminó.
    if (schedule.end) {
      const [endHour, endMinute] = schedule.end.split(':').map(Number);
      const scheduledEndMinutes = endHour * 60 + endMinute;
      if (actualMinutes > scheduledEndMinutes) {
        res.status(400).json({ error: 'Ya terminó tu turno de hoy, no podés volver a fichar entrada.' });
        return;
      }
    }

    let status = 'PRESENT';
    if (schedule.start) {
      const [schedHour, schedMinute] = schedule.start.split(':').map(Number);
      const scheduledMinutes = schedHour * 60 + schedMinute;
      if (actualMinutes > scheduledMinutes) {
        status = 'LATE';
      }
    }

    const attendance = await prisma.attendance.create({
      data: {
        userId,
        tenantId,
        checkIn: now,
        status,
      },
    });

    res.status(201).json({
      message: 'Entrada registrada con éxito.',
      attendance,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al registrar entrada.' });
  }
};

export const checkOut = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const tenantId = req.user!.tenantId;

    const { start: todayStart } = getBoliviaTodayRange();

    // Buscar fichaje activo sin checkOut
    const activeAttendance = await prisma.attendance.findFirst({
      where: {
        userId,
        tenantId,
        checkIn: { gte: todayStart },
        checkOut: null,
      },
    });

    if (!activeAttendance) {
      res.status(400).json({ error: 'No has registrado tu entrada el día de hoy.' });
      return;
    }

    const attendance = await prisma.attendance.update({
      where: { id: activeAttendance.id },
      data: {
        checkOut: new Date(),
      },
    });

    res.json({
      message: 'Salida registrada con éxito.',
      attendance,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al registrar salida.' });
  }
};

export const getCurrentStatus = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const tenantId = req.user!.tenantId;

    const now = new Date();
    // Cierra sola cualquier entrada fichada de un turno ya terminado antes de
    // reportar el estado actual, para que el botón de fichar no quede
    // mostrando "Fichar Salida" de un turno que ya pasó.
    await autoCloseExpiredAttendance(userId, tenantId, now);

    const { start: todayStart } = getBoliviaTodayRange(now);

    const activeAttendance = await prisma.attendance.findFirst({
      where: {
        userId,
        tenantId,
        checkIn: { gte: todayStart },
        checkOut: null,
      },
    });

    const shift = await evaluateShift(userId, tenantId, req.user!.role);

    res.json({
      hasCheckedIn: !!activeAttendance,
      attendance: activeAttendance,
      canOperate: shift.ok,
      shiftReason: shift.ok ? null : shift.reason,
      shiftMessage: shift.ok ? null : shift.message,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al obtener estado de asistencia.' });
  }
};

export const getAttendanceHistory = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;
    const { startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate as string) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = endDate ? new Date(endDate as string) : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59, 999);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      res.status(400).json({ error: 'Fechas de filtrado inválidas.' });
      return;
    }

    const whereClause: any = {
      tenantId,
      checkIn: { gte: start, lte: end },
    };

    if (!['ADMIN', 'SUPER_ADMIN'].includes(req.user!.role)) {
      whereClause.userId = req.user!.id;
    }

    const history = await prisma.attendance.findMany({
      where: whereClause,
      include: {
        user: {
          select: {
            name: true,
            email: true,
            role: true,
          },
        },
      },
      orderBy: {
        checkIn: 'desc',
      },
    });

    res.json(history);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al obtener historial de asistencia.' });
  }
};
