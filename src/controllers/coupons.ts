import { Response } from 'express';
import { DiscountType } from '@prisma/client';
import prisma from '../services/prisma';
import { AuthenticatedRequest } from '../middlewares/auth';

export const validateCoupon = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { code, subtotal } = req.body;

    if (!code || subtotal === undefined) {
      res.status(400).json({ error: 'El código del cupón y el subtotal son requeridos.' });
      return;
    }

    const coupon = await prisma.coupon.findUnique({
      where: { code: String(code).trim().toUpperCase() }
    });

    if (!coupon) {
      res.status(404).json({ error: 'Cupón no encontrado.' });
      return;
    }

    if (!coupon.isActive) {
      res.status(400).json({ error: 'El cupón no está activo.' });
      return;
    }

    const now = new Date();
    if (now < new Date(coupon.startDate) || now > new Date(coupon.endDate)) {
      res.status(400).json({ error: 'El cupón ha expirado o aún no está vigente.' });
      return;
    }

    if (coupon.usedCount >= coupon.maxUses) {
      res.status(400).json({ error: 'El cupón ha superado el límite máximo de usos.' });
      return;
    }

    if (Number(subtotal) < coupon.minSubtotal) {
      res.status(400).json({
        error: `El subtotal mínimo requerido para aplicar este cupón es de $${coupon.minSubtotal}.`
      });
      return;
    }

    let discountAmount = 0;
    if (coupon.discountType === DiscountType.PERCENTAGE) {
      discountAmount = Number(subtotal) * (coupon.discountValue / 100);
    } else if (coupon.discountType === DiscountType.FIXED) {
      discountAmount = coupon.discountValue;
    }

    // El descuento no puede superar el subtotal
    discountAmount = Math.min(discountAmount, Number(subtotal));

    res.json({
      valid: true,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      discountAmount
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al validar el cupón.' });
  }
};

export const getAllCoupons = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const coupons = await prisma.coupon.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(coupons);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al obtener los cupones.' });
  }
};

export const createCoupon = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const {
      code,
      description,
      discountType,
      discountValue,
      minSubtotal,
      startDate,
      endDate,
      maxUses,
      isActive
    } = req.body;

    if (!code || !discountType || discountValue === undefined || !startDate || !endDate || maxUses === undefined) {
      res.status(400).json({ error: 'Los campos code, discountType, discountValue, startDate, endDate y maxUses son requeridos.' });
      return;
    }

    const formattedCode = String(code).trim().toUpperCase();
    const existing = await prisma.coupon.findUnique({
      where: { code: formattedCode }
    });

    if (existing) {
      res.status(400).json({ error: 'Ya existe un cupón con este código.' });
      return;
    }

    const coupon = await prisma.coupon.create({
      data: {
        code: formattedCode,
        description,
        discountType: discountType as DiscountType,
        discountValue: Number(discountValue),
        minSubtotal: minSubtotal !== undefined ? Number(minSubtotal) : 0,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        maxUses: Number(maxUses),
        isActive: isActive !== undefined ? !!isActive : true
      }
    });

    res.status(201).json(coupon);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al crear el cupón.' });
  }
};

export const updateCoupon = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      code,
      description,
      discountType,
      discountValue,
      minSubtotal,
      startDate,
      endDate,
      maxUses,
      isActive
    } = req.body;

    const existing = await prisma.coupon.findUnique({ where: { id: String(id) } });
    if (!existing) {
      res.status(404).json({ error: 'Cupón no encontrado.' });
      return;
    }

    let formattedCode;
    if (code !== undefined) {
      formattedCode = String(code).trim().toUpperCase();
      if (formattedCode !== existing.code) {
        const duplicate = await prisma.coupon.findUnique({ where: { code: formattedCode } });
        if (duplicate) {
          res.status(400).json({ error: 'Ya existe otro cupón con este código.' });
          return;
        }
      }
    }

    const coupon = await prisma.coupon.update({
      where: { id: String(id) },
      data: {
        ...(formattedCode !== undefined && { code: formattedCode }),
        ...(description !== undefined && { description }),
        ...(discountType !== undefined && { discountType: discountType as DiscountType }),
        ...(discountValue !== undefined && { discountValue: Number(discountValue) }),
        ...(minSubtotal !== undefined && { minSubtotal: Number(minSubtotal) }),
        ...(startDate !== undefined && { startDate: new Date(startDate) }),
        ...(endDate !== undefined && { endDate: new Date(endDate) }),
        ...(maxUses !== undefined && { maxUses: Number(maxUses) }),
        ...(isActive !== undefined && { isActive: !!isActive })
      }
    });

    res.json(coupon);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al actualizar el cupón.' });
  }
};

export const deleteCoupon = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const existing = await prisma.coupon.findUnique({ where: { id: String(id) } });
    if (!existing) {
      res.status(404).json({ error: 'Cupón no encontrado.' });
      return;
    }

    await prisma.coupon.delete({ where: { id: String(id) } });
    res.json({ message: 'Cupón eliminado exitosamente.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al eliminar el cupón.' });
  }
};
