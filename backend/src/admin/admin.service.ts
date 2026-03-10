import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class AdminService {
  constructor(private readonly dataSource: DataSource) {}

  async getHealth(): Promise<{ status: string; dbType: string; dbStatus: string; port: string }> {
    let dbStatus = 'connected';
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      dbStatus = 'error';
    }
    return {
      status: dbStatus === 'connected' ? 'ok' : 'degraded',
      dbType: process.env.DB_TYPE || 'sqlite',
      dbStatus,
      port: process.env.PORT || '3000',
    };
  }
}
