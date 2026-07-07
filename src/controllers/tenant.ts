import { Response } from 'express';
import prisma from '../services/prisma';
import { AuthenticatedRequest } from '../middlewares/auth';
import { encrypt } from '../services/crypto';

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

    const settingsResponse = {
      features: currentSettings.features || {
        multiBranch: false,
        inventory: false,
        portalPaciente: false,
      },
      branding: currentSettings.branding || {
        primaryColor: '#ec4899',
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

    const newSettings = {
      features: {
        ...(currentSettings.features || {}),
        ...(features || {}),
      },
      branding: {
        ...(currentSettings.branding || {}),
        ...(branding || {}),
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
