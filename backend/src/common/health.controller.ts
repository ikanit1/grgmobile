import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get('health')
  healthCheck() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      dbType: process.env.DB_TYPE || 'unknown',
      port: process.env.PORT || 3000,
    };
  }
}
