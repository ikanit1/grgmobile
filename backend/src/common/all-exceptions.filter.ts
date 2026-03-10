import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Внутренняя ошибка сервера';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exRes = exception.getResponse();
      if (typeof exRes === 'string') {
        message = exRes;
      } else if (typeof exRes === 'object' && exRes !== null) {
        message = (exRes as any).message ?? exception.message;
      }
    } else if (exception instanceof Error) {
      // eslint-disable-next-line no-console
      console.error('[UnhandledException]', exception.stack || exception.message);
    }

    response.status(status).json({
      statusCode: status,
      message,
    });
  }
}
