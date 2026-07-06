import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import prisma from './prisma';
import { addToReminderLog } from '../controllers/whatsapp';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

let connection: IORedis | null = null;
export let queue: Queue | null = null;
export let worker: Worker | null = null;
export let isRedisOffline = true;

// Intentar conectar a Redis
try {
  connection = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    connectTimeout: 2000, // timeout rápido para evitar demoras
  });

  connection.on('error', (_err) => {
    if (!isRedisOffline) {
      console.warn('⚠️ Redis offline. Activando fallback de recordatorios en memoria...');
      isRedisOffline = true;
    }
  });

  connection.on('connect', () => {
    console.log('✅ Conectado a Redis. Colas de recordatorios activas con BullMQ.');
    isRedisOffline = false;
  });

  queue = new Queue('whatsapp-reminders', { connection: connection as any });

  worker = new Worker(
    'whatsapp-reminders',
    async (job: Job) => {
      await processReminderJob(job.data.appointmentId);
    },
    { connection: connection as any }
  );

} catch (_err) {
  console.warn('⚠️ No se pudo inicializar Redis/BullMQ. Activando fallback en memoria...');
  isRedisOffline = true;
}

// Fallback en memoria: Almacena timeouts activos para citas
const memoryTimers = new Map<string, NodeJS.Timeout>();

async function processReminderJob(appointmentId: string) {
  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patient: true,
        professional: true,
        service: true,
      },
    });

    if (!appointment) return;
    if (appointment.status === 'CANCELADA_CON_CARGO' || appointment.status === 'CANCELADA_SIN_CARGO') {
      console.log(`[WhatsApp REMINDER] Cancelado para cita ${appointmentId} (Estado: ${appointment.status})`);
      return;
    }

    const patientPhone = appointment.patient.phone;
    const patientName = appointment.patient.fullName;
    const professionalName = appointment.professional.name;
    const serviceName = appointment.service?.name || 'Tratamiento';
    const appointmentTime = appointment.dateTime.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    const appointmentDate = appointment.dateTime.toLocaleDateString('es-MX', { day: 'numeric', month: 'long' });

    const message = `Hola ${patientName}, te recordamos tu cita de ${serviceName} con el profesional ${professionalName} mañana ${appointmentDate} a las ${appointmentTime}.`;

    console.log(`
📱 ===================================================
📱 [ENVÍO WHATSAPP SIMULADO]
📱 Para: ${patientName} (${patientPhone})
📱 Mensaje: ${message}
📱 ===================================================
    `);

    // Persist log entry for the WhatsApp panel
    addToReminderLog({
      id: `reminder-${appointmentId}-${Date.now()}`,
      patientName,
      phone: patientPhone || 'Sin teléfono',
      message,
      sentAt: new Date().toISOString(),
      status: 'SIMULADO',
      appointmentId,
    });
  } catch (error) {
    console.error('Error al procesar recordatorio de WhatsApp:', error);
  }
}

export const scheduleAppointmentReminder = async (appointmentId: string, appointmentDateTime: Date) => {
  const reminderTime = new Date(appointmentDateTime.getTime() - 24 * 60 * 60 * 1000); // 24 horas antes
  const now = new Date();
  const delay = reminderTime.getTime() - now.getTime();

  // Si la cita ya es en menos de 24 horas, mandar recordatorio en 1 minuto
  const finalDelay = delay > 0 ? delay : 60 * 1000;

  if (isRedisOffline || !queue) {
    // Cancelar temporizador previo si existe
    if (memoryTimers.has(appointmentId)) {
      clearTimeout(memoryTimers.get(appointmentId)!);
      memoryTimers.delete(appointmentId);
    }

    console.log(`⏱️ [Memory Queue] Agendando recordatorio de cita ${appointmentId} en ${Math.round(finalDelay / 1000 / 60)} minutos.`);

    const timer = setTimeout(async () => {
      await processReminderJob(appointmentId);
      memoryTimers.delete(appointmentId);
    }, finalDelay);

    memoryTimers.set(appointmentId, timer);
  } else {
    try {
      // Eliminar trabajo anterior si existiera con la misma ID
      const jobId = `reminder-${appointmentId}`;
      try {
        const existingJob = await queue.getJob(jobId);
        if (existingJob) {
          await existingJob.remove();
        }
      } catch (e) {}

      await queue.add(
        'send-reminder',
        { appointmentId },
        {
          jobId,
          delay: finalDelay,
          attempts: 3,
          backoff: 5000,
        }
      );
      console.log(`📦 [BullMQ Queue] Agendado recordatorio de cita ${appointmentId} vía Redis con delay de ${Math.round(finalDelay / 1000 / 60)} minutos.`);
    } catch (error) {
      console.warn('⚠️ Error al agregar a BullMQ. Usando fallback en memoria para esta cita...');
      const timer = setTimeout(async () => {
        await processReminderJob(appointmentId);
        memoryTimers.delete(appointmentId);
      }, finalDelay);
      memoryTimers.set(appointmentId, timer);
    }
  }
};
