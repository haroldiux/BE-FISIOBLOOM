import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import prisma from '../services/prisma';
import { Request } from 'express';

// Define the interface extending the base Request
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: Role;
    tenantId: string;
    branchId?: string;
  };
}

export const requireAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key-12345';
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Acceso denegado. No se proporcionó un token.' });
      return;
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const userId = decoded.userId || decoded.id;

    if (!userId) {
      res.status(401).json({ error: 'Token inválido.' });
      return;
    }

    // Fetch user from DB to ensure they still exist and are active
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      res.status(401).json({ error: 'Usuario no encontrado.' });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({ error: 'La cuenta de usuario está desactivada.' });
      return;
    }

    // Attach user to request
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      branchId: user.branchId || undefined,
    };

    next();
  } catch (error: any) {
    console.error('DEBUG REQUIREAUTH ERROR:', error.message || error);
    res.status(401).json({ error: 'Token inválido o expirado.', details: error.message });
  }
};

export const requireRole = (allowedRoles: Role[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'No autorizado.' });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: 'Permisos insuficientes.' });
      return;
    }

    next();
  };
};
