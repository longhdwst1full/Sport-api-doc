import { PrismaClient } from '@prisma/client';
import { resetBootstrapAdmin } from '../src/modules/iam/bootstrap-admin-recovery';
import { IAM_SECURITY_DEFAULTS } from '../src/modules/iam/iam.constants';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Bootstrap administrator recovery is disabled in production.');
  }
  const result = await resetBootstrapAdmin(prisma);
  console.log(
    `Bootstrap admin reset: ${result.email}; status=${result.status}; `
      + `temporaryPassword=${IAM_SECURITY_DEFAULTS.INITIAL_STAFF_PASSWORD}; `
      + `mustChangePassword=${result.mustChangePassword}; `
      + `revokedSessions=${result.revokedSessionCount}`,
  );
}

async function run(): Promise<void> {
  try {
    await main();
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : 'Bootstrap administrator reset failed');
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void run();
