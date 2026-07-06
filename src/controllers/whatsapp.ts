import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth';
import { isRedisOffline } from '../services/reminderQueue';
import prisma from '../services/prisma';
import { decrypt } from '../services/crypto';

// In-memory log of reminders (populated by the reminderQueue worker)
export const reminderLog: {
  id: string;
  patientName: string;
  phone: string;
  message: string;
  sentAt: string;
  status: 'SIMULADO' | 'ENVIADO' | 'ERROR';
  appointmentId: string;
  tenantId?: string;
}[] = [];

export const addToReminderLog = (entry: typeof reminderLog[0]) => {
  reminderLog.unshift(entry); // newest first
  if (reminderLog.length > 100) reminderLog.pop(); // keep last 100
};

export const getWhatsAppStatus = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;
    const tenantReminders = reminderLog.filter(log => log.tenantId === tenantId);
    const lastEntry = tenantReminders[0] ?? null;

    // Check if token is configured in DB
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    const settings = (tenant?.settings as any) || {};
    const hasToken = !!settings.whatsapp?.apiToken;

    res.json({
      redisActive: !isRedisOffline,
      queueEngine: isRedisOffline ? 'in-memory (fallback)' : 'BullMQ + Redis',
      totalSent: tenantReminders.length,
      lastProcessed: lastEntry ? lastEntry.sentAt : null,
      lastPatient: lastEntry ? lastEntry.patientName : null,
      hasToken,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error fetching WhatsApp status.' });
  }
};

export const getWhatsAppLogs = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId;
    const tenantReminders = reminderLog.filter(log => log.tenantId === tenantId);
    res.json({ logs: tenantReminders });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error fetching WhatsApp logs.' });
  }
};

export const sendTestReminder = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { patientName, phone, message } = req.body;
    const tenantId = req.user!.tenantId;

    // Retrieve and decrypt WhatsApp token from DB
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true }
    });
    const settings = (tenant?.settings as any) || {};
    const apiTokenEncrypted = settings.whatsapp?.apiToken;
    const phoneNumberId = settings.whatsapp?.phoneNumberId || '';
    
    let tokenStatus = "Token no configurado";
    if (apiTokenEncrypted) {
      try {
        const decryptedToken = decrypt(apiTokenEncrypted);
        tokenStatus = `Token desencriptado correctamente (${decryptedToken.substring(0, Math.min(5, decryptedToken.length))}...)`;
      } catch (err: any) {
        tokenStatus = `Error al desencriptar token: ${err.message}`;
      }
    }

    const testEntry = {
      id: `test-${Date.now()}`,
      patientName: patientName || 'Paciente de Prueba',
      phone: phone || '+54 9 11 1234-5678',
      message: message || `Hola ${patientName || 'Paciente'}, te recordamos tu cita en el centro estético mañana. ¡Te esperamos!`,
      sentAt: new Date().toISOString(),
      status: 'SIMULADO' as const,
      appointmentId: 'test',
      tenantId, // Store tenantId for isolation
    };

    addToReminderLog(testEntry);

    console.log(`
📱 ===================================================
📱 [TEST WHATSAPP SIMULADO]
📱 Tenant: ${tenantId}
📱 Phone ID: ${phoneNumberId}
📱 Estado Token: ${tokenStatus}
📱 Para: ${testEntry.patientName} (${testEntry.phone})
📱 Mensaje: ${testEntry.message}
📱 ===================================================
    `);

    res.json({ 
      success: true, 
      message: `Recordatorio de prueba enviado (simulado). Estado: ${tokenStatus}`,
      entry: testEntry,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error sending test reminder.' });
  }
};

export const handleWhatsAppWebhook = async (req: any, res: Response): Promise<void> => {
  try {
    const { phone, text } = req.body;

    if (!phone || !text) {
      res.status(400).json({ error: 'phone and text are required.' });
      return;
    }

    const cleanText = String(text).trim().toLowerCase();

    // 1. Encontrar paciente por teléfono (búsqueda global ya que el contexto no tiene tenantId)
    const patient = await prisma.patient.findFirst({
      where: { phone: String(phone) },
      orderBy: { createdAt: 'desc' }
    });

    if (!patient) {
      res.status(404).json({ error: `Paciente con teléfono ${phone} no encontrado en ningún tenant.` });
      return;
    }

    // 2. Encontrar la cita más reciente PENDING de este paciente
    const appointment = await prisma.appointment.findFirst({
      where: {
        patientId: patient.id,
        status: 'PENDIENTE'
      },
      orderBy: { dateTime: 'desc' },
      include: { service: true }
    });

    if (!appointment) {
      res.json({
        success: false,
        message: `No se encontraron citas PENDIENTES para el paciente ${patient.fullName}.`
      });
      return;
    }

    let newStatus = appointment.status;
    let replyMsg = '';
    const serviceName = appointment.service?.name || 'Tratamiento';

    if (cleanText === '1' || cleanText.includes('confirmar') || cleanText.includes('si')) {
      newStatus = 'CONFIRMADA';
      replyMsg = `¡Gracias ${patient.fullName}! Hemos CONFIRMADO tu cita para ${serviceName}.`;
    } else if (cleanText === '2' || cleanText.includes('cancelar') || cleanText.includes('no')) {
      newStatus = 'CANCELADA_SIN_CARGO';
      replyMsg = `Hola ${patient.fullName}, hemos CANCELADO tu cita para ${serviceName}. Esperamos verte pronto.`;
    }

    if (newStatus !== appointment.status) {
      // Actualizar estado de la cita (como no hay tenantId en contexto, se actualiza de manera aislada al tenant de la cita)
      await prisma.appointment.update({
        where: { id: appointment.id, tenantId: appointment.tenantId },
        data: { status: newStatus as any }
      });

      console.log(`
📱 ===================================================
📱 [WEBHOOK WHATSAPP SIMULADO]
📱 Recibido de: ${phone} - Mensaje: "${text}"
📱 Cita ID: ${appointment.id} -> Cambiada a ${newStatus} (Tenant: ${appointment.tenantId})
📱 Respuesta enviada: ${replyMsg}
📱 ===================================================
      `);

      res.json({
        success: true,
        message: `Cita actualizada a ${newStatus}.`,
        reply: replyMsg
      });
    } else {
      res.json({
        success: false,
        message: `Comando de respuesta no reconocido. Usa "1" para confirmar o "2" para cancelar.`
      });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error processing WhatsApp webhook.' });
  }
};
