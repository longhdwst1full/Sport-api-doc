import { PrismaService } from '../../database/prisma.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports disabled database without degrading local contract tooling', async () => {
    const prisma = {
      isEnabled: () => false,
      getConnectionStatus: () => Promise.resolve<'disabled'>('disabled'),
    } as Pick<PrismaService, 'isEnabled' | 'getConnectionStatus'> as PrismaService;

    await expect(new HealthController(prisma).getHealth()).resolves.toMatchObject({
      status: 'ok',
      database: { enabled: false, status: 'disabled' },
    });
  });

  it('degrades when configured database connectivity fails', async () => {
    const prisma = {
      isEnabled: () => true,
      getConnectionStatus: () => Promise.resolve<'down'>('down'),
    } as Pick<PrismaService, 'isEnabled' | 'getConnectionStatus'> as PrismaService;

    await expect(new HealthController(prisma).getHealth()).resolves.toMatchObject({
      status: 'degraded',
      database: { enabled: true, status: 'down' },
    });
  });
});
