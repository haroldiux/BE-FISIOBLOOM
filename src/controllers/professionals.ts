import { Response } from 'express';
import bcrypt from 'bcrypt';
import { Role } from '@prisma/client';
import prisma from '../services/prisma';
import { AuthenticatedRequest } from '../middlewares/auth';
import { checkActiveShift } from '../services/shift.service';

export const getAll = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    // List all users for the current tenant, excluding passwords
    const professionals = await prisma.user.findMany({
      where: {
        tenantId: _req.user!.tenantId,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        accountLocked: true,
        workingHours: true,
        createdAt: true,
        updatedAt: true,
        scheduleExceptions: true,
        staffProfile: {
          select: {
            contractType: true,
            baseSalary: true,
            commissionRate: true,
            salesTarget: true,
          }
        }
      },
      orderBy: {
        name: 'asc',
      },
    });

    const isPrivileged = ['ADMIN', 'SUPER_ADMIN'].includes(_req.user?.role || '');
    const tenantId = _req.user!.tenantId;

    // Para fisios/esteticistas, se informa si están "en turno" ahora mismo
    // (tienen horario hoy y ya ficharon entrada) — así el calendario puede
    // ocultarlos de la lista de "Nueva Cita" si no están realmente trabajando.
    const professionalsWithShift = await Promise.all(
      professionals.map(async (prof) => {
        if (prof.role !== Role.PHYSIO && prof.role !== Role.AESTHETICIAN) {
          return { ...prof, isAvailableNow: true };
        }
        const shift = await checkActiveShift(prof.id, tenantId);
        return { ...prof, isAvailableNow: shift.ok };
      })
    );

    const sanitizedProfessionals = professionalsWithShift.map((prof) => {
      if (!isPrivileged && prof.staffProfile) {
        const { baseSalary, commissionRate, salesTarget, ...restStaff } = prof.staffProfile as any;
        return {
          ...prof,
          staffProfile: restStaff,
        };
      }
      return prof;
    });

    res.json(sanitizedProfessionals);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred fetching professionals.' });
  }
};

export const update = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, email, role, isActive, password, workingHours, contractType, baseSalary, commissionRate, salesTarget } = req.body;

    if (!req.user) {
      res.status(401).json({ error: 'No autorizado.' });
      return;
    }

    // Check if user is ADMIN or updating their own profile
    if (req.user.role !== Role.ADMIN && req.user.id !== id) {
      res.status(403).json({ error: 'Acceso denegado. Solo podés actualizar tu propio perfil.' });
      return;
    }

    // Check if target user exists and belongs to the same tenant
    const existingUser = await prisma.user.findFirst({
      where: { id: id as string, tenantId: req.user!.tenantId },
    });

    if (!existingUser) {
      res.status(404).json({ error: 'Profesional no encontrado.' });
      return;
    }

    // Prepare update data
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (workingHours !== undefined) updateData.workingHours = workingHours;

    // Only ADMIN can change role or isActive status
    if (req.user.role === Role.ADMIN) {
      if (role !== undefined) {
        if (!Object.values(Role).includes(role as Role)) {
          res.status(400).json({ error: 'Rol inválido.' });
          return;
        }
        updateData.role = role as Role;
      }
      if (isActive !== undefined) {
        updateData.isActive = isActive;
      }
      // El admin puede restablecerle la contraseña a otro trabajador (ej.
      // cuenta bloqueada por intentos fallidos). Al hacerlo, se desbloquea la
      // cuenta también — no tendría sentido darle una contraseña nueva y
      // dejarlo igual bloqueado.
      if (password !== undefined) {
        if (password.length < 8) {
          res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
          return;
        }
        updateData.password = await bcrypt.hash(password, 10);
        updateData.accountLocked = false;
        updateData.failedLoginAttempts = 0;
      }
    }

    if (contractType !== undefined || baseSalary !== undefined || commissionRate !== undefined || salesTarget !== undefined) {
      await prisma.staffProfile.upsert({
        where: { userId: id as string },
        update: {
          ...(contractType !== undefined && { contractType }),
          ...(baseSalary !== undefined && { baseSalary: Number(baseSalary) }),
          ...(commissionRate !== undefined && { commissionRate: Number(commissionRate) }),
          ...(salesTarget !== undefined && { salesTarget: salesTarget !== null ? Number(salesTarget) : null }),
        },
        create: {
          tenantId: req.user!.tenantId,
          userId: id as string,
          contractType: contractType || 'FIXED',
          baseSalary: baseSalary !== undefined ? Number(baseSalary) : 0,
          commissionRate: commissionRate !== undefined ? Number(commissionRate) : 0,
          salesTarget: salesTarget !== undefined && salesTarget !== null ? Number(salesTarget) : null,
        },
      });
    }

    const updatedUser = await prisma.user.update({
      where: { id: id as string },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        accountLocked: true,
        workingHours: true,
        updatedAt: true,
        scheduleExceptions: true,
        staffProfile: {
          select: {
            contractType: true,
            baseSalary: true,
            commissionRate: true,
            salesTarget: true,
          }
        }
      },
    });

    res.json({
      message: 'Professional updated successfully.',
      user: updatedUser,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred during update.' });
  }
};

