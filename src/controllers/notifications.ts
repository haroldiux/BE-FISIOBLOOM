import { Response } from 'express';
import prisma from '../services/prisma';
import { AuthenticatedRequest } from '../middlewares/auth';

export interface SystemNotification {
  id: string;
  type: 'low_stock' | 'expiring_package' | 'overdue_retouch' | 'upcoming_retouch';
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
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const [
      lowStockProducts,
      expiringSoonPackages,
      overdueRetouches,
      upcomingRetouches,
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

      // Treatment packages expiring in the next 7 days
      prisma.treatmentPackage.findMany({
        where: {
          tenantId,
          status: 'ACTIVE',
          expiresAt: { gte: now, lte: in7Days },
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

    // Sort: critical first, then warning, then info
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    notifications.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    res.json({ notifications, total: notifications.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error fetching notifications.' });
  }
};
