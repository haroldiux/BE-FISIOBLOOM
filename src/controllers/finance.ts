import { Response } from 'express';
import { CashStatus, MovementType, Role } from '@prisma/client';
import prisma from '../services/prisma';
import { AuthenticatedRequest } from '../middlewares/auth';

export const openCash = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { initialBalance, notes } = req.body;
    const userId = req.user?.id;
    const tenantId = req.user?.tenantId;

    if (initialBalance === undefined || initialBalance < 0) {
      res.status(400).json({ error: 'Monto inicial de caja requerido y debe ser positivo.' });
      return;
    }

    if (!userId || !tenantId) {
      res.status(401).json({ error: 'Usuario no autenticado o Tenant no válido.' });
      return;
    }

    // Validar si ya hay una caja abierta para este tenant
    const activeRegister = await prisma.cashRegister.findFirst({
      where: { status: CashStatus.OPEN, tenantId },
    });

    if (activeRegister) {
      res.status(400).json({ error: 'Ya existe una sesión de caja abierta en el sistema para esta clínica.' });
      return;
    }

    const newRegister = await prisma.cashRegister.create({
      data: {
        openedById: userId,
        initialBalance: Number(initialBalance),
        expectedBalance: Number(initialBalance),
        status: CashStatus.OPEN,
        notes: notes || null,
        tenantId,
      },
    });

    res.status(201).json({
      message: 'Caja abierta exitosamente.',
      register: newRegister,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al abrir la caja.' });
  }
};

export const closeCash = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { actualBalance, notes } = req.body;
    const userId = req.user?.id;
    const tenantId = req.user?.tenantId;

    if (actualBalance === undefined || actualBalance < 0) {
      res.status(400).json({ error: 'Monto de conteo físico requerido y debe ser positivo.' });
      return;
    }

    if (!userId || !tenantId) {
      res.status(401).json({ error: 'Usuario no autenticado o Tenant no válido.' });
      return;
    }

    // Buscar caja abierta de este tenant
    const activeRegister = await prisma.cashRegister.findFirst({
      where: { status: CashStatus.OPEN, tenantId },
      include: { movements: true },
    });

    if (!activeRegister) {
      res.status(404).json({ error: 'No se encontró ninguna caja abierta para cerrar.' });
      return;
    }

    // Recalcular saldo esperado: inicial + ingresos - egresos + ajustes
    let calculatedBalance = activeRegister.initialBalance;
    activeRegister.movements.forEach((movement) => {
      if (movement.type === MovementType.INCOME) {
        calculatedBalance += movement.amount;
      } else if (movement.type === MovementType.EXPENSE) {
        calculatedBalance -= movement.amount;
      } else if (movement.type === MovementType.ADJUSTMENT) {
        calculatedBalance += movement.amount; // Ajustes pueden ser positivos o negativos
      }
    });

    const discrepancy = Number(actualBalance) - calculatedBalance;

    const closedRegister = await prisma.cashRegister.update({
      where: { id: activeRegister.id, tenantId },
      data: {
        status: CashStatus.CLOSED,
        closedById: userId,
        closingDate: new Date(),
        expectedBalance: calculatedBalance,
        actualBalance: Number(actualBalance),
        discrepancy,
        notes: notes !== undefined ? notes : activeRegister.notes,
      },
    });

    res.json({
      message: 'Caja cerrada exitosamente.',
      register: closedRegister,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al cerrar la caja.' });
  }
};

