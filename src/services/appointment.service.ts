import { AppointmentStatus } from '@prisma/client';

/**
 * Normalizes input date/time to Bolivia timezone offset (UTC-4 / America/La_Paz).
 */
export function normalizeToBoliviaTime(dateTimeInput: string | Date): Date {
  const date = new Date(dateTimeInput);
  if (isNaN(date.getTime())) {
    throw new Error('Fecha/Hora inválida');
  }
  return date;
}

// Bolivia (America/La_Paz) no observa horario de verano: offset fijo UTC-4.
export const BOLIVIA_OFFSET_MINUTES = 4 * 60;

/**
 * Dado un instante UTC (lo que Prisma/Postgres almacenan), calcula el día de la
 * semana y los minutos desde medianoche en hora LOCAL de Bolivia. Usar esto en
 * vez de dateTime.getHours()/getDay(), que devuelven la hora del proceso de Node
 * (UTC en el contenedor), no la hora real del consultorio.
 */
export function getBoliviaDayAndMinutes(date: Date): { dayOfWeek: number; minutesOfDay: number } {
  const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes();
  let minutesOfDay = utcMinutes - BOLIVIA_OFFSET_MINUTES;
  let dayOfWeek = date.getUTCDay();
  if (minutesOfDay < 0) {
    minutesOfDay += 24 * 60;
    dayOfWeek = (dayOfWeek + 6) % 7;
  }
  return { dayOfWeek, minutesOfDay };
}

/**
 * Devuelve el rango [inicio, fin] del día de HOY en hora de Bolivia, expresado
 * como instantes UTC reales — para usar en consultas Prisma tipo
 * `checkIn: { gte: start, lte: end }` sin depender de la hora local del
 * contenedor (que corre en UTC, no en hora de Bolivia).
 */
export function getBoliviaTodayRange(referenceDate: Date = new Date()): { start: Date; end: Date } {
  const { minutesOfDay } = getBoliviaDayAndMinutes(referenceDate);
  const start = new Date(referenceDate.getTime() - minutesOfDay * 60 * 1000);
  start.setUTCSeconds(0, 0);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { start, end };
}

// Varios modelos (Coupon, Campaign, etc.) guardan startDate/endDate como
// fecha-sola: medianoche UTC del día calendario elegido (ej.
// "2026-07-26T00:00:00Z" para "26 de julio"). Esos componentes de
// año/mes/día SON el día que se eligió — no hay que reinterpretar ese
// instante como si fuera una hora real de Bolivia (eso lo corre 4hs para
// atrás y lo mete en el día anterior). Estas dos funciones arman, a partir
// de esos mismos componentes Y/M/D, el inicio/fin real de ESE día calendario
// en hora de Bolivia. Cualquier validación de vigencia por fecha-sola debe
// usar estas dos (no reimplementarlas aparte, para que no se desincronicen).
export function boliviaStartOfDateOnly(dateOnly: Date): Date {
  return new Date(Date.UTC(
    dateOnly.getUTCFullYear(), dateOnly.getUTCMonth(), dateOnly.getUTCDate(),
    BOLIVIA_OFFSET_MINUTES / 60, 0, 0, 0
  ));
}
export function boliviaEndOfDateOnly(dateOnly: Date): Date {
  return new Date(Date.UTC(
    dateOnly.getUTCFullYear(), dateOnly.getUTCMonth(), dateOnly.getUTCDate() + 1,
    BOLIVIA_OFFSET_MINUTES / 60, 0, 0, -1
  ));
}

/**
 * Validates that an appointment date is not in the past.
 */
export function validateAppointmentDate(dateTime: Date): { valid: boolean; error?: string } {
  const now = new Date();
  // Allow a 2-minute buffer for clock drift / request latency
  if (dateTime.getTime() < now.getTime() - 2 * 60 * 1000) {
    return {
      valid: false,
      error: 'No se pueden agendar citas en fechas u horas pasadas.',
    };
  }
  return { valid: true };
}

/**
 * Validates strict AppointmentStatus enum values.
 */
export function validateAppointmentStatus(status: string): boolean {
  return Object.values(AppointmentStatus).includes(status as AppointmentStatus);
}

// Las siguientes 4 validaciones reciben el cliente Prisma (o un `tx` de
// transacción) como primer parámetro para poder reutilizarse dentro de
// prisma.$transaction (ej. venta de paquete + agendado de la primera cita en
// una sola operación atómica, ver packages.ts) sin duplicar esta lógica.

/**
 * Verifica que la cita entre dentro del horario laboral configurado del profesional.
 */
