import { Response } from 'express';
import prisma from '../services/prisma';
import { AuthenticatedRequest } from '../middlewares/auth';
import { Role } from '@prisma/client';
import { getBoliviaTodayRange, getBoliviaDayAndMinutes } from '../services/appointment.service';

const round = (num: number): number => Math.round(num * 100) / 100;

const escapeCSV = (val: any): string => {
  if (val === null || val === undefined) return '';
  let str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    str = str.replace(/"/g, '""');
    return `"${str}"`;
  }
  return str;
};

export const getFinancialReport = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;
    const now = new Date();
    const defaultStartDate = new Date();
    defaultStartDate.setDate(now.getDate() - 30);
    defaultStartDate.setHours(0, 0, 0, 0);

    const defaultEndDate = new Date();
    defaultEndDate.setHours(23, 59, 59, 999);

    const start = req.query.startDate ? new Date(req.query.startDate as string) : defaultStartDate;
    const end = req.query.endDate ? new Date(req.query.endDate as string) : defaultEndDate;

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      res.status(400).json({ error: 'Formato de fecha inválido. Use AAAA-MM-DD.' });
      return;
    }

    // Set boundary times if they were passed manually without hours
    if (req.query.endDate && !(req.query.endDate as string).includes('T')) {
      end.setHours(23, 59, 59, 999);
    }
    if (req.query.startDate && !(req.query.startDate as string).includes('T')) {
      start.setHours(0, 0, 0, 0);
    }

    const [invoices, expenses, payrolls] = await Promise.all([
      prisma.invoice.findMany({
        where: {
          status: 'PAGADO',
          tenantId,
          paidAt: {
            gte: start,
            lte: end,
          },
        },
        include: {
          items: {
            include: {
              product: true,
            },
          },
          branch: {
            select: {
              name: true,
            },
          },
        },
      }),
      prisma.cashMovement.findMany({
        where: {
          type: 'EXPENSE',
          tenantId,
          createdAt: {
            gte: start,
            lte: end,
          },
        },
      }),
      prisma.payrollEntry.findMany({
        where: {
          status: 'PAID',
          tenantId,
          paidAt: {
            gte: start,
            lte: end,
          },
        },
      }),
    ]);

    const ingresosTotales = invoices.reduce((sum, inv) => sum + inv.total, 0);

    // General expenses: cash movements of type EXPENSE excluding payroll-related entries
    const gastosGeneral = expenses
      .filter((exp) => !exp.description.includes('Pago de Nómina'))
      .reduce((sum, exp) => sum + exp.amount, 0);

    const nominasPagadas = payrolls.reduce((sum, p) => sum + p.totalPaid, 0);
    const egresosTotales = gastosGeneral + nominasPagadas;

    // Desglose de ingresos por método de pago
    const porMetodoPago = {
      EFECTIVO: 0,
      TARJETA: 0,
      TRANSFERENCIA: 0,
      BILLETERA_VIRTUAL: 0,
    };

    for (const inv of invoices) {
      if (inv.paymentMethod in porMetodoPago) {
        porMetodoPago[inv.paymentMethod as keyof typeof porMetodoPago] += inv.total;
      }
    }

    // Desglose de ingresos por categoría
    const porCategoria = {
      servicio: 0,
      producto: 0,
      otros: 0,
    };

    for (const inv of invoices) {
      for (const item of inv.items) {
        if (item.product) {
          if (item.product.category === 'TRATAMIENTO') {
            porCategoria.servicio += item.total;
          } else if (item.product.category === 'PRODUCTO') {
            porCategoria.producto += item.total;
          } else {
            porCategoria.otros += item.total;
          }
        } else {
          porCategoria.otros += item.total;
        }
      }
    }

    // Desglose de ingresos por sucursal
    const porSucursal: Record<string, number> = {};
    for (const inv of invoices) {
      const branchName = inv.branch?.name || 'Sede Principal';
      porSucursal[branchName] = round((porSucursal[branchName] || 0) + inv.total);
    }

    // Series de tiempo (últimos 30 días)
    const timeSeriesStart = new Date();
    timeSeriesStart.setDate(timeSeriesStart.getDate() - 29);
    timeSeriesStart.setHours(0, 0, 0, 0);

    const timeSeriesEnd = new Date();
    timeSeriesEnd.setHours(23, 59, 59, 999);

    const invoicesLast30Days = await prisma.invoice.findMany({
      where: {
        status: 'PAGADO',
        tenantId,
        paidAt: {
          gte: timeSeriesStart,
          lte: timeSeriesEnd,
        },
      },
    });

    const seriesTiempo: Record<string, number> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      seriesTiempo[dateStr] = 0;
    }

    for (const inv of invoicesLast30Days) {
      const dateStr = new Date(inv.paidAt).toISOString().split('T')[0];
      if (seriesTiempo[dateStr] !== undefined) {
        seriesTiempo[dateStr] += inv.total;
      }
    }

    const seriesTiempoArray = Object.keys(seriesTiempo)
      .map((fecha) => ({
        fecha,
        monto: round(seriesTiempo[fecha]),
      }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));

    res.json({
      resumen: {
        ingresos: round(ingresosTotales),
        egresos: round(egresosTotales),
        gastosGeneral: round(gastosGeneral),
        nominasPagadas: round(nominasPagadas),
        balance: round(ingresosTotales - egresosTotales),
      },
      desgloseIngresos: {
        porMetodoPago: {
          EFECTIVO: round(porMetodoPago.EFECTIVO),
          TARJETA: round(porMetodoPago.TARJETA),
          TRANSFERENCIA: round(porMetodoPago.TRANSFERENCIA),
          BILLETERA_VIRTUAL: round(porMetodoPago.BILLETERA_VIRTUAL),
        },
        porCategoria: {
          servicio: round(porCategoria.servicio),
          producto: round(porCategoria.producto),
          otros: round(porCategoria.otros),
        },
        porSucursal,
      },
      seriesTiempo: seriesTiempoArray,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al generar el reporte financiero.' });
  }
};

