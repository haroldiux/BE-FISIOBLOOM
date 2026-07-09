import { Response } from 'express';
import prisma from '../services/prisma';
import { AuthenticatedRequest } from '../middlewares/auth';

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

    if (range === 'este_mes') {
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
      sessionMovements
    ] = await Promise.all([
      // 1. Invoices
      prisma.invoice.findMany({
        where: { tenantId, status: 'PAGADO', paidAt: { gte: start, lte: end } },
        include: { branch: { select: { name: true } } }
      }),
      // 2. Invoices prev
      prisma.invoice.findMany({
        where: { tenantId, status: 'PAGADO', paidAt: { gte: prevStart, lte: prevEnd } }
      }),
      // 3. Expenses
      prisma.cashMovement.findMany({
        where: { tenantId, type: 'EXPENSE', createdAt: { gte: start, lte: end } }
      }),
      // 4. Expenses prev
      prisma.cashMovement.findMany({
        where: { tenantId, type: 'EXPENSE', createdAt: { gte: prevStart, lte: prevEnd } }
      }),
      // 5. Payroll
      prisma.payrollEntry.findMany({
        where: { tenantId, status: 'PAID', paidAt: { gte: start, lte: end } }
      }),
      // 6. Payroll prev
      prisma.payrollEntry.findMany({
        where: { tenantId, status: 'PAID', paidAt: { gte: prevStart, lte: prevEnd } }
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
        select: { price: true, stock: true }
      }),
      // 10. Stock movements in range
      prisma.inventoryMovement.findMany({
        where: { tenantId, createdAt: { gte: start, lte: end } },
        include: { product: { select: { price: true } } }
      }),
      // 11. Completed appointments for treatments
      prisma.appointment.findMany({
        where: { tenantId, status: 'COMPLETADA', dateTime: { gte: start, lte: end }, serviceId: { not: null } },
        include: { service: { select: { name: true } } }
      }),
      // 12. Session consumption movements for top supplies
      prisma.inventoryMovement.findMany({
        where: { tenantId, type: 'SESSION_CONSUMPTION', createdAt: { gte: start, lte: end } },
        include: { product: { select: { name: true } } }
      })
    ]);

    // KPI 1: Ingresos Netos
    const ingresosNetos = invoices.reduce((sum, inv) => sum + inv.total, 0);
    const ingresosNetosPrev = invoicesPrev.reduce((sum, inv) => sum + inv.total, 0);
    const ingresosNetosDiff = ingresosNetosPrev > 0
      ? round(((ingresosNetos - ingresosNetosPrev) / ingresosNetosPrev) * 100)
      : (ingresosNetos > 0 ? 100 : 0);

    // KPI 2: Egresos (Expenses excluding payroll-related + Payrolls)
    const egresosGeneral = expenses.filter((e) => !e.description.includes('Pago de Nómina')).reduce((sum, e) => sum + e.amount, 0);
    const egresosPayroll = payrolls.reduce((sum, p) => sum + p.totalPaid, 0);
    const egresos = egresosGeneral + egresosPayroll;

    const egresosGeneralPrev = expensesPrev.filter((e) => !e.description.includes('Pago de Nómina')).reduce((sum, e) => sum + e.amount, 0);
    const egresosPayrollPrev = payrollsPrev.reduce((sum, p) => sum + p.totalPaid, 0);
    const egresosPrevVal = egresosGeneralPrev + egresosPayrollPrev;
    
    const egresosDiff = egresosPrevVal > 0
      ? round(((egresos - egresosPrevVal) / egresosPrevVal) * 100)
      : (egresos > 0 ? 100 : 0);

    // KPI 3: Citas Completadas
    const citasCompletadas = citasCount;
    const citasCompletadasPrev = citasCountPrev;
    const citasCompletadasDiff = citasCompletadasPrev > 0
      ? round(((citasCompletadas - citasCompletadasPrev) / citasCompletadasPrev) * 100)
      : (citasCompletadas > 0 ? 100 : 0);

    // KPI 4: Valor de Almacen
    const valorAlmacen = activeProducts.reduce((sum, p) => sum + (p.stock * p.price), 0);
    let movementsValueChange = 0;
    for (const mov of stockMovements) {
      if (mov.product) {
        const val = mov.quantity * mov.product.price;
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

    res.json({
      kpis: {
        ingresosNetos: round(ingresosNetos),
        ingresosNetosDiff,
        egresos: round(egresos),
        egresosDiff,
        citasCompletadas,
        citasCompletadasDiff,
        valorAlmacen: round(valorAlmacen),
        valorAlmacenDiff
      },
      dailyEvolution,
      paymentMethods,
      topTreatments,
      topSupplies,
      porSucursal
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al generar el reporte analítico general.' });
  }
};
