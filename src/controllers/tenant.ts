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
const DEFAULT_PRIMARY_COLOR = '#ec4899';

const isAllowedPalette = (value: unknown): value is Palette =>
  typeof value === 'string' &&
  (ALLOWED_PALETTES as readonly string[]).includes(value);

// El branding (paleta + color primario) es propio de cada sucursal — no del
// tenant entero — para que el Admin de una sucursal no le cambie el look a
// las demás. El Súper Admin (sin sucursal propia) siempre ve/usa el
// default del sistema, nunca el de ninguna sucursal real.
function resolveBranding(rawBranding: any): { palette: Palette; primaryColor: string; logoUrl?: string } {
  const storedPalette = rawBranding?.palette;
  return {
    ...(rawBranding || {}),
    palette: isAllowedPalette(storedPalette) ? storedPalette : DEFAULT_PALETTE,
    primaryColor: rawBranding?.primaryColor || DEFAULT_PRIMARY_COLOR,
  };
}

export const getSettings = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;
    const branchId = req.user!.branchId;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });

    if (!tenant) {
      res.status(404).json({ error: 'Clínica no encontrada.' });
      return;
    }

    const currentSettings = (tenant.settings as any) || {};

    // Enmascarar apiToken de WhatsApp si existe
    let maskedToken = '';
    if (currentSettings.whatsapp?.apiToken) {
      maskedToken = '••••••••••••••••';
    }

    // El Súper Admin no tiene sucursal propia: siempre ve el branding
    // default, nunca el de una sucursal real (así ni hereda ni contamina a
    // ninguna clínica con lo que vea/pruebe desde su panel).
    let branding: { palette: Palette; primaryColor: string; logoUrl?: string };
    if (branchId) {
      const branch = await prisma.branch.findFirst({
        where: { id: branchId, tenantId },
        select: { branding: true },
      });
      branding = resolveBranding(branch?.branding as any);
    } else {
      branding = resolveBranding(undefined);
    }

    const settingsResponse = {
      features: currentSettings.features || {
        multiBranch: false,
        inventory: false,
        portalPaciente: false,
      },
      branding,
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
    const branchId = req.user!.branchId;
    const { features, branding, contactInfo, whatsapp } = req.body;

    // Validar branding.palette si se proporciona
    if (branding && branding.palette !== undefined && !isAllowedPalette(branding.palette)) {
      res.status(400).json({
        error: `Paleta inválida. Valores permitidos: ${ALLOWED_PALETTES.join(', ')}.`,
      });
      return;
    }

    if (branding && !branchId) {
      res.status(400).json({ error: 'El Súper Admin no gestiona el branding de ninguna sucursal desde acá.' });
      return;
    }

    const existing = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!existing) {
      res.status(404).json({ error: 'Clínica no encontrada.' });
      return;
    }

    const currentSettings = (existing.settings as any) || {};

    // 1. Process whatsapp token (encrypt if changed)
    let finalApiToken = currentSettings.whatsapp?.apiToken || '';
    if (whatsapp?.apiToken && whatsapp.apiToken !== '••••••••••••••••') {
      finalApiToken = encrypt(whatsapp.apiToken);
    }

    // 2. Si mandaron branding, se guarda en LA SUCURSAL del usuario (no en
    // el tenant) — cada Admin solo puede afectar el look de la suya.
    let resolvedBranding: { palette: Palette; primaryColor: string; logoUrl?: string } | null = null;
    if (branding && branchId) {
      const branch = await prisma.branch.findFirst({ where: { id: branchId, tenantId } });
      const mergedBranding = resolveBranding({ ...(branch?.branding as any), ...branding });
      await prisma.branch.update({
        where: { id: branchId, tenantId },
        data: { branding: mergedBranding },
      });
      resolvedBranding = mergedBranding;
    }

    const newSettings = {
      features: {
        ...(currentSettings.features || {}),
        ...(features || {}),
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

    // Return settings with masked token — el branding devuelto es el de la
    // sucursal (recién guardado si vino en el body, o el actual si no).
    let brandingForResponse = resolvedBranding;
    if (!brandingForResponse) {
      if (branchId) {
        const branch = await prisma.branch.findFirst({ where: { id: branchId, tenantId }, select: { branding: true } });
        brandingForResponse = resolveBranding(branch?.branding as any);
      } else {
        brandingForResponse = resolveBranding(undefined);
      }
    }

    const responseSettings = {
      ...newSettings,
      branding: brandingForResponse,
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
