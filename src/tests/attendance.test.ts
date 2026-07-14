import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { cleanDatabase, seedTestDatabase, prisma } from './helpers';

let testData: any;

describe('Módulo de Asistencia (Tardiness check)', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
  });

  beforeEach(async () => {
    await cleanDatabase();
    testData = await seedTestDatabase();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('Debe registrar entrada PUNTUAL (status PRESENT) si se ficha antes de la hora de entrada programada', async () => {
    // Definimos horario del lunes: 09:00 a 18:00
    // 2026-07-13 es Lunes (Monday)
    await prisma.user.update({
      where: { id: testData.physio.user.id },
      data: {
        workingHours: {
          monday: { start: '09:00', end: '18:00' },
        },
      },
    });

    // Fijamos hora local a las 08:55 AM
    const date = new Date('2026-07-13T08:55:00');
    vi.setSystemTime(date);

    const response = await request(app)
      .post('/api/attendance/check-in')
      .set('Authorization', `Bearer ${testData.physio.token}`)
      .set('x-tenant-id', testData.tenant.id);

    expect(response.status).toBe(201);
    expect(response.body.attendance.status).toBe('PRESENT');
  });

  it('Debe registrar entrada TARDE (status LATE) si se ficha después de la hora programada', async () => {
    await prisma.user.update({
      where: { id: testData.physio.user.id },
      data: {
        workingHours: {
          monday: { start: '09:00', end: '18:00' },
        },
      },
    });

    // Fijamos hora local a las 09:05 AM (tarde)
    const date = new Date('2026-07-13T09:05:00');
    vi.setSystemTime(date);

    const response = await request(app)
      .post('/api/attendance/check-in')
      .set('Authorization', `Bearer ${testData.physio.token}`)
      .set('x-tenant-id', testData.tenant.id);

    expect(response.status).toBe(201);
    expect(response.body.attendance.status).toBe('LATE');
  });

  it('Debe considerar las excepciones de horario (ScheduleException) al evaluar tardanza', async () => {
    const date = new Date('2026-07-13T09:55:00'); // Ficha a las 09:55 AM
    vi.setSystemTime(date);

    await prisma.scheduleException.create({
      data: {
        tenantId: testData.tenant.id,
        professionalId: testData.physio.user.id,
        date: new Date('2026-07-13T00:00:00'),
        isAvailable: true,
        startTime: '10:00',
        endTime: '15:00',
        reason: 'Custom schedule for today',
      },
    });

    const response = await request(app)
      .post('/api/attendance/check-in')
      .set('Authorization', `Bearer ${testData.physio.token}`)
      .set('x-tenant-id', testData.tenant.id);

    // Comparando contra las 10:00, 09:55 es temprano, debe ser PRESENT
    expect(response.status).toBe(201);
    expect(response.body.attendance.status).toBe('PRESENT');
  });
});