export const getStaffReport = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { startDate, endDate } = req.query;
    const tenantId = req.user!.tenantId;
    const dateFilter: any = {};
    if (startDate) {
      dateFilter.gte = new Date(startDate as string);
    }
    if (endDate) {
      dateFilter.lte = new Date(endDate as string);
    }
    const hasDateFilter = !!(startDate || endDate);

    // Filter params
    const appointmentsWhere: any = { status: 'COMPLETADA', tenantId };
    if (hasDateFilter) appointmentsWhere.dateTime = dateFilter;

    const salesWhere: any = { status: 'PAGADO', tenantId };
    if (hasDateFilter) salesWhere.paidAt = dateFilter;

    const commWherePending: any = { status: 'PENDING', tenantId };
    const commWherePaid: any = { status: 'PAID', tenantId };
    if (hasDateFilter) {
      commWherePending.createdAt = dateFilter;
      commWherePaid.createdAt = dateFilter;
    }

    const professionals = await prisma.user.findMany({
      where: {
        role: {
          in: ['PHYSIO', 'AESTHETICIAN', 'ADMIN'],
        },
        tenantId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
      },
    });

    const staffReports = await Promise.all(
      professionals.map(async (prof) => {
        const completedAppointments = await prisma.appointment.count({
          where: {
            ...appointmentsWhere,
            professionalId: prof.id,
          },
        });

        const salesAgg = await prisma.invoice.aggregate({
          where: {
            ...salesWhere,
            appointment: {
              professionalId: prof.id,
            },
          },
          _sum: {
            total: true,
          },
        });
        const ventasTotales = salesAgg._sum.total || 0;

        const pendingAgg = await prisma.commission.aggregate({
          where: {
            ...commWherePending,
            staffId: prof.id,
          },
          _sum: {
            amount: true,
          },
        });
        const comisionesPendientes = pendingAgg._sum.amount || 0;

        const paidAgg = await prisma.commission.aggregate({
          where: {
            ...commWherePaid,
            staffId: prof.id,
          },
          _sum: {
            amount: true,
          },
        });
        const comisionesPagadas = paidAgg._sum.amount || 0;

        return {
          professional: {
            id: prof.id,
            name: prof.name,
            email: prof.email,
            role: prof.role,
            isActive: prof.isActive,
          },
          citasCompletadas: completedAppointments,
          ventasTotales: round(ventasTotales),
          comisionesPendientes: round(comisionesPendientes),
          comisionesPagadas: round(comisionesPagadas),
          comisionesTotales: round(comisionesPendientes + comisionesPagadas),
        };
      })
    );

    res.json(staffReports);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al generar el reporte de personal.' });
  }
};

export const getInventoryReport = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;

    // Insumos más consumidos por citas (SESSION_CONSUMPTION)
    const consumptions = await prisma.inventoryMovement.groupBy({
      by: ['productId'],
      where: {
        type: 'SESSION_CONSUMPTION',
        tenantId,
      },
      _sum: {
        quantity: true,
      },
      orderBy: {
        _sum: {
          quantity: 'desc',
        },
      },
      take: 10,
    });

    const productIds = consumptions.map((c) => c.productId);
    const productsInfo = await prisma.product.findMany({
      where: {
        id: { in: productIds },
        tenantId,
      },
      select: {
        id: true,
        name: true,
        unit: true,
      },
    });

    const productsInfoMap = new Map(productsInfo.map((p) => [p.id, p]));
    const insumosMasConsumidos = consumptions.map((c) => {
      const p = productsInfoMap.get(c.productId);
      return {
        productId: c.productId,
        name: p?.name || 'Desconocido',
        unit: p?.unit || 'unidad',
        totalConsumed: c._sum.quantity || 0,
      };
    });

    // Valorización del almacén
    const activeProducts = await prisma.product.findMany({
      where: {
        isActive: true,
        tenantId,
      },
    });

    let valorizacionTotal = 0;
    const valorizacionDetalle = activeProducts.map((p) => {
      const valor = p.stock * p.price;
      valorizacionTotal += valor;
      return {
        productId: p.id,
        name: p.name,
        category: p.category,
        stock: p.stock,
        price: p.price,
        value: round(valor),
      };
    });

    // Productos con stock crítico (< 5 unidades)
    const stockCritico = activeProducts
      .filter((p) => p.stock < 5)
      .map((p) => ({
        productId: p.id,
        name: p.name,
        category: p.category,
        stock: p.stock,
        price: p.price,
        unit: p.unit,
      }));

    res.json({
      insumosMasConsumidos,
      valorizacion: {
        total: round(valorizacionTotal),
        detalle: valorizacionDetalle,
      },
      stockCritico,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al generar el reporte de inventario.' });
  }
};