export const getCurrentStatus = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;
    
    const activeRegister = await prisma.cashRegister.findFirst({
      where: { status: CashStatus.OPEN, tenantId },
      include: {
        movements: {
          include: {
            user: {
              select: { name: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        },
        openedBy: {
          select: { name: true }
        }
      },
    });

    res.json(activeRegister);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al obtener estado de caja.' });
  }
};

export const createExpense = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { amount, description } = req.body;
    const userId = req.user?.id;
    const tenantId = req.user?.tenantId;

    if (!amount || !description) {
      res.status(400).json({ error: 'Monto y descripción requeridos para registrar el egreso.' });
      return;
    }

    if (!userId || !tenantId) {
      res.status(401).json({ error: 'Usuario no autenticado o Tenant no válido.' });
      return;
    }

    // Buscar caja abierta de este tenant
    const activeRegister = await prisma.cashRegister.findFirst({
      where: { status: CashStatus.OPEN, tenantId },
    });

    if (!activeRegister) {
      res.status(400).json({ error: 'Debe abrir una sesión de caja antes de registrar egresos.' });
      return;
    }

    // Transacción para registrar el egreso y actualizar la caja
    const movement = await prisma.$transaction(async (tx) => {
      const mv = await tx.cashMovement.create({
        data: {
          cashRegisterId: activeRegister.id,
          userId,
          type: MovementType.EXPENSE,
          amount: Number(amount),
          description,
          tenantId,
        },
      });

      // Restar egreso del saldo esperado de caja
      await tx.cashRegister.update({
        where: { id: activeRegister.id, tenantId },
        data: {
          expectedBalance: { decrement: Number(amount) },
        },
      });

      return mv;
    });

    res.status(201).json({
      message: 'Egreso registrado exitosamente.',
      movement,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al registrar egreso.' });
  }
};

export const createMovement = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { amount, description, type } = req.body;
    const userId = req.user?.id;
    const tenantId = req.user?.tenantId;

    if (!amount || !description || !type) {
      res.status(400).json({ error: 'Monto, descripción y tipo de movimiento requeridos.' });
      return;
    }

    if (!userId || !tenantId) {
      res.status(401).json({ error: 'Usuario no autenticado o Tenant no válido.' });
      return;
    }

    const activeRegister = await prisma.cashRegister.findFirst({
      where: { status: CashStatus.OPEN, tenantId },
    });

    if (!activeRegister) {
      res.status(400).json({ error: 'Debe abrir una sesión de caja antes de registrar movimientos.' });
      return;
    }

    const movement = await prisma.$transaction(async (tx) => {
      const mv = await tx.cashMovement.create({
        data: {
          cashRegisterId: activeRegister.id,
          userId,
          type: type as MovementType,
          amount: Number(amount),
          description,
          tenantId,
        },
      });

      // Modificar el saldo esperado según tipo
      let value = Number(amount);
      if (type === MovementType.EXPENSE) {
        value = -value;
      }

      await tx.cashRegister.update({
        where: { id: activeRegister.id, tenantId },
        data: {
          expectedBalance: { increment: value },
        },
      });

      return mv;
    });

    res.status(201).json({
      message: 'Movimiento de caja registrado exitosamente.',
      movement,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al registrar movimiento.' });
  }
};

export const getCommissions = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { startDate, endDate } = req.query;
    const tenantId = req.user!.tenantId;
    
    // Configurar fechas de filtrado (por defecto, mes actual)
    const now = new Date();
    const start = startDate ? new Date(startDate as string) : new Date(now.getFullYear(), now.getMonth(), 1);
    const end = endDate ? new Date(endDate as string) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      res.status(400).json({ error: 'Fechas inválidas.' });
      return;
    }

    // Obtener los profesionales con roles relevantes del tenant. Un ADMIN o
    // SÚPER ADMIN ve el desempeño de todo el staff (incluyendo Recepción);
    // un profesional o recepcionista solo puede ver su propio desempeño, no
    // el de sus compañeros ni el de administradores.
    const isPrivileged = req.user!.role === Role.ADMIN || req.user!.role === Role.SUPER_ADMIN;
    const relevantRoles = [Role.ADMIN, Role.PHYSIO, Role.AESTHETICIAN, Role.RECEPTIONIST];
    const staffMembers = await prisma.user.findMany({
      where: {
        role: { in: relevantRoles },
        isActive: true,
        tenantId,
        ...(isPrivileged ? {} : { id: req.user!.id }),
      },
      select: {
        id: true,
        name: true,
        role: true,
        email: true
      }
    });

    const performances: any[] = [];
    const monthFormatter = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });
    const monthLabel = monthFormatter.format(now);

    // Facturas pagadas del período, una sola vez para todo el staff. Cada
    // ítem se le atribuye a la persona correcta según su naturaleza: los
    // tratamientos se acreditan a quien atendió la cita
    // (appointment.professionalId) y los productos a quien cobró en el
    // Terminal POS (soldById) — un fisio/esteticista no vende productos
    // sueltos, y recepción no realiza tratamientos, así que nunca se deben
    // mezclar ni atribuirle a alguien una factura completa solo porque él o
    // ella fue quien pasó la tarjeta.
    const periodInvoices = await prisma.invoice.findMany({
      where: { status: 'PAGADO', paidAt: { gte: start, lte: end }, tenantId },
      include: {
        appointment: { select: { professionalId: true } },
        items: { include: { product: true } },
      },
    });

    for (const member of staffMembers) {
      // Buscar o inicializar su StaffProfile
      let profile = await prisma.staffProfile.findFirst({
        where: { userId: member.id, tenantId }
      });

      if (!profile) {
        // Inicializar de manera segura con valores por defecto
        profile = await prisma.staffProfile.create({
          data: {
            userId: member.id,
            baseSalary: 1200,
            commissionRate: 0.10,
            salesTarget: 5000,
            tenantId,
          }
        });
      }

      let servicesSales = 0;
      let productsSales = 0;
      let servicesCount = 0;
      let productsCount = 0;

      for (const inv of periodInvoices) {
        const professionalId = inv.appointment?.professionalId;
        for (const item of inv.items) {
          if (item.product?.category === 'PRODUCTO') {
            if (inv.soldById === member.id) {
              productsSales += item.total;
              productsCount += item.quantity;
            }
          } else if (professionalId === member.id) {
            servicesSales += item.total;
            servicesCount += item.quantity;
          }
        }
      }

      const actualSales = servicesSales + productsSales;

      // Buscar comisiones acumuladas del tenant
      const commissionsAgg = await prisma.commission.aggregate({
        where: {
          staffId: member.id,
          createdAt: { gte: start, lte: end },
          tenantId,
        },
        _sum: { amount: true }
      });
      const commissionEarned = commissionsAgg._sum.amount || 0;

      performances.push({
        professionalId: member.id,
        name: member.name,
        role: member.role,
        month: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1),
        salesTarget: profile.salesTarget || 0,
        actualSales: Math.round(actualSales),
        servicesSales: Math.round(servicesSales),
        productsSales: Math.round(productsSales),
        commissionRate: Math.round((profile.commissionRate || 0) * 100),
        commissionEarned: Math.round(commissionEarned),
        servicesCount,
        productsCount
      });
    }

    res.json(performances);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al obtener desempeño de staff.' });
  }
};

