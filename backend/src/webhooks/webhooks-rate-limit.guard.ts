import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';

const WINDOW_MS = 60 * 1000; // 1 minute

interface Entry {
  count: number;
  resetAt: number;
}

@Injectable()
export class WebhookRateLimitGuard implements CanActivate {
  private readonly store = new Map<string, Entry>();
  private readonly maxAttempts: number;

  constructor() {
    const envMax = process.env.WEBHOOK_RATE_LIMIT_MAX;
    this.maxAttempts = envMax ? parseInt(envMax, 10) : 100;
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    let entry = this.store.get(ip);
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + WINDOW_MS };
      this.store.set(ip, entry);
    }
    entry.count++;
    if (entry.count > this.maxAttempts) {
      throw new HttpException(
        `Слишком много запросов вебхука. Лимит: ${this.maxAttempts} в минуту.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
