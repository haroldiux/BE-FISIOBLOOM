import dotenv from 'dotenv';
dotenv.config();

import prisma from './services/prisma';

async function check() {
  console.log('Checking CashRegister counts by tenantId:');
  const registers = await prisma.cashRegister.groupBy({
    by: ['tenantId', 'status'],
    _count: true
  });
  console.log(registers);

  console.log('Checking Invoice counts by tenantId:');
  const invoices = await prisma.invoice.groupBy({
    by: ['tenantId', 'status'],
    _count: true
  });
  console.log(invoices);

  console.log('Active CashRegisters details:');
  const activeRegs = await prisma.cashRegister.findMany({
    where: { status: 'OPEN' }
  });
  console.log(activeRegs);
}

check().catch(console.error);