export const calculatePayroll = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { staffId, startDate, endDate } = req.body;
    const tenantId = req.user!.tenantId;

    const periodStart = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const periodEnd = endDate ? new Date(endDate) : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59, 999);

    if (isNaN(periodStart.getTime()) || isNaN(periodEnd.getTime())) {
      res.status(400).json({ error: 'Fechas de período inválidas.' });
      return;
    }

    // Cada sucursal es independiente: un Admin de sucursal solo paga a SU
    // propio personal operativo (fisios, esteticistas, recepción) — nunca a
    // otros administradores ni a personal de otras sucursales. A los
    // administradores los paga el Súper Admin, que sí ve todo el tenant.
    const staffWhere: any = staffId ? { id: staffId } : {};
    if (req.user!.role !== Role.SUPER_ADMIN) {
      staffWhere.branchId = req.user!.branchId;
      staffWhere.role = { notIn: [Role.ADMIN, Role.SUPER_ADMIN] };
    }

    const staffProfiles = await prisma.staffProfile.findMany({
      where: { tenantId, user: staffWhere },
      include: {
        user: true,
      },
    });

    if (staffProfiles.length === 0) {
      res.status(404).json({ error: 'No se encontraron perfiles de personal para calcular nómina.' });
      return;
    }

    const payrollEntries: any[] = [];
    const skipped: { staffName: string; existingPeriod: string }[] = [];

    await prisma.$transaction(async (tx) => {
      for (const profile of staffProfiles) {
        // No se puede pagar dos veces al mismo profesional por un período que
        // ya se solapa con uno existente (evita duplicar sueldos/comisiones).
        const overlapping = await tx.payrollEntry.findFirst({
          where: {
            staffId: profile.userId,
            tenantId,
            periodStart: { lte: periodEnd },
            periodEnd: { gte: periodStart },
          },
        });
        if (overlapping) {
          skipped.push({
            staffName: profile.user.name,
            existingPeriod: `${overlapping.periodStart.toLocaleDateString('es-ES')} al ${overlapping.periodEnd.toLocaleDateString('es-ES')}`,
          });
          continue;
        }

        const pendingCommissions = await tx.commission.findMany({
          where: {
            staffId: profile.userId,
            status: 'PENDING',
            tenantId,
            createdAt: {
              gte: periodStart,
              lte: periodEnd,
            },
          },
        });

        const commissionsAmount = pendingCommissions.reduce((sum, c) => sum + c.amount, 0);
        const totalPaid = profile.baseSalary + commissionsAmount;

        const payrollEntry = await tx.payrollEntry.create({
          data: {
            staffId: profile.userId,
            baseSalary: profile.baseSalary,
            commissionsAmount,
            totalPaid,
            status: 'PENDING',
            periodStart,
            periodEnd,
            tenantId,
          },
        });

        if (pendingCommissions.length > 0) {
          await tx.commission.updateMany({
            where: {
              id: { in: pendingCommissions.map((c) => c.id) },
              tenantId,
            },
            data: {
              status: 'PAID',
              payrollId: payrollEntry.id,
            },
          });
        }

        payrollEntries.push({
          ...payrollEntry,
          commissionsCount: pendingCommissions.length,
          staffName: profile.user.name,
        });
      }
    });

    if (payrollEntries.length === 0 && skipped.length > 0) {
      res.status(409).json({
        error: `Ya existe una nómina para ese período para: ${skipped.map((s) => `${s.staffName} (${s.existingPeriod})`).join(', ')}.`,
      });
      return;
    }

    res.status(201).json({
      message: 'Nóminas calculadas exitosamente.',
      payrolls: payrollEntries,
      skipped,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al calcular nómina.' });
  }
};

