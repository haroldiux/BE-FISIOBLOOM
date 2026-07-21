import { Response } from 'express';
import { PaymentMethod, InvoiceStatus, MovementType, CashStatus } from '@prisma/client';
import prisma from '../services/prisma';
import { AuthenticatedRequest } from '../middlewares/auth';
import { FiscalInvoiceService } from '../services/fiscalInvoice';

export const getAll = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { patientId, from, to } = req.query;
    const tenantId = req.user!.tenantId;

    const where: any = { tenantId };

    if (patientId) {
      where.patientId = patientId as string;
    }

    if (from || to) {
      where.paidAt = {};
      if (from) where.paidAt.gte = new Date(from as string);
      if (to) where.paidAt.lte = new Date(to as string);
    }

    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        patient: {
          select: { id: true, fullName: true, phone: true },
        },
        items: {
          include: {
            product: { select: { id: true, name: true, unit: true } },
          },
        },
      },
      orderBy: { paidAt: 'desc' },
    });

    res.json(invoices);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error fetching invoices.' });
  }
};

export const getById = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    const invoice = await prisma.invoice.findFirst({
      where: { id: String(id), tenantId },
      include: {
        patient: {
          select: { id: true, fullName: true, phone: true, email: true },
        },
        appointment: {
          select: { id: true, dateTime: true, duration: true, status: true },
        },
        items: {
          include: {
            product: { select: { id: true, name: true, category: true, unit: true } },
          },
        },
      },
    });

    if (!invoice) {
      res.status(404).json({ error: 'Invoice not found.' });
      return;
    }

    res.json(invoice);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error fetching invoice.' });
  }
};

