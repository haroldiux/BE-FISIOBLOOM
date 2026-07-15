import prisma from './src/services/prisma';

async function main() {
  const result = await prisma.user.updateMany({
    where: { role: 'ADMIN' },
    data: { isActive: true },
  });
  console.log(`Reactivated ${result.count} ADMIN users.`);
  
  const superResult = await prisma.user.updateMany({
    where: { role: 'SUPER_ADMIN' },
    data: { isActive: true },
  });
  console.log(`Reactivated ${superResult.count} SUPER_ADMIN users.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
