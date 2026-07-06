import { Router } from 'express';
import {
  openCash,
  closeCash,
  getCurrentStatus,
  createExpense,
  createMovement,
  getCommissions,
  calculatePayroll,
  payPayroll,
  getPayrolls,
  updateStaffTarget,
} from '../controllers/finance';
import { requireAuth, requireRole } from '../middlewares/auth';
import { Role } from '@prisma/client';

const router = Router();

// Estado actual de caja (ADMIN, RECEPTIONIST, CLINICAL STAFF)
router.get('/cash/status', requireAuth, getCurrentStatus);

// Apertura de caja (ADMIN o RECEPTIONIST que abre la sucursal)
router.post('/cash/open', requireAuth, requireRole([Role.ADMIN, Role.RECEPTIONIST]), openCash);

// Cierre de caja (ADMIN para conteo final y conciliación)
router.post('/cash/close', requireAuth, requireRole([Role.ADMIN]), closeCash);

// Registro de egresos / gastos menores (ADMIN, RECEPTIONIST)
router.post('/expenses', requireAuth, requireRole([Role.ADMIN, Role.RECEPTIONIST]), createExpense);

// Registro manual de ingresos/ajustes de caja (ADMIN)
router.post('/cash/movements', requireAuth, requireRole([Role.ADMIN]), createMovement);

// --- Fase 4: Gestión de Personal, Comisiones y Nóminas ---

// Obtener comisiones (ADMIN)
router.get('/staff/commissions', requireAuth, requireRole([Role.ADMIN]), getCommissions);

// Generar/Calcular nóminas (ADMIN)
router.post('/staff/payroll/calculate', requireAuth, requireRole([Role.ADMIN]), calculatePayroll);

// Obtener historial de nóminas (ADMIN)
router.get('/staff/payroll', requireAuth, requireRole([Role.ADMIN]), getPayrolls);

// Marcar nómina como pagada (ADMIN)
router.post('/staff/payroll/:id/pay', requireAuth, requireRole([Role.ADMIN]), payPayroll);

// Actualizar metas y sueldos de staff (ADMIN)
router.put('/staff/:id/target', requireAuth, requireRole([Role.ADMIN]), updateStaffTarget);

export default router;
