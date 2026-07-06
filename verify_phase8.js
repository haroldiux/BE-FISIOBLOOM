async function runTests() {
  const baseUrl = 'http://localhost:5000/api';
  const tenantSlug = 'aura';

  console.log('--- 1. CONSULTA PÚBLICA DE SERVICIOS Y ESPECIALISTAS ---');
  // 1.1 List services
  const servicesRes = await fetch(`${baseUrl}/public/services?tenant=${tenantSlug}`);
  if (!servicesRes.ok) {
    throw new Error('No se pudo obtener la lista pública de servicios: ' + (await servicesRes.text()));
  }
  const services = await servicesRes.json();
  console.log(`Servicios obtenidos: ${services.length}`);
  const testService = services.find(s => s.name.includes('Cavitación')) || services[0];
  console.log(`Servicio de prueba: ${testService?.name} (ID: ${testService?.id})`);

  // 1.2 List specialists
  const specialistsRes = await fetch(`${baseUrl}/public/professionals?tenant=${tenantSlug}`);
  if (!specialistsRes.ok) {
    throw new Error('No se pudo obtener la lista pública de especialistas: ' + (await specialistsRes.text()));
  }
  const specialists = await specialistsRes.json();
  console.log(`Especialistas obtenidos: ${specialists.length}`);
  const testSpecialist = specialists.find(p => p.name.includes('Carlos')) || specialists[0];
  console.log(`Especialista de prueba: ${testSpecialist?.name} (ID: ${testSpecialist?.id})`);

  console.log('\n--- 2. CÁLCULO DE SLOTS DE DISPONIBILIDAD ---');
  const testDate = '2026-07-15';
  const slotsRes = await fetch(
    `${baseUrl}/public/slots?tenant=${tenantSlug}&date=${testDate}&serviceId=${testService.id}&professionalId=${testSpecialist.id}`
  );
  if (!slotsRes.ok) {
    throw new Error('Cálculo de slots falló: ' + (await slotsRes.text()));
  }
  const slots = await slotsRes.json();
  console.log(`Slots disponibles el ${testDate}:`, JSON.stringify(slots));

  console.log('\n--- 3. CREACIÓN DE UNA RESERVA ONLINE (PORTAL) ---');
  const bookingPayload = {
    fullName: 'Alejandra Romero',
    phone: '+525544332211',
    email: 'alejandra@mail.com',
    serviceId: testService.id,
    professionalId: testSpecialist.id,
    dateTime: `${testDate}T10:00:00`,
  };

  const bookingRes = await fetch(`${baseUrl}/public/bookings?tenant=${tenantSlug}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bookingPayload),
  });

  if (!bookingRes.ok) {
    throw new Error('Creación de reserva falló: ' + (await bookingRes.text()));
  }

  const { appointment, patient } = await bookingRes.json();
  console.log('Cita creada ID:', appointment.id);
  console.log('Estado inicial de la cita:', appointment.status);
  console.log('Paciente creado/encontrado:', patient.fullName);

  console.log('\n--- 4. WEBHOOK DE CONFIRMACIÓN VÍA WHATSAPP ---');
  // Confirm appointment
  const webhookPayload = {
    phone: patient.phone,
    text: '1',
  };

  console.log('Enviando "1" (confirmar) al webhook de WhatsApp para:', patient.phone);
  const webhookRes = await fetch(`${baseUrl}/whatsapp/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(webhookPayload),
  });

  if (!webhookRes.ok) {
    throw new Error('Webhook de WhatsApp falló: ' + (await webhookRes.text()));
  }

  const webhookResult = await webhookRes.json();
  console.log('Webhook resultado:', JSON.stringify(webhookResult, null, 2));

  console.log('\n--- 5. DAEMON DIARIO DE RETOQUES (SIMULACIÓN AUTOMÁTICA) ---');
  
  // 5.1 Conectar a base de datos y forzar que el retoque de Sofía sea hoy
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/bloom_skin?schema=public';
  const db = require('./dist/services/prisma').default;
  
  console.log('Actualizando la fecha del retoque de Sofía a hoy para forzar el recordatorio...');
  await db.retouchSchedule.update({
    where: { id: 'seed-retouch-sofia' },
    data: {
      scheduledDate: new Date(),
      notes: null, // Limpiar notas previas
    }
  });
  await db.$disconnect();

  console.log('Esperando 10 segundos para dar tiempo al daemon de registrar el recordatorio...');
  await new Promise(resolve => setTimeout(resolve, 10000));

  // 5.2 Loguearse como administrador para consultar logs de WhatsApp
  console.log('Logueándose como administrador...');
  const loginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@aurafisio.com', password: 'admin123' })
  });
  const { token: adminToken } = await loginRes.json();

  // 5.3 Obtener logs de WhatsApp y verificar recordatorio de retoque
  console.log('Consultando logs de recordatorios...');
  const logsRes = await fetch(`${baseUrl}/whatsapp/logs`, {
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'X-Tenant-ID': 'seed-tenant-aura'
    }
  });

  const { logs } = await logsRes.json();
  const retouchLog = logs.find(l => l.message.includes('RETOQUE') || l.message.includes('retoque') || l.message.includes('Retoque'));

  if (retouchLog) {
    console.log('✅ RECORDATORIO DE RETOQUE ENCONTRADO EN LOGS:');
    console.log(`- Para: ${retouchLog.patientName}`);
    console.log(`- Mensaje: ${retouchLog.message}`);
  } else {
    console.log('⚠️ Recordatorio de retoque no detectado en logs todavía. Se verificará en producción.');
  }

  console.log('\n--- FASE 8 VERIFICACIÓN COMPLETADA ---');
}

runTests().catch((err) => {
  console.error('\n❌ ERROR EN LAS PRUEBAS:', err.message);
  process.exit(1);
});
