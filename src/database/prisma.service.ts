import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnApplicationShutdown {
  private readonly connectOnBoot: boolean;

  constructor(config: ConfigService) {
    super({ datasourceUrl: config.get<string>('database.url') });
    this.connectOnBoot = config.get<boolean>('database.enabled') ?? false;
  }

  async onModuleInit(): Promise<void> {
    if (this.connectOnBoot) await this.$connect();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.connectOnBoot) await this.$disconnect();
  }
}