export const deleteProfessional = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Check if target user exists and belongs to the same tenant
    const existingUser = await prisma.user.findFirst({
      where: { id: id as string, tenantId: req.user!.tenantId },
    });

    if (!existingUser) {
      res.status(404).json({ error: 'Profesional no encontrado.' });
      return;
    }

    // Deactivate user (soft delete to keep referential integrity for appointments)
    const deactivatedUser = await prisma.user.update({
      where: { id: id as string },
      data: { isActive: false },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
      },
    });

    res.json({
      message: 'Professional deactivated successfully.',
      user: deactivatedUser,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred during deactivation.' });
  }
};

export const updateWorkingHours = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { workingHours, scheduleExceptions } = req.body;

    if (!req.user) {
      res.status(401).json({ error: 'No autorizado.' });
      return;
    }

    // Check if user is ADMIN or updating their own profile
    if (req.user.role !== Role.ADMIN && req.user.id !== id) {
      res.status(403).json({ error: 'Acceso denegado. Solo podés actualizar tu propio perfil.' });
      return;
    }

    // Check if target user exists and belongs to the same tenant
    const existingUser = await prisma.user.findFirst({
      where: { id: id as string, tenantId: req.user!.tenantId },
    });

    if (!existingUser) {
      res.status(404).json({ error: 'Profesional no encontrado.' });
      return;
    }

    // Prepare update data
    const updateData: any = {};
    if (workingHours !== undefined) {
      updateData.workingHours = workingHours;
    }

    // Update the user
    const updatedUser = await prisma.user.update({
      where: { id: id as string },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        workingHours: true,
        updatedAt: true,
      },
    });

    // Handle schedule exceptions if provided
    if (Array.isArray(scheduleExceptions)) {
      for (const exception of scheduleExceptions) {
        const { date, isAvailable, startTime, endTime, reason } = exception;
        if (exception.id) {
          await prisma.scheduleException.upsert({
            where: { id: exception.id },
            update: {
              date: new Date(date),
              isAvailable: isAvailable ?? false,
              startTime: startTime || null,
              endTime: endTime || null,
              reason: reason || null,
            },
            create: {
              id: exception.id,
              tenantId: req.user!.tenantId,
              professionalId: String(id),
              date: new Date(date),
              isAvailable: isAvailable ?? false,
              startTime: startTime || null,
              endTime: endTime || null,
              reason: reason || null,
            },
          });
        } else {
          await prisma.scheduleException.create({
            data: {
              tenantId: req.user!.tenantId,
              professionalId: String(id),
              date: new Date(date),
              isAvailable: isAvailable ?? false,
              startTime: startTime || null,
              endTime: endTime || null,
              reason: reason || null,
            },
          });
        }
      }
    }

    res.json({
      message: 'Working hours updated successfully.',
      user: updatedUser,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred during update.' });
  }
};

export const addException = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params; // professionalId
    const { date, isAvailable, startTime, endTime, reason } = req.body;
    const tenantId = req.user!.tenantId;

    if (!date) {
      res.status(400).json({ error: 'La fecha (date) es obligatoria.' });
      return;
    }

    // Verify user exists and belongs to tenant
    const professional = await prisma.user.findFirst({
      where: { id: String(id), tenantId }
    });

    if (!professional) {
      res.status(404).json({ error: 'Profesional no encontrado.' });
      return;
    }

    const exception = await prisma.scheduleException.create({
      data: {
        tenantId,
        professionalId: String(id),
        date: new Date(date),
        isAvailable: isAvailable !== undefined ? Boolean(isAvailable) : false,
        startTime: startTime || null,
        endTime: endTime || null,
        reason: reason || null,
      }
    });

    res.status(201).json({ message: 'Schedule exception created successfully.', exception });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error creating schedule exception.' });
  }
};

export const deleteException = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params; // exception id
    const tenantId = req.user!.tenantId;

    // Verify exception exists and belongs to tenant
    const exception = await prisma.scheduleException.findFirst({
      where: { id: String(id), tenantId }
    });

    if (!exception) {
      res.status(404).json({ error: 'Excepción de horario no encontrada.' });
      return;
    }

    await prisma.scheduleException.delete({
      where: { id: String(id) }
    });

    res.json({ message: 'Schedule exception deleted successfully.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error deleting schedule exception.' });
  }
};

