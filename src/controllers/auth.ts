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
      res.status(400).json({ error: 'All fields (email, password, name, role) are required.' });
      return;
    }

    // Validate role
    if (!Object.values(Role).includes(role as Role)) {
      res.status(400).json({ error: `Invalid role. Allowed roles are: ${Object.values(Role).join(', ')}` });
      return;
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      res.status(400).json({ error: 'User with this email already exists.' });
      return;
    }

    let tenantId = req.user?.tenantId;

    // Si no está autenticado, permitimos crear un nuevo Tenant (registro inicial de SaaS)
    if (!tenantId) {
      if (!tenantName || !tenantSlug) {
        res.status(400).json({ error: 'tenantName and tenantSlug are required for new tenant registration.' });
        return;
      }

      const existingTenant = await prisma.tenant.findUnique({
        where: { slug: tenantSlug },
      });

      if (existingTenant) {
        res.status(400).json({ error: 'Tenant with this slug already exists.' });
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
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    // Find user (búsqueda global ya que el contexto aún no tiene tenantId)
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.isActive) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
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
      res.status(401).json({ error: 'Unauthorized.' });
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
      res.status(404).json({ error: 'User not found.' });
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
      res.status(401).json({ error: 'Unauthorized.' });
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

