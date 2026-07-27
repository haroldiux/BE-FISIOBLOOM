import prisma from './prisma';

const GRACE_MINUTES = 10;

export async function checkAndMarkNoShows() {
  try {
    const now = new Date();

    const candidates = await prisma.appointment.findMany({
      where: {
        status: { in: ['PENDIENTE', 'CONFIRMADA'] },
        dateTime: { lte: now },
      },
      select: { id: true, dateTime: true, duration: true, patientId: true, professionalId: true },
    });

    if (candidates.length === 0) {
      return;
    }

    const expiredIds: string[] = [];
    for (const appt of candidates) {
      const deadline = new Date(appt.dateTime.getTime() + (appt.duration + GRACE_MINUTES) * 60 * 1000);
      if (now >= deadline) {
        expiredIds.push(appt.id);
      }
    }

    if (expiredIds.length === 0) {
      return;
    }

    await prisma.appointment.updateMany({
      where: { id: { in: expiredIds } },
      data: { status: 'NO_ASISTIO' },
    });

    console.log(`[No-Show Daemon] ${expiredIds.length} cita(s) marcada(s) automáticamente como NO_ASISTIO (venció duración + ${GRACE_MINUTES} min de gracia).`);
  } catch (error) {
    console.error('[No-Show Daemon] Error al verificar inasistencias:', error);
  }
}

export function initNoShowDaemon() {
  console.log('🔄 Daemon de inasistencias automáticas iniciado (revisión cada 1 min, gracia de duración + 10 min).');
  setTimeout(checkAndMarkNoShows, 5000);
  setInterval(checkAndMarkNoShows, 60 * 1000);
}
