import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth';
import { evaluateShift } from '../services/shift.service';

/**
 * Antes de dejar que fisios, esteticistas o recepción registren/editen
 * cualquier cosa (citas, pacientes, cobros, etc.), exige que:
 *   1) Tengan turno asignado hoy (según su horario laboral o una excepción), y
 *   2) Ya hayan fichado su entrada del día (y no la hayan cerrado con salida).
 * Si no se cumple, se bloquea con un mensaje claro en vez de dejar pasar la
 * acción silenciosamente. Admin/súper admin quedan siempre exentos (ver
 * GATED_ROLES en shift.service.ts).
 */
export const requireActiveShift = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      next();
      return;
    }

    const result = await evaluateShift(req.user.id, req.user.tenantId, req.user.role);
    if (!result.ok) {
      res.status(403).json({ error: result.message });
      return;
    }

    next();
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al verificar el turno activo.' });
  }
};
