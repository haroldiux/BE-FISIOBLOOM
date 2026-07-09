import { Response } from 'express';
import prisma from '../services/prisma';
import { AuthenticatedRequest } from '../middlewares/auth';
import { encrypt } from '../services/crypto';

export const ALLOWED_PALETTES = [
  'aura',
  'bloom',
  'ocean',
  'sunset',
  'berry',
  'tropical',
] as const;

export type Palette = (typeof ALLOWED_PALETTES)[number];

const DEFAULT_PALETTE: Palette = 'aura';

const isAllowedPalette = (value: unknown): value is Palette =>
  typeof value === 'string' &&
  (ALLOWED_PALETTES as readonly string[]).includes(value);

export const getSettings = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });

    if (!tenant) {
      res.status(404).json({ error: 'Tenant not found.' });
      return;
    }

    const currentSettings = (tenant.settings as any) || {};
    
    // Enmascarar apiToken de WhatsApp si existe
    let maskedToken = '';
    if (currentSettings.whatsapp?.apiToken) {
      maskedToken = '••••••••••••••••';
    }

    // Asegurar que branding.palette siempre esté presente y sea un valor válido
    const storedPalette = currentSettings.branding?.palette;
    const safePalette: Palette = isAllowedPalette(storedPalette)
      ? storedPalette
      : DEFAULT_PALETTE;

    const settingsResponse = {
      features: currentSettings.features || {
        multiBranch: false,
        inventory: false,
        portalPaciente: false,
      },
      branding: {
        ...(currentSettings.branding || {}),
        primaryColor: currentSettings.branding?.primaryColor || '#ec4899',
        palette: safePalette,
      },
      contactInfo: currentSettings.contactInfo || {
        name: '',
        address: '',
        phone: '',
        email: '',
      },
      whatsapp: {
        enabled: currentSettings.whatsapp?.enabled ?? true,
        retouchReminders: currentSettings.whatsapp?.retouchReminders ?? true,
        anticipationHours: currentSettings.whatsapp?.anticipationHours ?? 24,
        senderName: currentSettings.whatsapp?.senderName || 'Centro Estético',
        apiToken: maskedToken,
        phoneNumberId: currentSettings.whatsapp?.phoneNumberId || '',
        messageTemplate: currentSettings.whatsapp?.messageTemplate || 'Hola {{nombre_paciente}}, te recordamos tu cita de {{servicio}} con {{profesional}} mañana a las {{hora_cita}}. ¡Te esperamos!',
      }
    };

    res.json(settingsResponse);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred while fetching tenant settings.' });
  }
};

export const updateSettings = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;
    const { features, branding, contactInfo, whatsapp } = req.body;

    // Validar branding.palette si se proporciona
    if (branding && branding.palette !== undefined && !isAllowedPalette(branding.palette)) {
      res.status(400).json({
        error: `Invalid palette. Allowed values: ${ALLOWED_PALETTES.join(', ')}.`,
      });
      return;
    }

    const existing = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!existing) {
      res.status(404).json({ error: 'Tenant not found.' });
      return;
    }

    const currentSettings = (existing.settings as any) || {};

    // 1. Process whatsapp token (encrypt if changed)
    let finalApiToken = currentSettings.whatsapp?.apiToken || '';
    if (whatsapp?.apiToken && whatsapp.apiToken !== '••••••••••••••••') {
      finalApiToken = encrypt(whatsapp.apiToken);
    }

    // 2. Resolver paleta final preservando los demás campos de branding
    const incomingPalette = branding?.palette;
    const resolvedPalette: Palette = isAllowedPalette(incomingPalette)
      ? incomingPalette
      : (isAllowedPalette(currentSettings.branding?.palette)
          ? currentSettings.branding.palette
          : DEFAULT_PALETTE);

    const newSettings = {
      features: {
        ...(currentSettings.features || {}),
        ...(features || {}),
      },
      branding: {
        ...(currentSettings.branding || {}),
        ...(branding || {}),
        // Forzar palette por encima de cualquier valor heredado o entrante
        palette: resolvedPalette,
      },
      contactInfo: {
        name: contactInfo?.name !== undefined ? contactInfo.name : (currentSettings.contactInfo?.name || ''),
        address: contactInfo?.address !== undefined ? contactInfo.address : (currentSettings.contactInfo?.address || ''),
        phone: contactInfo?.phone !== undefined ? contactInfo.phone : (currentSettings.contactInfo?.phone || ''),
        email: contactInfo?.email !== undefined ? contactInfo.email : (currentSettings.contactInfo?.email || ''),
      },
      whatsapp: {
        enabled: whatsapp?.enabled !== undefined ? Boolean(whatsapp.enabled) : (currentSettings.whatsapp?.enabled ?? true),
        retouchReminders: whatsapp?.retouchReminders !== undefined ? Boolean(whatsapp.retouchReminders) : (currentSettings.whatsapp?.retouchReminders ?? true),
        anticipationHours: whatsapp?.anticipationHours !== undefined ? Number(whatsapp.anticipationHours) : (currentSettings.whatsapp?.anticipationHours ?? 24),
        senderName: whatsapp?.senderName !== undefined ? String(whatsapp.senderName) : (currentSettings.whatsapp?.senderName || 'Centro Estético'),
        apiToken: finalApiToken,
        phoneNumberId: whatsapp?.phoneNumberId !== undefined ? String(whatsapp.phoneNumberId) : (currentSettings.whatsapp?.phoneNumberId || ''),
        messageTemplate: whatsapp?.messageTemplate !== undefined ? String(whatsapp.messageTemplate) : (currentSettings.whatsapp?.messageTemplate || ''),
      }
    };

    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        settings: newSettings,
      },
    });

    // Return settings with masked token
    const responseSettings = {
      ...newSettings,
      whatsapp: {
        ...newSettings.whatsapp,
        apiToken: finalApiToken ? '••••••••••••••••' : '',
      }
    };

    res.json(responseSettings);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'An error occurred while updating tenant settings.' });
  }
};
