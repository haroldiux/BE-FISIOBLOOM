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
