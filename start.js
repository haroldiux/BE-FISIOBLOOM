const { execSync } = require('child_process');
const { Client } = require('pg');

async function waitForDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log('No DATABASE_URL provided, skipping DB wait.');
    return;
  }
  console.log('Esperando conexión con la base de datos PostgreSQL...');
  for (let i = 1; i <= 30; i++) {
    try {
      const client = new Client({ connectionString: url });
      await client.connect();
      await client.end();
      console.log('Conexión con PostgreSQL exitosa.');
      return;
    } catch (err) {
      console.log(`Intento ${i}/30: Postgres aún no responde (${err.message}). Reintentando en 1s...`);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  throw new Error('Tiempo de espera agotado para conectar a PostgreSQL');
}

async function main() {
  await waitForDb();

  console.log('Sincronizando esquema de Prisma (db push)...');
  try {
    execSync('npx prisma db push --accept-data-loss', { stdio: 'inherit' });
  } catch (e) {
    console.error('Advertencia al sincronizar esquema:', e.message);
  }

  console.log('Ejecutando seeder inicial...');
  try {
    execSync('node dist/prisma/seed.js', { stdio: 'inherit' });
  } catch (e) {
    console.error('Advertencia al ejecutar seeder:', e.message);
  }

  console.log('Iniciando servidor FisioBloom...');
  require('./dist/index.js');
}

main().catch(err => {
  console.error('Error fatal en el arranque:', err);
  process.exit(1);
});
