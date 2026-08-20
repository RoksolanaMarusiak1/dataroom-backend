import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from 'generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL,
    });
    super({ adapter });
  }

  async onModuleInit() {
    // Explicit connect on startup so a DB outage fails fast at boot,
    // instead of surfacing as a 500 on the first user request.
    await this.$connect();
  }

  async onModuleDestroy() {
    // Close the pool cleanly on graceful shutdown (e.g. redeploys),
    // rather than leaving a stale connection for Postgres to time out.
    await this.$disconnect();
  }
}