export const create = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { name, email, password, role, workingHours, baseSalary, commissionRate, contractType, branchId: requestedBranchId } = req.body;
    const tenantId = req.user!.tenantId;
    const requesterRole = req.user!.role;

    if (!name || !email || !password) {
      res.status(400).json({ error: 'name, email y password son obligatorios.' });
      return;
    }

    const resolvedRole = (role as Role) || Role.PHYSIO;

    // Un Admin de sucursal solo puede crear trabajadores de su equipo, nunca
    // otro Admin ni un Super Admin. Solo el Súper Admin puede crear Admins.
    const rolesAllowedForAdmin: Role[] = [Role.PHYSIO, Role.AESTHETICIAN, Role.RECEPTIONIST];
    if (requesterRole === Role.ADMIN && !rolesAllowedForAdmin.includes(resolvedRole)) {
      res.status(403).json({ error: 'Un administrador no puede crear otro administrador. Esa acción es exclusiva del Súper Admin.' });
      return;
    }
    if (requesterRole === Role.SUPER_ADMIN && resolvedRole === Role.SUPER_ADMIN) {
      res.status(403).json({ error: 'No se pueden crear más cuentas de Súper Admin desde aquí.' });
      return;
    }

    // El Super Admin (sin sucursal propia) debe indicar a qué sucursal pertenece
    // el nuevo usuario. Un Admin de sucursal siempre usa la suya propia (ya
    // queda fijada por el middleware de tenant/sucursal).
    let branchIdForNewUser: string | undefined = req.user!.branchId;
    if (requesterRole === Role.SUPER_ADMIN) {
      if (!requestedBranchId) {
        res.status(400).json({ error: 'branchId es obligatorio para que el Súper Admin cree un usuario.' });
        return;
      }
      const branch = await prisma.branch.findFirst({ where: { id: requestedBranchId, tenantId } });
      if (!branch) {
        res.status(404).json({ error: 'La sucursal indicada no existe en esta clínica.' });
        return;
      }
      branchIdForNewUser = branch.id;
    }

    const existingUser = await prisma.user.findFirst({
      where: { email, tenantId }
    });

    if (existingUser) {
      res.status(400).json({ error: 'Un usuario con este email ya existe en esta clínica.' });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await prisma.user.create({
      data: {
        tenantId,
        branchId: branchIdForNewUser,
        name,
        email,
        password: hashedPassword,
        role: resolvedRole,
        workingHours: workingHours || undefined,
        isActive: true,
        ...((baseSalary !== undefined || commissionRate !== undefined || contractType) && {
          staffProfile: {
            create: {
              tenantId,
              baseSalary: baseSalary ? Number(baseSalary) : 0,
              commissionRate: commissionRate ? Number(commissionRate) : 0,
              contractType: contractType || 'FIXED'
            }
          }
        })
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        workingHours: true,
        createdAt: true,
        staffProfile: true
      }
    });

    res.status(201).json({ message: 'Professional created successfully.', user: newUser });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred creating professional.' });
  }
};

export const getById = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    const professional = await prisma.user.findFirst({
      where: { id: String(id), tenantId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        accountLocked: true,
        workingHours: true,
        createdAt: true,
        updatedAt: true,
        scheduleExceptions: true,
        staffProfile: {
          select: {
            contractType: true,
            baseSalary: true,
            commissionRate: true,
            salesTarget: true,
          }
        }
      }
    });

    if (!professional) {
      res.status(404).json({ error: 'Profesional no encontrado.' });
      return;
    }

    const isPrivileged = ['ADMIN', 'SUPER_ADMIN'].includes(req.user?.role || '');
    if (!isPrivileged && professional.staffProfile) {
      const { baseSalary, commissionRate, salesTarget, ...restStaff } = professional.staffProfile as any;
      professional.staffProfile = restStaff;
    }

    res.json(professional);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred fetching professional.' });
  }
};

export const reactivateProfessional = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    const existingUser = await prisma.user.findFirst({
      where: { id: String(id), tenantId }
    });

    if (!existingUser) {
      res.status(404).json({ error: 'Profesional no encontrado.' });
      return;
    }

    const reactivatedUser = await prisma.user.update({
      where: { id: String(id) },
      data: { isActive: true },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
      }
    });

    res.json({ message: 'Professional reactivated successfully.', user: reactivatedUser });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred during reactivation.' });
  }
};

/**
 * Desbloquea una cuenta bloqueada por 3 intentos fallidos de login (ver
 * POST /auth/login). Solo ADMIN. Reinicia el contador de intentos — el
 * trabajador puede volver a intentar entrar con su misma contraseña.
 */
export const unlockProfessional = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    const existingUser = await prisma.user.findFirst({
      where: { id: String(id), tenantId },
    });

    if (!existingUser) {
      res.status(404).json({ error: 'Profesional no encontrado.' });
      return;
    }

    const unlockedUser = await prisma.user.update({
      where: { id: String(id) },
      data: { accountLocked: false, failedLoginAttempts: 0 },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        accountLocked: true,
      },
    });

    res.json({ message: 'Cuenta desbloqueada con éxito.', user: unlockedUser });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred unlocking the account.' });
  }
};