// Una nómina PENDIENTE todavía no se pagó, así que si el sueldo base del
// profesional cambió (o ganó comisiones nuevas) después de generarla, se
// puede volver a calcular para reflejar los valores actuales. Una nómina ya
// PAGADA nunca se toca — es un registro histórico de lo que realmente se
// pagó, no puede cambiar retroactivamente.
export const recalculatePayroll = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    const existing = await prisma.payrollEntry.findFirst({
      where: { id: String(id), tenantId },
      include: { staff: { include: { staffProfile: true } } },
    });

    if (!existing) {
      res.status(404).json({ error: 'Entrada de nómina no encontrada en esta clínica.' });
      return;
    }

    if (req.user!.role !== Role.SUPER_ADMIN) {
      const isOtherBranch = existing.staff.branchId !== req.user!.branchId;
      const isAdminOrAbove = existing.staff.role === Role.ADMIN || existing.staff.role === Role.SUPER_ADMIN;
      if (isOtherBranch || isAdminOrAbove) {
        res.status(403).json({ error: 'No tenés permiso para modificar esta nómina.' });
        return;
      }
    }

    if (existing.status === 'PAID') {
      res.status(400).json({ error: 'No se puede modificar una nómina que ya está pagada.' });
      return;
    }

    if (!existing.staff.staffProfile) {
      res.status(404).json({ error: 'El profesional ya no tiene un perfil de personal configurado.' });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Comisiones nuevas del mismo período que todavía no estén ligadas a
      // esta nómina (pueden haber surgido ventas nuevas desde que se generó).
      const newCommissions = await tx.commission.findMany({
        where: {
          staffId: existing.staffId,
          status: 'PENDING',
          tenantId,
          createdAt: { gte: existing.periodStart, lte: existing.periodEnd },
        },
      });

      const existingCommissionsTotal = await tx.commission.aggregate({
        where: { payrollId: existing.id, tenantId },
        _sum: { amount: true },
      });

      const newCommissionsAmount = newCommissions.reduce((sum, c) => sum + c.amount, 0);
      const commissionsAmount = (existingCommissionsTotal._sum.amount ?? 0) + newCommissionsAmount;
      const baseSalary = existing.staff.staffProfile!.baseSalary;
      const totalPaid = baseSalary + commissionsAmount;

      if (newCommissions.length > 0) {
        await tx.commission.updateMany({
          where: { id: { in: newCommissions.map((c) => c.id) }, tenantId },
          data: { status: 'PAID', payrollId: existing.id },
        });
      }

      return tx.payrollEntry.update({
        where: { id: existing.id, tenantId },
        data: { baseSalary, commissionsAmount, totalPaid },
      });
    });

    res.json({ message: 'Nómina recalculada exitosamente.', payroll: updated });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al recalcular la nómina.' });
  }
};

