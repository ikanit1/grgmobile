import { Body, Controller, UseGuards, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { IntercomEventDto } from './dto/intercom-event.dto';
import { AkuvoxWebhookDto } from './dto/akuvox-webhook.dto';
import { UniviewWebhookDto } from './dto/uniview-webhook.dto';
import { WebhookRateLimitGuard } from './webhooks-rate-limit.guard';

/**
 * Публичные эндпоинты для приёма событий от панелей домофонов (без JWT).
 * Опционально: заголовок X-Webhook-Secret = WEBHOOK_SECRET из .env для проверки.
 */
@UseGuards(WebhookRateLimitGuard)
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

  @Post('uniview')
  @HttpCode(HttpStatus.OK)
  async univiewEvent(
    @Body() dto: UniviewWebhookDto,
    @Headers('x-webhook-secret') secret?: string,
  ) {
    return this.webhooksService.handleUniviewEvent(dto, secret);
  }
}
