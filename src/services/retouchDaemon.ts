import prisma from './prisma';
import { addToReminderLog } from '../controllers/whatsapp';

export async function checkAndSendRetouchReminders() {
  try {
    const today = new Date();
    today.setHours(23, 59, 59, 999); // Up to end of today

    // Búsqueda global de retoques pendientes con fecha programada menor o igual a hoy
    const pendingRetouches = await prisma.retouchSchedule.findMany({
      where: {
        status: 'PENDING',
        scheduledDate: {
          lte: today,
        },
        OR: [
          { notes: null },
          {
            NOT: {
              notes: {
                contains: '[Recordatorio enviado]',
              }
            }
          }
        ]
      },
      include: {
        patient: true,
        service: true,
      },
    });

    if (pendingRetouches.length === 0) {
      return;
    }

    console.log(`[Retouch Daemon] Evaluando ${pendingRetouches.length} retoques para notificaciones.`);

    for (const retouch of pendingRetouches) {
      const patientPhone = retouch.patient.phone;
      const patientName = retouch.patient.fullName;
      const serviceName = retouch.service.name;
      const dateStr = retouch.scheduledDate.toLocaleDateString('es-MX', { day: 'numeric', month: 'long' });

      const message = `Hola ${patientName}, te recordamos que tu sesión de RETOQUE para el servicio ${serviceName} ya está disponible (programada para el ${dateStr}). Por favor, reserva tu cita en nuestro portal en línea.`;

      console.log(`
📱 ===================================================
📱 [RETOQUE WHATSAPP AUTOMÁTICO]
📱 Para: ${patientName} (${patientPhone})
📱 Mensaje: ${message}
📱 ===================================================
      `);

      // Guardar en el log global de recordatorios de WhatsApp
      addToReminderLog({
        id: `retouch-reminder-${retouch.id}-${Date.now()}`,
        patientName,
        phone: patientPhone || 'Sin teléfono',
        message,
        sentAt: new Date().toISOString(),
        status: 'SIMULADO',
        appointmentId: retouch.originalAppointmentId,
      });

      // Actualizar notas para evitar re-envío en el próximo tick del daemon
      const updatedNotes = retouch.notes 
        ? `${retouch.notes} [Recordatorio enviado el ${new Date().toLocaleDateString('es-MX')}]`
        : `[Recordatorio enviado el ${new Date().toLocaleDateString('es-MX')}]`;

      await prisma.retouchSchedule.update({
        where: { id: retouch.id },
        data: { notes: updatedNotes },
      });
    }
  } catch (error) {
    console.error('[Retouch Daemon] Error al verificar retoques:', error);
  }
}

// Iniciar Daemon en intervalos de 1 minuto para entorno de desarrollo y pruebas rápidas
export function initRetouchDaemon() {
  console.log('🔄 Daemon de revisión diaria de Retoques iniciado (Simulación cada 1 min).');
  // Ejecutar verificación inicial
  setTimeout(checkAndSendRetouchReminders, 5000);
  
  // Intervalo continuo
  setInterval(checkAndSendRetouchReminders, 60 * 1000);
}