export const exportCSVReport = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { startDate, endDate, type } = req.query;
    const tenantId = req.user!.tenantId;

    if (!startDate || !endDate || !type) {
      res.status(400).json({ error: 'startDate, endDate y type son parámetros requeridos.' });
      return;
    }

    const start = new Date(startDate as string);
    const end = new Date(endDate as string);
    end.setHours(23, 59, 59, 999);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      res.status(400).json({ error: 'Formato de fecha inválido. Use AAAA-MM-DD.' });
      return;
    }

    const typeStr = String(type).toLowerCase();
    if (!['invoices', 'expenses', 'payroll'].includes(typeStr)) {
      res.status(400).json({ error: 'El tipo debe ser "invoices", "expenses" o "payroll".' });
      return;
    }

    let csvContent = '';

    if (typeStr === 'invoices') {
      const invoices = await prisma.invoice.findMany({
        where: {
          paidAt: {
            gte: start,
            lte: end,
          },
          tenantId,
        },
        include: {
          patient: { select: { fullName: true } },
          coupon: { select: { code: true } },
        },
        orderBy: {
          paidAt: 'asc',
        },
      });

      csvContent = 'ID,Paciente,Fecha de Pago,Método de Pago,Subtotal,Impuesto,Total,Estado,Referencia,Cupón\n';
      for (const inv of invoices) {
        csvContent += [
          inv.id,
          inv.patient.fullName,
          inv.paidAt.toISOString(),
          inv.paymentMethod,
          inv.subtotal,
          inv.tax,
          inv.total,
          inv.status,
          inv.reference || '',
          inv.coupon?.code || '',
        ]
          .map(escapeCSV)
          .join(',') + '\n';
      }
    } else if (typeStr === 'expenses') {
      const expenses = await prisma.cashMovement.findMany({
        where: {
          type: 'EXPENSE',
          tenantId,
          createdAt: {
            gte: start,
            lte: end,
          },
        },
        include: {
          user: { select: { name: true } },
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      csvContent = 'ID,Fecha,Monto,Descripción,Registrado Por\n';
      for (const exp of expenses) {
        csvContent += [
          exp.id,
          exp.createdAt.toISOString(),
          exp.amount,
          exp.description,
          exp.user.name,
        ]
          .map(escapeCSV)
          .join(',') + '\n';
      }
    } else if (typeStr === 'payroll') {
      const payrolls = await prisma.payrollEntry.findMany({
        where: {
          tenantId,
          OR: [
            {
              paidAt: {
                gte: start,
                lte: end,
              },
            },
            {
              createdAt: {
                gte: start,
                lte: end,
              },
            },
          ],
        },
        include: {
          staff: { select: { name: true } },
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      csvContent = 'ID,Colaborador,Salario Base,Comisiones,Total Pagado,Estado,Período Inicio,Período Fin,Fecha de Pago\n';
      for (const p of payrolls) {
        csvContent += [
          p.id,
          p.staff.name,
          p.baseSalary,
          p.commissionsAmount,
          p.totalPaid,
          p.status,
          p.periodStart.toISOString().split('T')[0],
          p.periodEnd.toISOString().split('T')[0],
          p.paidAt ? p.paidAt.toISOString() : '',
        ]
          .map(escapeCSV)
          .join(',') + '\n';
      }
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=report_${typeStr}_${startDate}_to_${endDate}.csv`);
    res.status(200).send('\ufeff' + csvContent);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al exportar el reporte CSV.' });
  }
};

export const getGeneralReport = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;
    const { range, startDate, endDate } = req.query;

    const now = new Date();
    let start = new Date();
    let end = new Date();
    let prevStart = new Date();
    let prevEnd = new Date();

    if (range === 'hoy') {
      // Hora de Bolivia, no la del contenedor (que corre en UTC) — mismo
      // helper que ya se usa para asistencia/turnos, para no repetir el bug
      // de zona horaria que ya se dio varias veces en este sistema.
      const today = getBoliviaTodayRange(now);
      start = today.start;
      end = today.end;
      const yesterday = getBoliviaTodayRange(new Date(now.getTime() - 24 * 60 * 60 * 1000));
      prevStart = yesterday.start;
      prevEnd = yesterday.end;
    } else if (range === 'esta_semana') {
      const { dayOfWeek } = getBoliviaDayAndMinutes(now);
      const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const monday = getBoliviaTodayRange(new Date(now.getTime() - diffToMonday * 24 * 60 * 60 * 1000));
      start = monday.start;
      end = getBoliviaTodayRange(new Date(monday.start.getTime() + 6 * 24 * 60 * 60 * 1000)).end;
      const prevMonday = getBoliviaTodayRange(new Date(monday.start.getTime() - 7 * 24 * 60 * 60 * 1000));
      prevStart = prevMonday.start;
      prevEnd = getBoliviaTodayRange(new Date(prevMonday.start.getTime() + 6 * 24 * 60 * 60 * 1000)).end;
    } else if (range === 'este_mes') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      prevEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    } else if (range === 'mes_anterior') {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      prevStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      prevEnd = new Date(now.getFullYear(), now.getMonth() - 1, 0, 23, 59, 59, 999);
    } else if (range === 'anio_actual') {
      start = new Date(now.getFullYear(), 0, 1);
      end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      prevStart = new Date(now.getFullYear() - 1, 0, 1);
      prevEnd = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
    } else {
      // personalizado
      start = startDate ? new Date(startDate as string) : new Date(now.getFullYear(), now.getMonth(), 1);
      end = endDate ? new Date(endDate as string) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      end.setHours(23, 59, 59, 999);
      
      const diff = end.getTime() - start.getTime();
      prevStart = new Date(start.getTime() - diff - 1000);
      prevEnd = new Date(start.getTime() - 1000);
    }

    // Igual que en finance.ts: un ADMIN de sucursal solo puede ver la nómina
    // de su propio personal (no administradores); el SÚPER ADMIN ve todo.
    const staffWhere: any = {};
    if (req.user!.role !== Role.SUPER_ADMIN) {
      staffWhere.branchId = req.user!.branchId;
      staffWhere.role = { notIn: [Role.ADMIN, Role.SUPER_ADMIN] };
    }

    // Run queries in parallel
    const [
      invoices,
      invoicesPrev,
      expenses,
      expensesPrev,
      payrolls,
      payrollsPrev,
      citasCount,
      citasCountPrev,
      activeProducts,
      stockMovements,
      completedApptsForTreatments,
      sessionMovements,
      sessionMovementsPrev,
      mermaMovements,
      mermaMovementsPrev,
      nominaPeriodo
    ] = await Promise.all([
      // 1. Invoices
      prisma.invoice.findMany({
        where: { tenantId, status: 'PAGADO', paidAt: { gte: start, lte: end } },
        include: {
          branch: { select: { name: true } },
          patient: { select: { fullName: true } },
          soldBy: { select: { name: true } },
          appointment: { select: { professional: { select: { name: true } } } },
          items: { include: { product: { select: { costPrice: true } } } },
        }
      }),
      // 2. Invoices prev
      prisma.invoice.findMany({
        where: { tenantId, status: 'PAGADO', paidAt: { gte: prevStart, lte: prevEnd } },
        include: { items: { include: { product: { select: { costPrice: true } } } } }
      }),
      // 3. Expenses
      prisma.cashMovement.findMany({
        where: { tenantId, type: 'EXPENSE', createdAt: { gte: start, lte: end } },
        include: { user: { select: { name: true } } }
      }),
      // 4. Expenses prev
      prisma.cashMovement.findMany({
        where: { tenantId, type: 'EXPENSE', createdAt: { gte: prevStart, lte: prevEnd } }
      }),
      // 5. Payroll (solo del personal que este usuario puede ver/pagar)
      prisma.payrollEntry.findMany({
        where: { tenantId, status: 'PAID', paidAt: { gte: start, lte: end }, staff: staffWhere }
      }),
      // 6. Payroll prev
      prisma.payrollEntry.findMany({
        where: { tenantId, status: 'PAID', paidAt: { gte: prevStart, lte: prevEnd }, staff: staffWhere }
      }),
      // 7. Citas
      prisma.appointment.count({
        where: { tenantId, status: 'COMPLETADA', dateTime: { gte: start, lte: end } }
      }),
      // 8. Citas prev
      prisma.appointment.count({
        where: { tenantId, status: 'COMPLETADA', dateTime: { gte: prevStart, lte: prevEnd } }
      }),
      // 9. Active products
      prisma.product.findMany({
        where: { tenantId, isActive: true },
        select: { name: true, price: true, costPrice: true, stock: true }
      }),
      // 10. Stock movements in range
      prisma.inventoryMovement.findMany({
        where: { tenantId, createdAt: { gte: start, lte: end } },
        include: { product: { select: { price: true, costPrice: true } } }
      }),
      // 11. Completed appointments for treatments
      prisma.appointment.findMany({
        where: { tenantId, status: 'COMPLETADA', dateTime: { gte: start, lte: end }, serviceId: { not: null } },
        include: {
          service: { select: { name: true } },
          professional: { select: { id: true, name: true, role: true } },
          invoice: {
            select: {
              total: true,
              items: { select: { total: true, product: { select: { category: true } } } },
            },
          },
        }
      }),
      // 12. Session consumption movements for top supplies
      prisma.inventoryMovement.findMany({
        where: { tenantId, type: 'SESSION_CONSUMPTION', createdAt: { gte: start, lte: end } },
        include: {
          product: { select: { name: true, costPrice: true } },
          appointment: { select: { professional: { select: { name: true } } } },
        }
      }),
      // 13. Session consumption movements (previous period, for egresos diff)
      prisma.inventoryMovement.findMany({
        where: { tenantId, type: 'SESSION_CONSUMPTION', createdAt: { gte: prevStart, lte: prevEnd } },
        include: { product: { select: { costPrice: true } } }
      }),
      // 14. Mermas (STOCK_OUT manuales, no ligadas a una cita) en el período
      prisma.inventoryMovement.findMany({
        where: { tenantId, type: 'STOCK_OUT', appointmentId: null, createdAt: { gte: start, lte: end } },
        include: { product: { select: { name: true, costPrice: true } } }
      }),
      // 15. Mermas del período anterior, para el diff
      prisma.inventoryMovement.findMany({
        where: { tenantId, type: 'STOCK_OUT', appointmentId: null, createdAt: { gte: prevStart, lte: prevEnd } },
        include: { product: { select: { costPrice: true } } }
      }),
      // 16. Nómina del período (cualquier estado: pagada o pendiente) para el
      // detalle de auditoría "a quién se le pagó y a quién no".
      prisma.payrollEntry.findMany({
        where: { tenantId, periodStart: { lte: end }, periodEnd: { gte: start }, staff: staffWhere },
        include: { staff: { select: { name: true, role: true } } },
        orderBy: { periodStart: 'desc' }
      })
    ]);

    // KPI 1: Ingresos Netos
    const ingresosNetos = invoices.reduce((sum, inv) => sum + inv.total, 0);
    const ingresosNetosPrev = invoicesPrev.reduce((sum, inv) => sum + inv.total, 0);
    const ingresosNetosDiff = ingresosNetosPrev > 0
      ? round(((ingresosNetos - ingresosNetosPrev) / ingresosNetosPrev) * 100)
      : (ingresosNetos > 0 ? 100 : 0);

    // KPI 2: Egresos (Expenses excluding payroll-related + Payrolls + costo real
    // de insumos consumidos en sesiones + costo de productos vendidos). El costo
    // de los insumos ya se pagó al comprarlos (se descuenta de "Valor en Costo"
    // de Almacén al consumirse/venderse), pero también es un costo real de
    // operar el servicio y debe reflejarse acá para que Ingresos - Egresos
    // muestre la ganancia real del período.
    const costoInsumosConsumidos = sessionMovements.reduce((sum, m) => sum + m.quantity * (m.product?.costPrice ?? 0), 0);
    // Costo de productos vendidos directamente por Terminal POS (ítems de
    // factura con productId): antes no se contaba en ningún lado, así que se
    // cobraba la venta completa como ganancia sin descontar lo que costó
    // comprar ese producto.
    const costoProductosVendidos = invoices.reduce(
      (sum, inv) => sum + inv.items.reduce((s, item) => s + (item.product ? item.quantity * item.product.costPrice : 0), 0),
      0
    );
    const costoProductosVendidosPrev = invoicesPrev.reduce(
      (sum, inv) => sum + inv.items.reduce((s, item) => s + (item.product ? item.quantity * item.product.costPrice : 0), 0),
      0
    );
    const costoInsumosConsumidosPrev = sessionMovementsPrev.reduce((sum, m) => sum + m.quantity * (m.product?.costPrice ?? 0), 0);
    // Costo real de mermas (stock dañado/vencido/perdido, ajustado a mano): es
    // plata que ya se invirtió y se perdió, así que también es un costo real
    // del período, igual que en la tarjeta "Pérdidas por Mermas" de Almacén.
    const costoMermas = mermaMovements.reduce((sum, m) => sum + m.quantity * (m.product?.costPrice ?? 0), 0);
    const costoMermasPrev = mermaMovementsPrev.reduce((sum, m) => sum + m.quantity * (m.product?.costPrice ?? 0), 0);

    const egresosGeneral = expenses.filter((e) => !e.description.includes('Pago de Nómina')).reduce((sum, e) => sum + e.amount, 0);
    const egresosPayroll = payrolls.reduce((sum, p) => sum + p.totalPaid, 0);
    const egresos = egresosGeneral + egresosPayroll + costoInsumosConsumidos + costoProductosVendidos + costoMermas;

    const egresosGeneralPrev = expensesPrev.filter((e) => !e.description.includes('Pago de Nómina')).reduce((sum, e) => sum + e.amount, 0);
    const egresosPayrollPrev = payrollsPrev.reduce((sum, p) => sum + p.totalPaid, 0);
    const egresosPrevVal = egresosGeneralPrev + egresosPayrollPrev + costoInsumosConsumidosPrev + costoProductosVendidosPrev + costoMermasPrev;

    // KPI extra: Ganancia Real (Ingresos - Egresos, incluyendo costo de insumos consumidos)
    const gananciaReal = ingresosNetos - egresos;
    const gananciaRealPrev = ingresosNetosPrev - egresosPrevVal;
    const gananciaRealDiff = gananciaRealPrev > 0
      ? round(((gananciaReal - gananciaRealPrev) / gananciaRealPrev) * 100)
      : (gananciaReal > 0 ? 100 : 0);
    
    const egresosDiff = egresosPrevVal > 0
      ? round(((egresos - egresosPrevVal) / egresosPrevVal) * 100)
      : (egresos > 0 ? 100 : 0);

    // KPI 3: Citas Completadas
    const citasCompletadas = citasCount;
    const citasCompletadasPrev = citasCountPrev;
    const citasCompletadasDiff = citasCompletadasPrev > 0
      ? round(((citasCompletadas - citasCompletadasPrev) / citasCompletadasPrev) * 100)
      : (citasCompletadas > 0 ? 100 : 0);

    // KPI 4: Valor de Almacen — "costo acumulado de insumos en stock" debe
    // reflejar lo que realmente costó comprar el stock (costPrice), no lo que
    // valdría venderlo (price), que es una métrica distinta (PVP).
    const valorAlmacen = activeProducts.reduce((sum, p) => sum + (p.stock * p.costPrice), 0);
    let movementsValueChange = 0;
    for (const mov of stockMovements) {
      if (mov.product) {
        const val = mov.quantity * mov.product.costPrice;
        if (mov.type === 'STOCK_IN') {
          movementsValueChange += val;
        } else {
          movementsValueChange -= val;
        }
      }
    }
    const previousValorAlmacen = valorAlmacen - movementsValueChange;
    const valorAlmacenDiff = previousValorAlmacen > 0
      ? round(((valorAlmacen - previousValorAlmacen) / previousValorAlmacen) * 100)
      : 0;

    // Daily Evolution
    const evolutionMap: Record<string, number> = {};
    if (range === 'anio_actual') {
      const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      months.forEach((m) => { evolutionMap[m] = 0; });
      for (const inv of invoices) {
        const mIdx = new Date(inv.paidAt).getMonth();
        const mName = months[mIdx];
        evolutionMap[mName] = (evolutionMap[mName] || 0) + inv.total;
      }
    } else {
      const temp = new Date(start);
      while (temp <= end) {
        const dateStr = temp.toISOString().split('T')[0];
        evolutionMap[dateStr] = 0;
        temp.setDate(temp.getDate() + 1);
      }
      for (const inv of invoices) {
        const dateStr = new Date(inv.paidAt).toISOString().split('T')[0];
        if (evolutionMap[dateStr] !== undefined) {
          evolutionMap[dateStr] += inv.total;
        }
      }
    }

    const dailyEvolution = Object.keys(evolutionMap).map((key) => {
      let label = key;
      if (key.includes('-')) {
        const parts = key.split('-');
        label = `${parts[2]}/${parts[1]}`; // DD/MM
      }
      return {
        label,
        ingresos: round(evolutionMap[key])
      };
    });

    // Payment Methods
    const porMetodoPago = {
      EFECTIVO: 0,
      TARJETA: 0,
      TRANSFERENCIA: 0,
      BILLETERA_VIRTUAL: 0
    };
    for (const inv of invoices) {
      if (inv.paymentMethod in porMetodoPago) {
        porMetodoPago[inv.paymentMethod as keyof typeof porMetodoPago] += inv.total;
      }
    }
    const totalPayments = Object.values(porMetodoPago).reduce((sum, val) => sum + val, 0);
    const colorMap: Record<string, string> = {
      EFECTIVO: 'var(--primary)',
      TARJETA: '#3b82f6',
      TRANSFERENCIA: '#10b981',
      BILLETERA_VIRTUAL: '#f59e0b'
    };
    const paymentMethods = Object.keys(porMetodoPago).map((method) => {
      const amount = porMetodoPago[method as keyof typeof porMetodoPago];
      const percentage = totalPayments > 0 ? round((amount / totalPayments) * 100) : 0;
      return {
        method,
        amount: round(amount),
        percentage,
        color: colorMap[method] || '#6b7280'
      };
    });

    // Top Treatments
    const treatmentCounts: Record<string, number> = {};
    for (const appt of completedApptsForTreatments) {
      const name = appt.service?.name || 'Otro';
      treatmentCounts[name] = (treatmentCounts[name] || 0) + 1;
    }
    const topTreatments = Object.keys(treatmentCounts)
      .map((name) => ({ name, count: treatmentCounts[name] }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Top Supplies
    const supplyCounts: Record<string, number> = {};
    for (const mov of sessionMovements) {
      const name = mov.product?.name || 'Desconocido';
      supplyCounts[name] = (supplyCounts[name] || 0) + mov.quantity;
    }
    const topSupplies = Object.keys(supplyCounts)
      .map((name) => ({ name, count: supplyCounts[name] }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Por Sucursal
    const porSucursal: Record<string, number> = {};
    for (const inv of invoices) {
      const branchName = inv.branch?.name || 'Sede Principal';
      porSucursal[branchName] = round((porSucursal[branchName] || 0) + inv.total);
    }

    // Desglose por Profesional: cuántas citas atendió cada uno, cuánto
    // facturaron esas citas, y cuánto costó (a precio de costo) el insumo
    // que consumieron — para poder auditar quién atendió a quién y a qué costo.
    const costoInsumosPorCita: Record<string, number> = {};
    for (const mov of sessionMovements) {
      if (mov.appointmentId) {
        costoInsumosPorCita[mov.appointmentId] = (costoInsumosPorCita[mov.appointmentId] || 0) + mov.quantity * (mov.product?.costPrice ?? 0);
      }
    }
    const staffMap: Record<string, { name: string; role: string; citasAtendidas: number; ingresos: number; costoInsumos: number }> = {};
    for (const appt of completedApptsForTreatments) {
      if (!appt.professional) continue;
      const key = appt.professional.id;
      if (!staffMap[key]) {
        staffMap[key] = { name: appt.professional.name, role: appt.professional.role, citasAtendidas: 0, ingresos: 0, costoInsumos: 0 };
      }
      staffMap[key].citasAtendidas += 1;
      // Solo la parte de SERVICIOS de la factura de esta cita — si en el mismo
      // cobro se vendieron productos sueltos (ej. cremas de mostrador), esos
      // no son mérito de quien atendió el tratamiento, sino de quien los vendió
      // (mismo criterio que ya usa finance.ts para las comisiones de staff).
      const invoiceServiceTotal = (appt.invoice?.items ?? []).reduce(
        (sum, item) => sum + (item.product?.category === 'PRODUCTO' ? 0 : item.total),
        0
      );
      staffMap[key].ingresos += invoiceServiceTotal;
      staffMap[key].costoInsumos += costoInsumosPorCita[appt.id] ?? 0;
    }
    const staffBreakdown = Object.values(staffMap)
      .map((s) => ({ ...s, ingresos: round(s.ingresos), costoInsumos: round(s.costoInsumos) }))
      .sort((a, b) => b.citasAtendidas - a.citasAtendidas);

    // Detalle de Almacén: valor de costo/venta de cada producto activo, para
    // el reporte de auditoría.
    const almacenDetalle = activeProducts.map((p: any) => ({
      name: p.name,
      stock: p.stock,
      costPrice: p.costPrice,
      price: p.price,
      valorCosto: round(p.stock * p.costPrice),
      valorVenta: round(p.stock * p.price),
    }));

    // Detalle de Nómina: cada trabajador con nómina generada en el período,
    // indicando si ya se le pagó o sigue pendiente, para poder auditar quién
    // cobró y quién no.
    const nominaDetalle = nominaPeriodo.map((p) => ({
      name: p.staff.name,
      role: p.staff.role,
      status: p.status === 'PAID' ? 'PAGADO' : 'PENDIENTE',
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
      baseSalary: round(p.baseSalary),
      commissionsAmount: round(p.commissionsAmount),
      totalPaid: round(p.totalPaid),
      paidAt: p.paidAt,
    }));

    // Detalle de Insumos Consumidos en Sesión: agrupado por producto Y
    // profesional que lo consumió (vía la cita asociada al movimiento), para
    // poder auditar quién usó qué y a qué costo, sin listar cada sesión suelta.
    const insumosMap: Record<string, { name: string; profesional: string; cantidad: number; costoUnitario: number; costoTotal: number }> = {};
    for (const mov of sessionMovements) {
      const name = mov.product?.name || 'Desconocido';
      const profesional = (mov as any).appointment?.professional?.name || 'Sin profesional asociado';
      const costoUnitario = mov.product?.costPrice ?? 0;
      const key = `${name}|${profesional}`;
      if (!insumosMap[key]) {
        insumosMap[key] = { name, profesional, cantidad: 0, costoUnitario, costoTotal: 0 };
      }
      insumosMap[key].cantidad += mov.quantity;
      insumosMap[key].costoTotal += mov.quantity * costoUnitario;
    }
    const insumosDetalle = Object.values(insumosMap)
      .map((i) => ({ ...i, costoTotal: round(i.costoTotal) }))
      .sort((a, b) => b.costoTotal - a.costoTotal);

    // Detalle de Productos Vendidos por Terminal POS: agrupado por producto,
    // con cantidad, ingreso y costo total, para auditar qué se vendió.
    const productosMap: Record<string, { name: string; cantidad: number; ingresoTotal: number; costoTotal: number }> = {};
    for (const inv of invoices) {
      for (const item of inv.items) {
        if (!item.productId) continue;
        const name = item.description;
        const costoUnitario = item.product?.costPrice ?? 0;
        if (!productosMap[name]) {
          productosMap[name] = { name, cantidad: 0, ingresoTotal: 0, costoTotal: 0 };
        }
        productosMap[name].cantidad += item.quantity;
        productosMap[name].ingresoTotal += item.total;
        productosMap[name].costoTotal += item.quantity * costoUnitario;
      }
    }
    const productosVendidosDetalle = Object.values(productosMap)
      .map((p) => ({ ...p, ingresoTotal: round(p.ingresoTotal), costoTotal: round(p.costoTotal) }))
      .sort((a, b) => b.ingresoTotal - a.ingresoTotal);

    // Detalle de Mermas: cada movimiento de pérdida individual, con motivo,
    // para poder auditar qué pasó con cada uno. (No incluye "quién registró":
    // InventoryMovement no guarda ese dato en el esquema actual.)
    const mermasDetalle = mermaMovements.map((m) => ({
      name: m.product?.name || 'Desconocido',
      cantidad: m.quantity,
      costoUnitario: m.product?.costPrice ?? 0,
      costoTotal: round(m.quantity * (m.product?.costPrice ?? 0)),
      motivo: m.notes || 'Sin motivo especificado',
      fecha: m.createdAt,
    }));

    // Detalle de Gastos Manuales (Caja Diaria): cada egreso registrado a mano,
    // uno por uno, con quién lo cargó — para auditar el gasto general (no
    // incluye pagos de nómina, que van aparte en su propia sub-tabla).
    const gastosManualesDetalle = expenses
      .filter((e) => !e.description.includes('Pago de Nómina'))
      .map((e) => ({
        fecha: e.createdAt,
        descripcion: e.description,
        registradoPor: (e as any).user?.name || 'Desconocido',
        monto: round(e.amount),
      }));

    // ── Desglose de INGRESOS por origen (Servicios vs. Productos) ──────────
    // Se arma a partir de las mismas invoices/items ya cargadas, para que sea
    // exactamente la misma fuente de datos que usa "Ingresos Netos".
    const ingresosServiciosDetalle: { fecha: Date; folio: string; cliente: string; servicio: string; profesional: string; monto: number }[] = [];
    const ingresosProductosDetalle: { fecha: Date; producto: string; cantidad: number; precioUnitario: number; ingresoTotal: number; vendidoPor: string }[] = [];
    for (const inv of invoices) {
      const cliente = (inv as any).patient?.fullName || 'Desconocido';
      const profesional = (inv as any).appointment?.professional?.name || '—';
      const vendidoPor = (inv as any).soldBy?.name || '—';
      const folio = inv.id.substring(0, 8).toUpperCase();
      for (const item of inv.items) {
        if (item.productId) {
          ingresosProductosDetalle.push({
            fecha: inv.paidAt,
            producto: item.description,
            cantidad: item.quantity,
            precioUnitario: round(item.unitPrice),
            ingresoTotal: round(item.total),
            vendidoPor,
          });
        } else {
          ingresosServiciosDetalle.push({
            fecha: inv.paidAt,
            folio,
            cliente,
            servicio: item.description,
            profesional,
            monto: round(item.total),
          });
        }
      }
    }
    ingresosServiciosDetalle.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
    ingresosProductosDetalle.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

    const subtotalServicios = round(ingresosServiciosDetalle.reduce((sum, r) => sum + r.monto, 0));
    const subtotalProductos = round(ingresosProductosDetalle.reduce((sum, r) => sum + r.ingresoTotal, 0));
    // No existe en el sistema ningún concepto de ingreso separado de
    // servicios/productos (ni anticipos, ni propinas; y vender un "paquete"
    // no genera ninguna Invoice — TreatmentPackage no tiene ni siquiera un
    // campo de precio). Se deja en $0 en vez de inventar una cifra.
    const otrosIngresosDetalle: { concepto: string; monto: number }[] = [];
    const otrosIngresos = 0;

    // Los InvoiceItem.total suman el SUBTOTAL de la factura (antes de
    // descuento/impuesto) — no el total final ya cobrado. Para que Servicios +
    // Productos cuadre EXACTO con Ingresos Netos (= Σ invoice.total) hay que
    // restar los descuentos aplicados y sumar los impuestos, como líneas
    // explícitas y auditables (no escondidas).
    const totalDescuentos = round(invoices.reduce((sum, inv) => sum + (inv.subtotal - inv.total + inv.tax), 0));
    const totalImpuestos = round(invoices.reduce((sum, inv) => sum + inv.tax, 0));

    // ── Verificaciones de cuadre: si alguna no da exacta, no se oculta — se
    // manda el detalle para que el PDF la muestre en rojo. ──────────────────
    const approxEqual = (a: number, b: number) => Math.abs(round(a) - round(b)) < 0.01;
    const totalIngresosReconciliado = round(subtotalServicios + subtotalProductos + otrosIngresos - totalDescuentos + totalImpuestos);
    const sumaMetodosPago = round(paymentMethods.reduce((sum, pm) => sum + pm.amount, 0));
    const sumaComponentesGasto = round(egresosGeneral + egresosPayroll + costoInsumosConsumidos + costoProductosVendidos + costoMermas);

    const auditChecks = [
      {
        label: 'Servicios + Productos + Otros - Descuentos + Impuestos == Ingresos Netos',
        expected: round(ingresosNetos),
        actual: totalIngresosReconciliado,
        ok: approxEqual(totalIngresosReconciliado, ingresosNetos),
      },
      {
        label: 'Suma de métodos de pago == Ingresos Netos',
        expected: round(ingresosNetos),
        actual: sumaMetodosPago,
        ok: approxEqual(sumaMetodosPago, ingresosNetos),
      },
      {
        label: 'Suma de componentes de gasto == Total Gastos y Egresos',
        expected: round(egresos),
        actual: sumaComponentesGasto,
        ok: approxEqual(sumaComponentesGasto, egresos),
      },
      {
        label: 'Ingresos Netos - Total Gastos y Egresos == Ganancia Real',
        expected: round(gananciaReal),
        actual: round(ingresosNetos - egresos),
        ok: approxEqual(ingresosNetos - egresos, gananciaReal),
      },
    ];

    res.json({
      kpis: {
        ingresosNetos: round(ingresosNetos),
        ingresosNetosDiff,
        egresos: round(egresos),
        egresosDiff,
        gananciaReal: round(gananciaReal),
        gananciaRealDiff,
        citasCompletadas,
        citasCompletadasDiff,
        valorAlmacen: round(valorAlmacen),
        valorAlmacenDiff
      },
      egresosBreakdown: {
        gastosManuales: round(egresosGeneral),
        nomina: round(egresosPayroll),
        insumosConsumidos: round(costoInsumosConsumidos),
        productosVendidos: round(costoProductosVendidos),
        mermas: round(costoMermas),
      },
      dailyEvolution,
      paymentMethods,
      topTreatments,
      topSupplies,
      porSucursal,
      staffBreakdown,
      almacenDetalle,
      nominaDetalle,
      insumosDetalle,
      productosVendidosDetalle,
      mermasDetalle,
      gastosManualesDetalle,
      ingresosServiciosDetalle,
      ingresosProductosDetalle,
      otrosIngresosDetalle,
      ingresosBreakdown: {
        subtotalServicios,
        subtotalProductos,
        otrosIngresos: round(otrosIngresos),
        totalDescuentos,
        totalImpuestos,
      },
      auditChecks,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al generar el reporte analítico general.' });
  }
};
