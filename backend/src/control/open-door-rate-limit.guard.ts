import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_OPEN_PER_USER_PER_MINUTE = 20;

interface Entry {
  count: number;
  resetAt: number;
}

@Injectable()
export class OpenDoorRateLimitGuard implements CanActivate {
  private readonly store = new Map<string, Entry>();

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const user = (req as any).user;
    if (!user?.id) return true; // no user, let auth guard handle
    const key = `open:${user.id}`;
    const now = Date.now();
    let entry = this.store.get(key);
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + WINDOW_MS };
      this.store.set(key, entry);
    }
    entry.count++;
    if (entry.count > MAX_OPEN_PER_USER_PER_MINUTE) {
      throw new HttpException(
        `Слишком много запросов на открытие двери. Лимит: ${MAX_OPEN_PER_USER_PER_MINUTE} в минуту.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
