import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

/**
 * Валидатор для проверки host на SSRF-уязвимости.
 * Запрещает:
 * - loopback: 127.0.0.0/8
 * - link-local: 169.254.0.0/16
 * - unspecified: 0.0.0.0/8
 * - multicast: 224.0.0.0/4
 * - reserved: 240.0.0.0/4
 *
 * Разрешает:
 * - Публичные IP
 * - Частные сети (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16) — разрешены для локальных устройств
 * - Доменные имена (any)
 */
function isIpAddress(host: string): boolean {
  // Простая проверка на IPv4
  const parts = host.split('.');
  if (parts.length !== 4) return false;
  for (const part of parts) {
    const num = Number(part);
    if (Number.isNaN(num) || num < 0 || num > 255) return false;
    // нет ведущих нулей, кроме "0"
    if (part.length > 1 && part[0] === '0') return false;
  }
  return true;
}

function ipToNumber(ip: string): number {
  const parts = ip.split('.').map(Number);
  return (parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3];
}

function isForbiddenIp(ip: string): boolean {
  const num = ipToNumber(ip);

  // 127.0.0.0/8 (loopback)
  if ((num & 0xFF000000) === 0x7F000000) return true;

  // 169.254.0.0/16 (link-local)
  if ((num & 0xFFFF0000) === 0xA9FE0000) return true;

  // 0.0.0.0/8 (unspecified)
  if ((num & 0xFF000000) === 0x00000000) return true;

  // 224.0.0.0/4 (multicast)
  if ((num & 0xF0000000) === 0xE0000000) return true;

  // 240.0.0.0/4 (reserved)
  if ((num & 0xF0000000) === 0xF0000000) return true;

  return false;
}

@ValidatorConstraint({ name: 'isValidHost', async: false })
export class IsValidHostConstraint implements ValidatorConstraintInterface {
  validate(host: any, _args: ValidationArguments): boolean {
    if (typeof host !== 'string' || host.trim() === '') {
      return true; // optional, let IsOptional handle emptiness
    }

    const trimmed = host.trim();

    // Если это домен (содержит буквы или дефисы), считаем валидным
    if (/[a-zA-Z\-]/.test(trimmed)) {
      return true;
    }

    // Если это IP-адрес, проверяем формат и запрещенные диапазоны
    if (isIpAddress(trimmed)) {
      return !isForbiddenIp(trimmed);
    }

    // Неизвестный формат — отклоняем для безопасности
    return false;
  }

  defaultMessage(_args: ValidationArguments): string {
    return 'Host содержит недопустимый IP адрес (запрещены loopback, link-local и специальные диапазоны)';
  }
}

export function IsValidHost(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: IsValidHostConstraint,
    });
  };
}
