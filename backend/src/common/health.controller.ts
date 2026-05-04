import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Controller()
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get('health')
  async healthCheck() {
    const dbOk = await this.checkDb();
    return {
      status: dbOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      dbType: process.env.DB_TYPE || 'sqlite',
      db: dbOk ? 'ok' : 'error',
    };
  }

  @Get('health/live')
  liveness() {
    return { status: 'ok' };
  }

  @Get('health/ready')
  async readiness() {
    const dbOk = await this.checkDb();
    if (!dbOk) {
      throw new ServiceUnavailableException('Database unavailable');
    }
    return { status: 'ready' };
  }

  private async checkDb(): Promise<boolean> {
    try {
      await this.dataSource.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}
