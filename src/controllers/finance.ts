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

    // Obtener todos los profesionales con roles relevantes del tenant
    const staffMembers = await prisma.user.findMany({
      where: {
        role: { in: [Role.ADMIN, Role.PHYSIO, Role.AESTHETICIAN] },
        isActive: true,
        tenantId,
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

      // Buscar facturas pagadas correspondientes a citas del profesional en el rango de fechas para este tenant
      const invoices = await prisma.invoice.findMany({
        where: {
          status: 'PAGADO',
          paidAt: { gte: start, lte: end },
          tenantId,
          appointment: { professionalId: member.id }
        },
        include: {
          items: {
            include: { product: true }
          }
        }
      });

      let actualSales = 0;
      let servicesSales = 0;
      let productsSales = 0;
      let servicesCount = 0;
      let productsCount = 0;

      for (const inv of invoices) {
        actualSales += inv.total;
        for (const item of inv.items) {
          if (item.product) {
            if (item.product.category === 'TRATAMIENTO') {
              servicesSales += item.total;
              servicesCount += item.quantity;
            } else if (item.product.category === 'PRODUCTO') {
              productsSales += item.total;
              productsCount += item.quantity;
            } else {
              servicesSales += item.total;
              servicesCount += item.quantity;
            }
          } else {
            servicesSales += item.total;
            servicesCount += item.quantity;
          }
        }
      }

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

    const staffProfiles = await prisma.staffProfile.findMany({
      where: staffId 
        ? { userId: staffId, tenantId } 
        : { tenantId },
      include: {
        user: true,
      },
    });

    if (staffProfiles.length === 0) {
      res.status(404).json({ error: 'No se encontraron perfiles de personal para calcular nómina.' });
      return;
    }

    const payrollEntries: any[] = [];

    await prisma.$transaction(async (tx) => {
      for (const profile of staffProfiles) {
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

    res.status(201).json({
      message: 'Nóminas calculadas exitosamente.',
      payrolls: payrollEntries,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al calcular nómina.' });
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

    const payrolls = await prisma.payrollEntry.findMany({
      where: { tenantId },
      include: {
        staff: {
          select: {
            id: true,
            name: true,
            email: true,
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
      period: `${p.periodStart.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })} al ${p.periodEnd.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })}`,
      baseSalary: p.baseSalary,
      commissions: p.commissionsAmount,
      bonuses: 0,
      deductions: 0,
      netPay: p.totalPaid,
      status: p.status,
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
