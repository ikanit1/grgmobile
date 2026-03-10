import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { IntercomEventDto } from './dto/intercom-event.dto';
import { AkuvoxWebhookDto } from './dto/akuvox-webhook.dto';

/**
 * Публичные эндпоинты для приёма событий от панелей домофонов (без JWT).
 * Опционально: заголовок X-Webhook-Secret = WEBHOOK_SECRET из .env для проверки.
 */
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('intercom/event')
  @HttpCode(HttpStatus.OK)
  async intercomEvent(
    @Body() dto: IntercomEventDto,
    @Headers('x-webhook-secret') secret?: string,
  ) {
    this.webhooksService.validateSecret(secret);
    return this.webhooksService.handleIntercomEvent(dto);
  }

  @Post('akuvox')
  @HttpCode(HttpStatus.OK)
  async akuvoxEvent(
    @Body() dto: AkuvoxWebhookDto,
    @Headers('x-webhook-secret') secret?: string,
  ) {
    return this.webhooksService.handleAkuvoxEvent(dto, secret);
  }
}
