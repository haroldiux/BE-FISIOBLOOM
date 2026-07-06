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
