import { Response } from 'express';
import prisma from '../services/prisma';
import { AuthenticatedRequest } from '../middlewares/auth';




export const getDashboard = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }
    const tenantId = req.user.tenantId;
    const now = new Date();

    // Today's date range (midnight to midnight local time via UTC offsets)
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    // Current week (Monday to Sunday)
    const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon...
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() + diffToMonday);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    // 7 days from now (for expiring packages)
    const in7Days = new Date(now);
    in7Days.setDate(now.getDate() + 7);

    // --- Run parallel queries ---
    const [
      todayAppointmentsCount,
      todayInvoices,
      activePatients,
      expiringSoonPackages,
      weeklyInvoices,
      todayAppointmentsList,
    ] = await Promise.all([
      // Count today's appointments
      prisma.appointment.count({
        where: {
          tenantId,
          dateTime: { gte: todayStart, lte: todayEnd },
        },
      }),

      // Sum today's revenue
      prisma.invoice.findMany({
        where: {
          tenantId,
          paidAt: { gte: todayStart, lte: todayEnd },
          status: 'PAGADO',
        },
        select: { total: true },
      }),

      // Count active patients
      prisma.patient.count({
        where: {
          tenantId,
          isActive: true,
        },
      }),

      // Packages expiring in next 7 days
      prisma.treatmentPackage.count({
        where: {
          tenantId,
          status: 'ACTIVE',
          expiresAt: { gte: now, lte: in7Days },
        },
      }),

      // Weekly invoices with paidAt date
      prisma.invoice.findMany({
        where: {
          tenantId,
          paidAt: { gte: weekStart, lte: weekEnd },
          status: 'PAGADO',
        },
        select: { total: true, paidAt: true },
      }),

      // Today's appointments with patient, professional and service data
      prisma.appointment.findMany({
        where: {
          tenantId,
          dateTime: { gte: todayStart, lte: todayEnd },
        },
        include: {
          patient: { select: { fullName: true } },
          professional: { select: { name: true } },
          service: { select: { name: true } },
          sessionDetail: { select: { packageLineId: true } },
        },
        orderBy: { dateTime: 'asc' },
      }),
    ]);

    // --- Compute todayRevenue ---
    const todayRevenue = todayInvoices.reduce((sum, inv) => sum + inv.total, 0);

    // --- Compute weeklyRevenue (Mon=0 ... Sun=6 in array index) ---
    const revenueByDayIndex: Record<number, number> = {};
    for (let i = 0; i < 7; i++) revenueByDayIndex[i] = 0;

    for (const inv of weeklyInvoices) {
      const d = new Date(inv.paidAt);
      // Convert JS day (0=Sun) to Mon-based index (0=Mon ... 6=Sun)
      const jsDay = d.getDay();
      const monIndex = jsDay === 0 ? 6 : jsDay - 1;
      revenueByDayIndex[monIndex] = (revenueByDayIndex[monIndex] || 0) + inv.total;
    }

    const weeklyRevenue = [
      { day: 'Lun', ingresos: revenueByDayIndex[0] },
      { day: 'Mar', ingresos: revenueByDayIndex[1] },
      { day: 'Mié', ingresos: revenueByDayIndex[2] },
      { day: 'Jue', ingresos: revenueByDayIndex[3] },
      { day: 'Vie', ingresos: revenueByDayIndex[4] },
      { day: 'Sáb', ingresos: revenueByDayIndex[5] },
      { day: 'Dom', ingresos: revenueByDayIndex[6] },
    ];

    // --- Format today's appointments list ---
    const todayAppointmentsListFormatted = todayAppointmentsList.map((appt) => {
      const dt = new Date(appt.dateTime);
      const hours = String(dt.getHours()).padStart(2, '0');
      const minutes = String(dt.getMinutes()).padStart(2, '0');
      return {
        id: appt.id,
        time: `${hours}:${minutes}`,
        patient: appt.patient.fullName,
        treatment: appt.service?.name || 'Consulta General',
        professional: appt.professional.name,
        status: appt.status,
        duration: appt.duration,
      };
    });

    res.json({
      todayAppointments: todayAppointmentsCount,
      todayRevenue: Math.round(todayRevenue * 100) / 100,
      activePatients,
      packagesExpiringSoon: expiringSoonPackages,
      weeklyRevenue,
      todayAppointmentsList: todayAppointmentsListFormatted,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error fetching dashboard data.' });
  }
};