export const payPayroll = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    const payrollEntry = await prisma.payrollEntry.findFirst({
      where: { id: String(id), tenantId },
      include: { staff: true },
    });

    if (!payrollEntry) {
      res.status(404).json({ error: 'Entrada de nómina no encontrada en esta clínica.' });
      return;
    }

    // Un Admin solo puede pagar nóminas de su propio personal operativo en su
    // sucursal — nunca de otro administrador ni de otra sucursal.
    if (req.user!.role !== Role.SUPER_ADMIN) {
      const isOtherBranch = payrollEntry.staff.branchId !== req.user!.branchId;
      const isAdminOrAbove = payrollEntry.staff.role === Role.ADMIN || payrollEntry.staff.role === Role.SUPER_ADMIN;
      if (isOtherBranch || isAdminOrAbove) {
        res.status(403).json({ error: 'No tenés permiso para pagar esta nómina.' });
        return;
      }
    }

    if (payrollEntry.status === 'PAID') {
      res.status(400).json({ error: 'La nómina ya está pagada.' });
      return;
    }

    const updatedPayroll = await prisma.$transaction(async (tx) => {
      const updated = await tx.payrollEntry.update({
        where: { id: payrollEntry.id, tenantId },
        data: {
          status: 'PAID',
          paidAt: new Date(),
        },
      });

      const activeRegister = await tx.cashRegister.findFirst({
        where: { status: 'OPEN', tenantId },
      });

      if (activeRegister) {
        await tx.cashMovement.create({
          data: {
            cashRegisterId: activeRegister.id,
            userId: req.user?.id || payrollEntry.staffId,
            type: 'EXPENSE',
            amount: payrollEntry.totalPaid,
            description: `Pago de Nómina — Período ${payrollEntry.periodStart.toLocaleDateString()} al ${payrollEntry.periodEnd.toLocaleDateString()} (${payrollEntry.staff.name})`,
            tenantId,
          },
        });

        await tx.cashRegister.update({
          where: { id: activeRegister.id, tenantId },
          data: {
            expectedBalance: { decrement: payrollEntry.totalPaid },
          },
        });
      }

      return updated;
    });

    res.json({
      message: 'Nómina pagada exitosamente.',
      payroll: updatedPayroll,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al registrar pago de nómina.' });
  }
};

export const getPayrolls = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;

    // Mismo criterio que al calcular: un Admin solo ve las nóminas de su
    // propio personal operativo en su sucursal, nunca las de otros
    // administradores ni de otras sucursales.
    const staffWhere: any = {};
    if (req.user!.role !== Role.SUPER_ADMIN) {
      staffWhere.branchId = req.user!.branchId;
      staffWhere.role = { notIn: [Role.ADMIN, Role.SUPER_ADMIN] };
    }

    const payrolls = await prisma.payrollEntry.findMany({
      where: { tenantId, staff: staffWhere },
      include: {
        staff: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    const mapped = payrolls.map(p => ({
      id: p.id,
      professionalId: p.staffId,
      name: p.staff.name,
      role: p.staff.role,
      period: `${p.periodStart.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })} al ${p.periodEnd.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })}`,
      baseSalary: p.baseSalary,
      commissions: p.commissionsAmount,
      bonuses: 0,
      deductions: 0,
      netPay: p.totalPaid,
      status: p.status === 'PAID' ? 'PAGADO' : 'PENDIENTE',
      paidAt: p.paidAt,
      createdAt: p.createdAt
    }));

    res.json(mapped);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al obtener historial de nóminas.' });
  }
};

export const updateStaffTarget = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id); // userId — explicit cast to string
    const { baseSalary, commissionRate, salesTarget } = req.body;
    const tenantId = req.user!.tenantId;

    if (baseSalary === undefined && commissionRate === undefined && salesTarget === undefined) {
      res.status(400).json({ error: 'Debe proporcionar al menos un valor para actualizar (baseSalary, commissionRate o salesTarget).' });
      return;
    }

    // Verificar que el usuario (profesional) existe y pertenece al mismo tenant
    const professional = await prisma.user.findFirst({
      where: { id, tenantId }
    });

    if (!professional) {
      res.status(404).json({ error: 'Profesional no encontrado en este tenant.' });
      return;
    }

    // Actualizar o Crear el perfil
    const updatedProfile = await prisma.staffProfile.upsert({
      where: { userId: id },
      update: {
        ...(baseSalary !== undefined && { baseSalary: Number(baseSalary) }),
        ...(commissionRate !== undefined && { commissionRate: Number(commissionRate) }),
        ...(salesTarget !== undefined && { salesTarget: Number(salesTarget) }),
      },
      create: {
        userId: id,
        baseSalary: baseSalary !== undefined ? Number(baseSalary) : 1200,
        commissionRate: commissionRate !== undefined ? Number(commissionRate) : 0.10,
        salesTarget: salesTarget !== undefined ? Number(salesTarget) : 5000,
        tenantId,
      }
    });

    res.json({
      message: 'Perfil de personal actualizado exitosamente.',
      profile: updatedProfile
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al actualizar metas del profesional.' });
  }
};