export const create = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id, patientId, appointmentId, items, subtotal, tax, total, paymentMethod, reference, status, paidAt, couponCode, isFiscal, taxId, clientName, fiscalProvider } = req.body;
    const userId = req.user?.id;
    const tenantId = req.user?.tenantId;

    if (!patientId || !items || !Array.isArray(items) || items.length === 0 || !paymentMethod || total === undefined) {
      res.status(400).json({ error: 'patientId, items, paymentMethod, and total are required.' });
      return;
    }

    if (!userId || !tenantId) {
      res.status(401).json({ error: 'Usuario no autenticado o Tenant no válido.' });
      return;
    }

    // Check if invoice already exists (idempotency for offline sync and clientOperationId)
    const idempotencyKey = reference || id;
    if (idempotencyKey) {
      const orConditions: any[] = [];
      if (id) orConditions.push({ id: String(id) });
      if (reference) orConditions.push({ reference: String(reference) });

      if (orConditions.length > 0) {
        const existingInvoice = await prisma.invoice.findFirst({
          where: { OR: orConditions, tenantId },
          include: {
            patient: { select: { id: true, fullName: true } },
            items: { include: { product: { select: { id: true, name: true } } } },
          },
        });
        if (existingInvoice) {
          res.status(200).json({ message: 'Invoice already exists.', invoice: existingInvoice });
          return;
        }
      }
    }

    // Verify patient exists in this tenant
    const patient = await prisma.patient.findFirst({ where: { id: patientId, tenantId } });
    if (!patient) {
      res.status(404).json({ error: 'Patient not found in this clinic.' });
      return;
    }

    // Validate paymentMethod enum
    if (!Object.values(PaymentMethod).includes(paymentMethod as PaymentMethod)) {
      res.status(400).json({ error: `Invalid paymentMethod. Valid values: ${Object.values(PaymentMethod).join(', ')}` });
      return;
    }

    // Validate status if provided
    if (status && !Object.values(InvoiceStatus).includes(status as InvoiceStatus)) {
      res.status(400).json({ error: `Invalid status. Valid values: ${Object.values(InvoiceStatus).join(', ')}` });
      return;
    }

    // Validate products and gather those that need stock reduction
    const productIds = items
      .map((item: any) => item.productId)
      .filter((id: string | undefined) => !!id);

    const productsMap: Record<string, any> = {};
    if (productIds.length > 0) {
      const dbProducts = await prisma.product.findMany({
        where: { id: { in: productIds }, tenantId },
      });
      for (const p of dbProducts) {
        productsMap[p.id] = p;
      }
    }

    // Create invoice + items + reduce stock + trigger cash movement in a transaction
    const invoice = await prisma.$transaction(async (tx) => {
      const targetStatus = (status as InvoiceStatus) || InvoiceStatus.PAGADO;
      
      const currentSubtotal = Number(subtotal ?? total);
      let discountAmount = 0;
      let couponIdToApply: string | null = null;

      if (couponCode) {
        const coupon = await tx.coupon.findFirst({
          where: { code: String(couponCode).trim().toUpperCase(), tenantId }
        });

        if (!coupon) {
          throw new Error('El cupón provisto no existe.');
        }

        if (!coupon.isActive) {
          throw new Error('El cupón no está activo.');
        }

        const now = new Date();
        if (now < new Date(coupon.startDate) || now > new Date(coupon.endDate)) {
          throw new Error('El cupón ha expirado o aún no está vigente.');
        }

        if (coupon.usedCount >= coupon.maxUses) {
          throw new Error('El cupón ha alcanzado su límite de usos.');
        }

        if (currentSubtotal < coupon.minSubtotal) {
          throw new Error(`El subtotal mínimo requerido para aplicar este cupón es de $${coupon.minSubtotal}.`);
        }

        if (coupon.discountType === 'PERCENTAGE') {
          discountAmount = currentSubtotal * (coupon.discountValue / 100);
        } else if (coupon.discountType === 'FIXED') {
          discountAmount = coupon.discountValue;
        }

        discountAmount = Math.min(discountAmount, currentSubtotal);
        couponIdToApply = coupon.id;

        // Incrementar el uso del cupón
        await tx.coupon.update({
          where: { id: coupon.id, tenantId },
          data: { usedCount: { increment: 1 } }
        });
      }

      let appliedTax = Number(tax ?? 0);
      let refValue = reference || null;

      // Integración de Factura Fiscal vía Adaptador Externo
      if (isFiscal && taxId) {
        const fiscalService = new FiscalInvoiceService(fiscalProvider || 'SAT');
        const fiscalRes = await fiscalService.emit({
          invoiceId: id ? String(id) : 'temp-id',
          taxId,
          clientName: clientName || patient.fullName,
          amount: currentSubtotal - discountAmount,
          description: 'Servicios Clínicos y Tratamientos - BLOOM SKIN'
        });
        
        appliedTax = fiscalRes.appliedTax;
        refValue = fiscalRes.fiscalId;
      }

      const finalTotal = Math.max(0, currentSubtotal - discountAmount + appliedTax);

      const created = await tx.invoice.create({
        data: {
          id: id ? String(id) : undefined,
          patientId,
          appointmentId: appointmentId || null,
          subtotal: currentSubtotal,
          tax: appliedTax,
          total: finalTotal,
          paymentMethod: paymentMethod as PaymentMethod,
          reference: refValue,
          status: targetStatus,
          paidAt: paidAt ? new Date(paidAt) : new Date(),
          couponId: couponIdToApply,
          tenantId,
          items: {
            create: items.map((item: any) => ({
              id: item.id ? String(item.id) : undefined,
              productId: item.productId || null,
              description: item.description,
              unitPrice: Number(item.unitPrice),
              quantity: Number(item.quantity ?? 1),
              total: Number(item.total),
              tenantId,
            })),
          },
        },
        include: {
          patient: { select: { id: true, fullName: true } },
          items: { include: { product: { select: { id: true, name: true } } } },
        },
      });

      // Reduce stock for products used in invoice items
      for (const item of items) {
        if (item.productId && productsMap[item.productId]) {
          await tx.product.update({
            where: { id: item.productId, tenantId },
            data: { stock: { decrement: Number(item.quantity ?? 1) } },
          });
        }
      }

      // Lógica de Movimiento de Caja Diaria (Trigger Financiero)
      if (targetStatus === InvoiceStatus.PAGADO) {
        const activeRegister = await tx.cashRegister.findFirst({
          where: { status: CashStatus.OPEN, tenantId },
        });

        if (activeRegister) {
          // Registrar el ingreso
          await tx.cashMovement.create({
            data: {
              cashRegisterId: activeRegister.id,
              userId,
              type: MovementType.INCOME,
              amount: finalTotal,
              description: `Venta POS — Factura #${created.id.substring(0, 8).toUpperCase()} (${patient.fullName})${couponCode ? ` (Cupón: ${couponCode})` : ''}`,
              invoiceId: created.id,
              tenantId,
            }
          });

          // Incrementar el saldo esperado de la caja abierta
          await tx.cashRegister.update({
            where: { id: activeRegister.id, tenantId },
            data: {
              expectedBalance: { increment: finalTotal }
            }
          });
        }
      }

      return created;
    });

    res.status(201).json({ message: 'Invoice created successfully.', invoice });
  } catch (error: any) {
    const isCouponError = [
      'El cupón provisto no existe.',
      'El cupón no está activo.',
      'El cupón ha expirado o aún no está vigente.',
      'El cupón ha alcanzado su límite de usos.',
      'El subtotal mínimo requerido para aplicar este cupón'
    ].some(msg => error.message?.includes(msg));

    const statusCode = isCouponError ? 400 : 500;
    res.status(statusCode).json({ error: error.message || 'Error creating invoice.' });
  }
};

