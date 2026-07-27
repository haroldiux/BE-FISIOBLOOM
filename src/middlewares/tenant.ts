import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { tenantContext } from '../services/tenantContext';
import prisma from '../services/prisma';
import { Request } from 'express';

export interface TenantRequest extends Request {
  tenantId?: string;
  branchId?: string;
}

export const tenantMiddleware = async (
  req: TenantRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const tenantIdHeader = req.headers['x-tenant-id'] as string;
  const branchIdHeader = req.headers['x-branch-id'] as string;

  let tenantId: string | undefined = tenantIdHeader;
  let branchId: string | undefined = branchIdHeader;

  // Resolving tenant slug query param for public portal
  const tenantSlug = req.query.tenant as string;
  if (!tenantId && tenantSlug) {
    try {
      const t = await prisma.tenant.findUnique({
        where: { slug: tenantSlug },
      });
      if (t) {
        tenantId = t.id;
      }
    } catch (e) {
      console.error("Error resolving tenant slug:", e);
    }
  }

  // Si no hay cabecera pero hay token Bearer, intentamos decodificarlo para obtener el tenantId
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    try {
      const token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.decode(token) as { tenantId?: string; branchId?: string; role?: string } | null;
      if (!tenantId && decoded?.tenantId) {
        tenantId = decoded.tenantId;
      }
      // Aislamiento entre sucursales: solo SUPER_ADMIN puede pedir ver una
      // sucursal distinta a la suya (o todas) mandando la cabecera X-Branch-ID.
      // Cualquier otro rol queda siempre atado a su propia sucursal, sin
      // importar qué venga en la cabecera/localStorage del cliente.
      // El Súper Admin no pertenece a ninguna sucursal en particular: si no
      // manda X-Branch-ID explícito, ve "todas" (branchId queda sin definir),
      // sin caer nunca en un branchId propio guardado por accidente.
      if (decoded?.role !== 'SUPER_ADMIN') {
        branchId = decoded?.branchId || undefined;
      }
    } catch (e) {
      // Ignorar error de decodificación, el middleware de autenticación lo validará
    }
  }

  // Rutas públicas que no requieren tenantId de inmediato
  const isPublicRoute =
    req.path === '/api/auth/login' ||
    req.path === '/api/health' ||
    req.path.startsWith('/api/health') ||
    req.path === '/api/auth/register' ||
    req.path.startsWith('/api/public') ||
    req.path === '/api/whatsapp/webhook';

  if (!tenantId) {
    if (isPublicRoute) {
      tenantContext.run({}, () => next());
      return;
    }
    res.status(400).json({ error: 'Falta la cabecera x-tenant-id.' });
    return;
  }

  try {
    // Validar existencia del Tenant en la base de datos
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      res.status(403).json({ error: 'Tenant no válido o inexistente.' });
      return;
    }

    if (!tenant.isActive) {
      res.status(403).json({ error: 'El Tenant se encuentra desactivado.' });
      return;
    }

    // Ejecutar la petición dentro del contexto del tenant
    tenantContext.run({ tenantId, branchId }, () => {
      req.tenantId = tenantId;
      if (branchId) {
        req.branchId = branchId;
      }
      next();
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error interno al validar el tenant.' });
  }
};
