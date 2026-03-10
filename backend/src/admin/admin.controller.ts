import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { AdminService } from './admin.service';

@Controller()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('health')
  async getHealth() {
    return this.adminService.getHealth();
  }

  @Get('admin')
  getAdminPage(@Res() res: Response) {
    const path = join(process.cwd(), 'public', 'admin.html');
    if (!existsSync(path)) {
      return res.type('text/html').status(404).send('<h1>admin.html not found</h1><p>Create backend/public/admin.html</p>');
    }
    const html = readFileSync(path, 'utf-8');
    res.type('text/html').send(html);
  }
}
