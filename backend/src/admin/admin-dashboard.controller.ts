import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestUser } from '../auth/request-user.interface';
import { AdminDashboardService, DashboardStats } from './admin-dashboard.service';

@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminDashboardController {
  constructor(private readonly dashboardService: AdminDashboardService) {}

  @Get('dashboard')
  async getDashboard(@Req() req: { user: RequestUser }): Promise<DashboardStats> {
    return this.dashboardService.getStats(req.user);
  }
}
