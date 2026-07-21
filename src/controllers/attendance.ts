import { Response } from 'express';
import prisma from '../services/prisma';
import { AuthenticatedRequest } from '../middlewares/auth';

export const checkIn = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const tenantId = req.user!.tenantId;

    // Buscar si ya hay un fichaje activo hoy sin checkOut
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

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

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      res.status(404).json({ error: 'Usuario no encontrado.' });
      return;
    }

    const now = new Date();
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // 1. Check for schedule exception
    const exception = await prisma.scheduleException.findFirst({
      where: {
        professionalId: userId,
        tenantId,
        date: {
          gte: todayStart,
          lte: todayEnd,
        },
      },
    });

    let scheduledStartTime: string | null = null;
    let isDayOff = false;

    if (exception) {
      if (exception.isAvailable) {
        scheduledStartTime = exception.startTime;
      } else {
        isDayOff = true;
      }
    } else {
      // 2. No exception, use regular working hours
      const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const dayName = daysOfWeek[now.getDay()];
      const workingHours = user.workingHours as any;
      const todaySchedule = workingHours?.[dayName];

      if (todaySchedule && todaySchedule.start) {
        scheduledStartTime = todaySchedule.start;
      } else {
        isDayOff = true;
      }
    }

    if (isDayOff) {
      res.status(400).json({ error: 'No tienes turno programado para hoy (Día libre).' });
      return;
    }

    let status = 'PRESENT';
    if (scheduledStartTime) {
      const [schedHour, schedMinute] = scheduledStartTime.split(':').map(Number);
      const actualMinutes = now.getHours() * 60 + now.getMinutes();
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

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

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

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const activeAttendance = await prisma.attendance.findFirst({
      where: {
        userId,
        tenantId,
        checkIn: { gte: todayStart },
        checkOut: null,
      },
    });

    res.json({
      hasCheckedIn: !!activeAttendance,
      attendance: activeAttendance,
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