export const getPatientInvoices = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { patientId } = req.params;
    const tenantId = req.user!.tenantId;

    const patient = await prisma.patient.findFirst({ where: { id: String(patientId), tenantId } });
    if (!patient) {
      res.status(404).json({ error: 'Patient not found in this clinic.' });
      return;
    }

    const invoices = await prisma.invoice.findMany({
      where: { patientId: String(patientId), tenantId },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, unit: true } },
          },
        },
      },
      orderBy: { paidAt: 'desc' },
    });

    res.json(invoices);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error fetching patient invoices.' });
  }
};

export const updateInvoice = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { paymentMethod, reference, status, subtotal, tax, total } = req.body;
    const tenantId = req.user!.tenantId;

    const existing = await prisma.invoice.findFirst({
      where: { id: String(id), tenantId }
    });

    if (!existing) {
      res.status(404).json({ error: 'Invoice not found.' });
      return;
    }

    if (paymentMethod && !Object.values(PaymentMethod).includes(paymentMethod as PaymentMethod)) {
      res.status(400).json({ error: `Invalid paymentMethod. Valid values: ${Object.values(PaymentMethod).join(', ')}` });
      return;
    }

    if (status && !Object.values(InvoiceStatus).includes(status as InvoiceStatus)) {
      res.status(400).json({ error: `Invalid status. Valid values: ${Object.values(InvoiceStatus).join(', ')}` });
      return;
    }

    const updated = await prisma.invoice.update({
      where: { id: String(id), tenantId },
      data: {
        ...(paymentMethod && { paymentMethod: paymentMethod as PaymentMethod }),
        ...(reference !== undefined && { reference }),
        ...(status && { status: status as InvoiceStatus }),
        ...(subtotal !== undefined && { subtotal: Number(subtotal) }),
        ...(tax !== undefined && { tax: Number(tax) }),
        ...(total !== undefined && { total: Number(total) }),
      },
      include: {
        patient: { select: { id: true, fullName: true } },
        items: { include: { product: { select: { id: true, name: true } } } },
      }
    });

    res.json({ message: 'Invoice updated successfully.', invoice: updated });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error updating invoice.' });
  }
};

export const voidInvoice = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    const existing = await prisma.invoice.findFirst({
      where: { id: String(id), tenantId },
      include: { cashMovement: true }
    });

    if (!existing) {
      res.status(404).json({ error: 'Invoice not found.' });
      return;
    }

    if (existing.status === InvoiceStatus.CANCELADO) {
      res.status(400).json({ error: 'La factura ya se encuentra anulada.' });
      return;
    }

    const voided = await prisma.$transaction(async (tx) => {
      // Update invoice status to CANCELADO
      const updatedInvoice = await tx.invoice.update({
        where: { id: String(id), tenantId },
        data: { status: InvoiceStatus.CANCELADO },
        include: {
          patient: { select: { id: true, fullName: true } },
          items: true,
        }
      });

      // If invoice was paid and had cash movement, adjust cash register if open
      if (existing.status === InvoiceStatus.PAGADO && existing.cashMovement) {
        const cashReg = await tx.cashRegister.findFirst({
          where: { id: existing.cashMovement.cashRegisterId, status: CashStatus.OPEN, tenantId }
        });

        if (cashReg) {
          await tx.cashRegister.update({
            where: { id: cashReg.id, tenantId },
            data: {
              expectedBalance: { decrement: existing.total }
            }
          });
        }
      }

      return updatedInvoice;
    });

    res.json({ message: 'Invoice voided successfully.', invoice: voided });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error voiding invoice.' });
  }
};

