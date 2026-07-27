import { Router } from 'express';
import {
  openCash,
  closeCash,
  getCurrentStatus,
  createExpense,
  createMovement,
  getCommissions,
  calculatePayroll,
  recalculatePayroll,
  payPayroll,
  getPayrolls,
  updateStaffTarget,
} from '../controllers/finance';
import { requireAuth, requireRole } from '../middlewares/auth';
import { requireActiveShift } from '../middlewares/shiftGate';
import { Role } from '@prisma/client';

const router = Router();

// Estado actual de caja (ADMIN, RECEPTIONIST, CLINICAL STAFF)
router.get('/cash/status', requireAuth, getCurrentStatus);

// Apertura de caja (ADMIN o RECEPTIONIST que abre la sucursal)
router.post('/cash/open', requireAuth, requireRole([Role.ADMIN, Role.RECEPTIONIST]), requireActiveShift, openCash);

// Cierre de caja (ADMIN o RECEPTIONIST que la abrió, para conteo final y conciliación)
router.post('/cash/close', requireAuth, requireRole([Role.ADMIN, Role.RECEPTIONIST]), requireActiveShift, closeCash);

// Registro de egresos / gastos menores (ADMIN, RECEPTIONIST)
router.post('/expenses', requireAuth, requireRole([Role.ADMIN, Role.RECEPTIONIST]), requireActiveShift, createExpense);

// Registro manual de ingresos/ajustes de caja (ADMIN)
router.post('/cash/movements', requireAuth, requireRole([Role.ADMIN]), createMovement);

// --- Fase 4: Gestión de Personal, Comisiones y Nóminas ---

// Obtener comisiones (ADMIN/SÚPER ADMIN ven todo el staff; PHYSIO/AESTHETICIAN/RECEPTIONIST solo su propio desempeño)
router.get('/staff/commissions', requireAuth, requireRole([Role.ADMIN, Role.SUPER_ADMIN, Role.PHYSIO, Role.AESTHETICIAN, Role.RECEPTIONIST]), getCommissions);

// Generar/Calcular nóminas (ADMIN paga a su propio personal; SÚPER ADMIN paga a los administradores)
router.post('/staff/payroll/calculate', requireAuth, requireRole([Role.ADMIN, Role.SUPER_ADMIN]), calculatePayroll);

// Obtener historial de nóminas (ADMIN, SÚPER ADMIN)
router.get('/staff/payroll', requireAuth, requireRole([Role.ADMIN, Role.SUPER_ADMIN]), getPayrolls);

// Recalcular una nómina pendiente (sueldo/comisiones actualizados) (ADMIN, SÚPER ADMIN)
router.put('/staff/payroll/:id/recalculate', requireAuth, requireRole([Role.ADMIN, Role.SUPER_ADMIN]), recalculatePayroll);

// Marcar nómina como pagada (ADMIN, SÚPER ADMIN)
router.post('/staff/payroll/:id/pay', requireAuth, requireRole([Role.ADMIN, Role.SUPER_ADMIN]), payPayroll);

// Actualizar metas y sueldos de staff (ADMIN)
router.put('/staff/:id/target', requireAuth, requireRole([Role.ADMIN]), updateStaffTarget);

export default router;
