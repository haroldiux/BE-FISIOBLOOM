import { Role } from '@prisma/client';
import prisma from './prisma';
import { getBoliviaDayAndMinutes, getBoliviaTodayRange } from './appointment.service';

export type ShiftCheckResult =
  | { ok: true }
  | { ok: false; reason: 'no_shift'; message: string }
  | { ok: false; reason: 'not_checked_in'; message: string };

// Esta regla solo aplica al personal operativo del día a día (fisios,
// esteticistas y recepción) — administradores y súper admin quedan afuera,
// ya que ellos gestionan la clínica y no necesariamente "atienden" un turno.
export const GATED_ROLES: Role[] = [Role.PHYSIO, Role.AESTHETICIAN, Role.RECEPTIONIST];

const DAYS_OF_WEEK = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export interface TodaySchedule {
  isDayOff: boolean;
  start: string | null; // "HH:MM" hora de Bolivia
  end: string | null; // "HH:MM" hora de Bolivia
}

/**
 * Resuelve el horario de HOY (hora de Bolivia) para un profesional/recepción:
 * primero mira si hay una excepción puntual (licencia/feriado o disponibilidad
 * especial) para la fecha de hoy, y si no hay, cae al horario laboral fijo
 * configurado para ese día de la semana.
 */
export async function getTodaySchedule(userId: string, tenantId: string, now: Date = new Date()): Promise<TodaySchedule> {
  const { start: todayStart, end: todayEnd } = getBoliviaTodayRange(now);

  const exception = await prisma.scheduleException.findFirst({
    where: { professionalId: userId, tenantId, date: { gte: todayStart, lte: todayEnd } },
  });

  if (exception) {
    if (!exception.isAvailable) {
      return { isDayOff: true, start: null, end: null };
    }
    return { isDayOff: false, start: exception.startTime, end: exception.endTime };
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const { dayOfWeek } = getBoliviaDayAndMinutes(now);
  const dayName = DAYS_OF_WEEK[dayOfWeek];
  const workingHours = user?.workingHours as any;
  const todaySchedule = workingHours?.[dayName];

  if (!todaySchedule || !todaySchedule.start) {
    return { isDayOff: true, start: null, end: null };
  }

  return { isDayOff: false, start: todaySchedule.start, end: todaySchedule.end || null };
}

function timeStringToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Si el usuario dejó fichada la entrada de hoy sin fichar salida y ya pasó la
 * hora de fin de su turno, la cierra automáticamente en el horario en el que
 * su turno debía terminar. Así, olvidarse de fichar salida no lo deja "en
 * turno" para siempre — el sistema lo corrige solo la próxima vez que se
 * consulta su estado (no requiere un cron aparte).
 */
export async function autoCloseExpiredAttendance(userId: string, tenantId: string, now: Date = new Date()): Promise<void> {
  const { start: todayStart } = getBoliviaTodayRange(now);

  const activeAttendance = await prisma.attendance.findFirst({
    where: { userId, tenantId, checkIn: { gte: todayStart }, checkOut: null },
  });
  if (!activeAttendance) return;

  const schedule = await getTodaySchedule(userId, tenantId, now);
  if (schedule.isDayOff || !schedule.end) return;

  const { minutesOfDay: nowMinutes } = getBoliviaDayAndMinutes(now);
  const endMinutes = timeStringToMinutes(schedule.end);
  if (nowMinutes <= endMinutes) return;

  const autoCheckoutAt = new Date(todayStart.getTime() + endMinutes * 60 * 1000);
  await prisma.attendance.update({
    where: { id: activeAttendance.id },
    data: { checkOut: autoCheckoutAt },
  });
}

/**
 * Determina si un profesional/recepcionista está "en turno" ahora mismo: tiene
 * horario asignado para hoy (o una excepción puntual que lo habilita) Y ya
 * fichó su entrada sin haber fichado salida todavía. Se usa tanto para
 * bloquear acciones (shiftGate) como para decidir si aparece como
 * "disponible" al agendar una cita.
 */
export async function checkActiveShift(userId: string, tenantId: string): Promise<ShiftCheckResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return { ok: false, reason: 'no_shift', message: 'Usuario no encontrado.' };
  }

  const now = new Date();
  await autoCloseExpiredAttendance(userId, tenantId, now);

  const schedule = await getTodaySchedule(userId, tenantId, now);
  if (schedule.isDayOff) {
    return { ok: false, reason: 'no_shift', message: 'No tenés turno programado para hoy, no podés realizar esta acción.' };
  }

  const { start: todayStart } = getBoliviaTodayRange(now);
  const activeAttendance = await prisma.attendance.findFirst({
    where: { userId, tenantId, checkIn: { gte: todayStart }, checkOut: null },
  });

  if (!activeAttendance) {
    return { ok: false, reason: 'not_checked_in', message: 'Tenés que fichar tu entrada antes de poder hacer esto.' };
  }

  return { ok: true };
}

/**
 * Igual que checkActiveShift, pero de paso resuelve la excepción para roles
 * que no están sujetos a esta regla (admin/súper admin siempre pueden operar).
 * Único punto usado tanto por el middleware que bloquea acciones como por el
 * endpoint de estado que consulta el frontend para deshabilitar botones.
 */
export async function evaluateShift(userId: string, tenantId: string, role: Role): Promise<ShiftCheckResult> {
  if (!GATED_ROLES.includes(role)) {
    return { ok: true };
  }
  return checkActiveShift(userId, tenantId);
}
