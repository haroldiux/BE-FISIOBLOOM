import { Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import prisma from '../services/prisma';
import { AuthenticatedRequest } from '../middlewares/auth';

export const register = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { email, password, name, role, tenantName, tenantSlug, branchId } = req.body;

    if (!email || !password || !name || !role) {
      res.status(400).json({ error: 'Todos los campos (email, password, name, role) son obligatorios.' });
      return;
    }

    // Validate role
    if (!Object.values(Role).includes(role as Role)) {
      res.status(400).json({ error: `Rol inválido. Roles permitidos: ${Object.values(Role).join(', ')}` });
      return;
    }

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: { email },
    });

    if (existingUser) {
      res.status(400).json({ error: 'Ya existe un usuario con ese email.' });
      return;
    }

    let tenantId = req.user?.tenantId;

    // Si no está autenticado, permitimos crear un nuevo Tenant (registro inicial de SaaS)
    if (!tenantId) {
      if (!tenantName || !tenantSlug) {
        res.status(400).json({ error: 'tenantName y tenantSlug son obligatorios para registrar una nueva clínica.' });
        return;
      }

      const existingTenant = await prisma.tenant.findUnique({
        where: { slug: tenantSlug },
      });

      if (existingTenant) {
        res.status(400).json({ error: 'Ya existe una clínica con ese slug.' });
        return;
      }

      const newTenant = await prisma.tenant.create({
        data: {
          name: tenantName,
          slug: tenantSlug,
        },
      });
      tenantId = newTenant.id;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user and staff profile
    const newUser = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
          role: role as Role,
          tenantId,
          branchId: branchId || null,
        },
      });

      await tx.staffProfile.create({
        data: {
          tenantId,
          userId: u.id,
          baseSalary: req.body.baseSalary ? Number(req.body.baseSalary) : 0,
          commissionRate: req.body.commissionRate ? Number(req.body.commissionRate) : 0,
          contractType: req.body.contractType || 'FIXED',
        },
      });

      return tx.user.findUnique({
        where: { id: u.id },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          tenantId: true,
          branchId: true,
          createdAt: true,
          staffProfile: {
            select: {
              contractType: true,
              baseSalary: true,
              commissionRate: true,
            }
          }
        }
      });
    });

    res.status(201).json({
      message: 'User registered successfully.',
      user: newUser,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred during registration.' });
  }
};

export const login = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key-12345';
  const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'El email y la contraseña son obligatorios.' });
      return;
    }

    // Find user (búsqueda global ya que el contexto aún no tiene tenantId)
    const user = await prisma.user.findFirst({
      where: { email },
    });

    if (!user || !user.isActive) {
      res.status(401).json({ error: 'Email o contraseña inválidos.' });
      return;
    }

    // Cuenta bloqueada por 3 intentos fallidos seguidos — solo un ADMIN puede
    // desbloquearla (ver PATCH /professionals/:id/unlock). No se cuenta este
    // intento como uno más: ya está bloqueada, no hace falta seguir sumando.
    if (user.accountLocked) {
      res.status(403).json({ error: 'Tu cuenta fue bloqueada por 3 intentos fallidos de inicio de sesión. Comunicate con el administrador para que restablezca tu acceso.' });
      return;
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      const newAttempts = user.failedLoginAttempts + 1;
      const shouldLock = newAttempts >= 3;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: newAttempts,
          accountLocked: shouldLock,
        },
      });

      if (shouldLock) {
        res.status(403).json({ error: 'Tu cuenta fue bloqueada por 3 intentos fallidos de inicio de sesión. Comunicate con el administrador para que restablezca tu acceso.' });
        return;
      }

      res.status(401).json({ error: 'Email o contraseña inválidos.' });
      return;
    }

    // Login correcto: si venía con intentos fallidos previos sin llegar a
    // bloquearse, se limpia el contador.
    if (user.failedLoginAttempts > 0) {
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0 },
      });
    }

    // Generate JWT including tenantId and branchId
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        branchId: user.branchId || undefined,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN as any }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
        branchId: user.branchId || undefined,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred during login.' });
  }
};

export const me = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'No autorizado.' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        tenantId: true,
        branchId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: 'Usuario no encontrado.' });
      return;
    }

    res.json(user);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred fetching user profile.' });
  }
};

export const updateProfile = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'No autorizado.' });
      return;
    }

    const { name, email, password } = req.body;

    if (!name || !email) {
      res.status(400).json({ error: 'El nombre y el correo electrónico son obligatorios.' });
      return;
    }

    // Check if email already in use
    const duplicateEmail = await prisma.user.findFirst({
      where: {
        email,
        id: { not: req.user.id },
      },
    });

    if (duplicateEmail) {
      res.status(400).json({ error: 'El correo electrónico ya está en uso por otro usuario.' });
      return;
    }

    const updateData: any = {
      name,
      email,
    };

    if (password) {
      if (password.length < 8) {
        res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
        return;
      }
      updateData.password = await bcrypt.hash(password, 10);
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        tenantId: true,
        branchId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json({
      message: 'Perfil actualizado con éxito.',
      user: updatedUser,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al actualizar el perfil.' });
  }
};

