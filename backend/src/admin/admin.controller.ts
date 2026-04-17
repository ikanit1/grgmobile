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

  @Get('docs/TUTORIAL.md')
  getTutorial(@Res() res: Response) {
    const tutorialPath = join(process.cwd(), '..', 'docs', 'TUTORIAL.md');
    const fallback = join(process.cwd(), 'docs', 'TUTORIAL.md');
    const path = existsSync(tutorialPath) ? tutorialPath : fallback;
    if (!existsSync(path)) {
      return res.status(404).send('Tutorial not found');
    }
    const md = readFileSync(path, 'utf-8');
    // Render as simple HTML for browser readability
    const html = `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GRG Mobile — Туториал</title>
<style>body{font-family:system-ui,sans-serif;max-width:900px;margin:2rem auto;padding:0 1rem;line-height:1.7;color:#1a1a2e;background:#f8f9fa}h1{color:#7c3aed}h2{color:#5b21b6;border-bottom:2px solid #e9d5ff;padding-bottom:0.3rem;margin-top:2rem}h3{color:#6d28d9}code{background:#f3e8ff;padding:2px 6px;border-radius:4px;font-size:0.9em}pre{background:#1e1b4b;color:#e9d5ff;padding:1rem;border-radius:8px;overflow-x:auto}pre code{background:none;color:inherit;padding:0}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:8px 12px;text-align:left}th{background:#f3e8ff;color:#5b21b6}tr:nth-child(even){background:#faf5ff}blockquote{border-left:4px solid #7c3aed;margin:0;padding:0.5rem 1rem;background:#faf5ff;color:#5b21b6}a{color:#7c3aed}ul,ol{padding-left:1.5rem}li{margin:0.3rem 0}
</style></head><body>
<a href="/api/admin" style="display:inline-block;margin-bottom:1rem;padding:0.4rem 1rem;background:#7c3aed;color:#fff;border-radius:6px;text-decoration:none;">← Вернуться в админку</a>
<div id="content"></div>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<script>document.getElementById('content').innerHTML=marked.parse(${JSON.stringify(md)});</script>
</body></html>`;
    res.type('text/html').send(html);
  }
}
