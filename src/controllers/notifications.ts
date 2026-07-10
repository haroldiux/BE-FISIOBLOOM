import { Response } from 'express';
import prisma from '../services/prisma';
import { AuthenticatedRequest } from '../middlewares/auth';

export interface SystemNotification {
  id: string;
  type: 'low_stock' | 'expiring_package' | 'overdue_retouch' | 'upcoming_retouch' | 'inactive_package';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  entityId?: string;
  entityName?: string;
  createdAt: string;
  patientId?: string;
}

export const getNotifications = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;
    const now = new Date();
    const in15Days = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
    const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const [
      lowStockProducts,
      expiringSoonPackages,
      overdueRetouches,
      upcomingRetouches,
      allActivePackages,
    ] = await Promise.all([
      // Products with stock <= 5 (low stock threshold)
      prisma.product.findMany({
        where: {
          tenantId,
          isActive: true,
          stock: { lte: 5 },
        },
        select: { id: true, name: true, stock: true, unit: true },
        orderBy: { stock: 'asc' },
        take: 20,
      }),

      // Treatment packages expiring in the next 15 days
      prisma.treatmentPackage.findMany({
        where: {
          tenantId,
          status: 'ACTIVE',
          expiresAt: { gte: now, lte: in15Days },
        },
        include: {
          patient: { select: { id: true, fullName: true } },
        },
        orderBy: { expiresAt: 'asc' },
        take: 20,
      }),

      // Retouches that are PENDING and already past their scheduled date
      prisma.retouchSchedule.findMany({
        where: {
          tenantId,
          status: 'PENDING',
          scheduledDate: { lt: now },
        },
        include: {
          patient: { select: { id: true, fullName: true } },
          service: { select: { name: true } },
        },
        orderBy: { scheduledDate: 'asc' },
        take: 20,
      }),

      // Retouches PENDING and upcoming in the next 3 days
      prisma.retouchSchedule.findMany({
        where: {
          tenantId,
          status: 'PENDING',
          scheduledDate: { gte: now, lte: in3Days },
        },
        include: {
          patient: { select: { id: true, fullName: true } },
          service: { select: { name: true } },
        },
        orderBy: { scheduledDate: 'asc' },
        take: 20,
      }),

      // Fetch active packages with lines and appointments for Inactivity check
      prisma.treatmentPackage.findMany({
        where: {
          tenantId,
          status: 'ACTIVE',
          patient: { isActive: true },
        },
        include: {
          patient: {
            select: {
              id: true,
              fullName: true,
              appointments: {
                where: { tenantId },
                select: { dateTime: true, status: true },
              },
            },
          },
          lines: true,
        },
      }),
    ]);

    const notifications: SystemNotification[] = [];

    // ── Low Stock alerts ───────────────────────────────────────────────────────
    for (const product of lowStockProducts) {
      notifications.push({
        id: `low_stock_${product.id}`,
        type: 'low_stock',
        severity: product.stock === 0 ? 'critical' : 'warning',
        title: product.stock === 0 ? 'Sin Stock' : 'Stock Bajo',
        message: product.stock === 0
          ? `${product.name} está agotado. Realiza un pedido inmediato.`
          : `${product.name} tiene solo ${product.stock} ${product.unit}${product.stock !== 1 ? 's' : ''} disponibles.`,
        entityId: product.id,
        entityName: product.name,
        createdAt: now.toISOString(),
      });
    }

    // ── Expiring Packages alerts ───────────────────────────────────────────────
    for (const pkg of expiringSoonPackages) {
      const daysLeft = Math.ceil((new Date(pkg.expiresAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      notifications.push({
        id: `expiring_package_${pkg.id}`,
        type: 'expiring_package',
        severity: daysLeft <= 2 ? 'critical' : 'warning',
        title: 'Bono por Vencer',
        message: `El bono de ${pkg.patient.fullName} (${pkg.packageName}) vence en ${daysLeft} día${daysLeft !== 1 ? 's' : ''}. Contactar para agendar sesión.`,
        entityId: pkg.id,
        entityName: pkg.patient.fullName,
        createdAt: now.toISOString(),
        patientId: pkg.patient.id,
      });
    }

    // ── Overdue Retouches alerts ───────────────────────────────────────────────
    for (const retouch of overdueRetouches) {
      const daysOverdue = Math.ceil((now.getTime() - new Date(retouch.scheduledDate).getTime()) / (1000 * 60 * 60 * 24));
      notifications.push({
        id: `overdue_retouch_${retouch.id}`,
        type: 'overdue_retouch',
        severity: 'critical',
        title: 'Retoque Vencido',
        message: `${retouch.patient.fullName} tiene un retoque de ${retouch.service.name} vencido hace ${daysOverdue} día${daysOverdue !== 1 ? 's' : ''}. Contactar urgente.`,
        entityId: retouch.id,
        entityName: retouch.patient.fullName,
        createdAt: now.toISOString(),
        patientId: retouch.patient.id,
      });
    }

    // ── Upcoming Retouches alerts ──────────────────────────────────────────────
    for (const retouch of upcomingRetouches) {
      const daysLeft = Math.ceil((new Date(retouch.scheduledDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      notifications.push({
        id: `upcoming_retouch_${retouch.id}`,
        type: 'upcoming_retouch',
        severity: 'info',
        title: 'Retoque Próximo',
        message: `${retouch.patient.fullName} tiene retoque de ${retouch.service.name} en ${daysLeft} día${daysLeft !== 1 ? 's' : ''}.`,
        entityId: retouch.id,
        entityName: retouch.patient.fullName,
        createdAt: now.toISOString(),
        patientId: retouch.patient.id,
      });
    }

    // ── Inactive Patients alerts ───────────────────────────────────────────────
    const thirtyDaysAgoLimit = now.getTime() - 30 * 24 * 60 * 60 * 1000;
    for (const pkg of allActivePackages) {
      const hasSessionsRemaining = pkg.lines.some(line => line.usedSessions < line.totalSessions);
      if (!hasSessionsRemaining) continue;

      const hasFutureAppointment = pkg.patient.appointments.some(appt => {
        return new Date(appt.dateTime).getTime() >= now.getTime() &&
          appt.status !== 'CANCELADA_SIN_CARGO' &&
          appt.status !== 'CANCELADA_CON_CARGO';
      });

      if (hasFutureAppointment) continue;

      const apptTimes = pkg.patient.appointments.map(appt => new Date(appt.dateTime).getTime());
      const lastActivityTime = apptTimes.length > 0
        ? Math.max(new Date(pkg.purchasedAt).getTime(), ...apptTimes)
        : new Date(pkg.purchasedAt).getTime();

      if (lastActivityTime < thirtyDaysAgoLimit) {
        notifications.push({
          id: `inactive_package_${pkg.id}`,
          type: 'inactive_package',
          severity: 'warning',
          title: 'Paciente Inactivo',
          message: `${pkg.patient.fullName} tiene sesiones pendientes en su paquete (${pkg.packageName}) pero no registra citas en los últimos 30 días.`,
          entityId: pkg.id,
          entityName: pkg.patient.fullName,
          createdAt: now.toISOString(),
          patientId: pkg.patient.id,
        });
      }
    }

    // Sort: critical first, then warning, then info
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    notifications.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    res.json({ notifications, total: notifications.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error fetching notifications.' });
  }
};
