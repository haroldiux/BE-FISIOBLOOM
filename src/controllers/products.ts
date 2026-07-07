import { Response } from 'express';
import prisma from '../services/prisma';
import { AuthenticatedRequest } from '../middlewares/auth';

export const getAll = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { category, search } = req.query;
    const tenantId = req.user!.tenantId;

    const where: any = { isActive: true, tenantId };

    if (category) {
      where.category = category as string;
    }

    if (search) {
      where.name = { contains: search as string, mode: 'insensitive' };
    }

    const products = await prisma.product.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    res.json(products);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error fetching products.' });
  }
};

export const create = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { name, category, price, stock, unit } = req.body;
    const tenantId = req.user!.tenantId;

    if (!name || !category || price === undefined) {
      res.status(400).json({ error: 'name, category, and price are required.' });
      return;
    }

    const product = await prisma.product.create({
      data: {
        name,
        category,
        price: Number(price),
        stock: stock !== undefined ? Number(stock) : 0,
        unit: unit || 'unidad',
        tenantId,
      },
    });

    res.status(201).json({ message: 'Product created successfully.', product });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error creating product.' });
  }
};

export const update = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, category, price, stock, unit, isActive } = req.body;
    const tenantId = req.user!.tenantId;

    const existing = await prisma.product.findFirst({ where: { id: String(id), tenantId } });
    if (!existing) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }

    const product = await prisma.product.update({
      where: { id: String(id), tenantId },
      data: {
        ...(name !== undefined && { name }),
        ...(category !== undefined && { category }),
        ...(price !== undefined && { price: Number(price) }),
        ...(stock !== undefined && { stock: Number(stock) }),
        ...(unit !== undefined && { unit }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    res.json({ message: 'Product updated successfully.', product });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error updating product.' });
  }
};

export const remove = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    const existing = await prisma.product.findFirst({ where: { id: String(id), tenantId } });
    if (!existing) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }

    // Soft delete
    await prisma.product.update({
      where: { id: String(id), tenantId },
      data: { isActive: false },
    });

    res.json({ message: 'Product deactivated successfully.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error deactivating product.' });
  }
};

export const getLowStock = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;

    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        stock: { lt: 5 },
        tenantId,
      },
      orderBy: { stock: 'asc' },
    });

    res.json(products);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error fetching low stock products.' });
  }
};

export const getMovements = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { productId, type } = req.query;
    const tenantId = req.user!.tenantId;

    const where: any = { tenantId };
    if (productId) {
      where.productId = String(productId);
    }
    if (type) {
      where.type = type as any;
    }

    const movements = await prisma.inventoryMovement.findMany({
      where,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            unit: true,
          }
        },
        appointment: {
          select: {
            id: true,
            dateTime: true,
            patient: {
              select: {
                id: true,
                fullName: true,
              }
            },
            service: {
              select: {
                id: true,
                name: true,
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(movements);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al obtener el historial de movimientos.' });
  }
};

export const adjustStock = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    const { quantity, type, notes } = req.body;
    const tenantId = req.user!.tenantId;

    if (quantity === undefined || !type) {
      res.status(400).json({ error: 'quantity and type are required.' });
      return;
    }

    if (type !== 'STOCK_IN' && type !== 'STOCK_OUT') {
      res.status(400).json({ error: 'type must be either STOCK_IN or STOCK_OUT.' });
      return;
    }

    const qty = Number(quantity);
    if (isNaN(qty) || qty <= 0) {
      res.status(400).json({ error: 'quantity must be a positive number.' });
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      // Leer el producto dentro de la transacción para evitar condiciones de carrera
      const product = await tx.product.findFirst({
        where: { id: String(id), tenantId },
      });

      if (!product) {
        throw new Error('PRODUCT_NOT_FOUND');
      }

      const stockDiff = type === 'STOCK_IN' ? Math.round(qty) : -Math.round(qty);
      const newStock = product.stock + stockDiff;

      if (newStock < 0) {
        throw new Error('STOCK_NEGATIVE');
      }

      // Create movement
      const movement = await tx.inventoryMovement.create({
        data: {
          productId: String(id),
          type,
          quantity: Math.round(qty),
          notes: notes || 'Ajuste manual de stock',
          tenantId,
        }
      });

      // Update product stock
      const updatedProduct = await tx.product.update({
        where: { id: String(id), tenantId },
        data: {
          stock: newStock
        }
      });

      return { product: updatedProduct, movement };
    });

    res.json(result);
  } catch (error: any) {
    if (error.message === 'PRODUCT_NOT_FOUND') {
      res.status(404).json({ error: 'Product not found.' });
    } else if (error.message === 'STOCK_NEGATIVE') {
      res.status(400).json({ error: 'El stock resultante no puede ser negativo.' });
    } else {
      res.status(500).json({ error: error.message || 'Error al ajustar el stock.' });
    }
  }
};