export async function checkWorkingHours(
  client: any,
  professionalId: string,
  dateTime: Date,
  duration: number,
  tenantId: string
): Promise<{ valid: boolean; error?: string }> {
  const professional = await client.user.findUnique({
    where: { id: professionalId, tenantId },
    select: { workingHours: true },
  });

  if (!professional) {
    return { valid: false, error: 'Profesional no encontrado.' };
  }

  if (!professional.workingHours) {
    return { valid: false, error: 'El profesional no tiene un horario de atención configurado.' };
  }

  const workingHours = professional.workingHours as any;
  const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const daysOfWeekEs: Record<string, string> = {
    sunday: 'domingo',
    monday: 'lunes',
    tuesday: 'martes',
    wednesday: 'miércoles',
    thursday: 'jueves',
    friday: 'viernes',
    saturday: 'sábado',
  };
  const { dayOfWeek, minutesOfDay } = getBoliviaDayAndMinutes(dateTime);
  const dayName = daysOfWeek[dayOfWeek];

  const daySchedule = workingHours[dayName];
  if (!daySchedule) {
    return { valid: false, error: `El profesional no trabaja el día ${daysOfWeekEs[dayName]}.` };
  }

  const startMinutes = minutesOfDay;
  const endMinutes = startMinutes + duration;

  const [startH, startM] = daySchedule.start.split(':').map(Number);
  const [endH, endM] = daySchedule.end.split(':').map(Number);
  const workStartMinutes = startH * 60 + startM;
  const workEndMinutes = endH * 60 + endM;

  if (startMinutes < workStartMinutes || endMinutes > workEndMinutes) {
    return {
      valid: false,
      error: `La cita está fuera del horario de atención (${daySchedule.start} - ${daySchedule.end}).`,
    };
  }

  return { valid: true };
}

/**
 * Verifica que el profesional no tenga una excepción de horario (licencia/bloqueo) ese día/hora.
 */
export async function checkScheduleExceptions(
  client: any,
  professionalId: string,
  dateTime: Date,
  duration: number,
  tenantId: string
): Promise<{ valid: boolean; error?: string }> {
  const startOfDay = new Date(dateTime);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(dateTime);
  endOfDay.setHours(23, 59, 59, 999);

  const exceptions = await client.scheduleException.findMany({
    where: {
      professionalId,
      tenantId,
      date: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
  });

  const apptStartMinutes = getBoliviaDayAndMinutes(dateTime).minutesOfDay;
  const apptEndMinutes = apptStartMinutes + duration;

  for (const exception of exceptions) {
    if (exception.isAvailable === false) {
      if (!exception.startTime || !exception.endTime) {
        return {
          valid: false,
          error: 'El profesional no está disponible en este horario debido a una excepción/licencia.',
        };
      } else {
        const [excStartH, excStartM] = exception.startTime.split(':').map(Number);
        const [excEndH, excEndM] = exception.endTime.split(':').map(Number);
        const excStartMinutes = excStartH * 60 + excStartM;
        const excEndMinutes = excEndH * 60 + excEndM;

        if (apptStartMinutes < excEndMinutes && excStartMinutes < apptEndMinutes) {
          return {
            valid: false,
            error: 'El profesional no está disponible en este horario debido a una excepción/licencia.',
          };
        }
      }
    }
  }

  return { valid: true };
}

/**
 * Verifica que el profesional no tenga otra cita activa que se solape en ese horario.
 */
export async function checkProfessionalCollision(
  client: any,
  professionalId: string,
  dateTime: Date,
  duration: number,
  tenantId: string,
  excludeAppointmentId?: string
): Promise<boolean> {
  const newStart = dateTime.getTime();
  const newEnd = newStart + duration * 60 * 1000;

  const existingAppointments = await client.appointment.findMany({
    where: {
      tenantId,
      professionalId,
      status: {
        in: [AppointmentStatus.PENDIENTE, AppointmentStatus.CONFIRMADA, AppointmentStatus.COMPLETADA],
      },
      id: excludeAppointmentId ? { not: excludeAppointmentId } : undefined,
    },
  });

  for (const appt of existingAppointments) {
    const extStart = new Date(appt.dateTime).getTime();
    const extEnd = extStart + appt.duration * 60 * 1000;

    if (newStart < extEnd && extStart < newEnd) {
      return true;
    }
  }

  return false;
}

/**
 * Verifica que la cabina no tenga otra cita activa que se solape en ese horario.
 */
export async function checkCabinCollision(
  client: any,
  cabin: string,
  dateTime: Date,
  duration: number,
  tenantId: string,
  excludeAppointmentId?: string
): Promise<boolean> {
  const newStart = dateTime.getTime();
  const newEnd = newStart + duration * 60 * 1000;

  const existingAppointments = await client.appointment.findMany({
    where: {
      tenantId,
      cabin,
      status: {
        in: [AppointmentStatus.PENDIENTE, AppointmentStatus.CONFIRMADA, AppointmentStatus.COMPLETADA],
      },
      id: excludeAppointmentId ? { not: excludeAppointmentId } : undefined,
    },
  });

  for (const appt of existingAppointments) {
    const extStart = new Date(appt.dateTime).getTime();
    const extEnd = extStart + appt.duration * 60 * 1000;

    if (newStart < extEnd && extStart < newEnd) {
      return true;
    }
  }

  return false;
}
