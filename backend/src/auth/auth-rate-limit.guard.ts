import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';

const WINDOW_MS = 60 * 1000;
const MAX_ATTEMPTS = 10;

interface Entry {
  count: number;
  resetAt: number;
}

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  private readonly store = new Map<string, Entry>();

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
    if (entry.count > MAX_ATTEMPTS) {
      throw new HttpException(
        `Слишком много попыток. Попробуйте через минуту.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
