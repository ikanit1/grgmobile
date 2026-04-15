/**
 * Утилита для маскирования чувствительных данных в логах.
 * Использовать перед любым логированием объектов, которые могут содержать пароли, токены и т.п.
 */

export function sanitizeLogData(data: any): any {
  if (typeof data !== 'object' || data === null) {
    return data;
  }

  const SENSITIVE_KEYS = [
    'password',
    'passwordHash',
    'token',
    'accessToken',
    'refreshToken',
    'refreshTokenHash',
    'credentials',
    'authorization',
    'secret',
    'apiKey',
    'fcmToken',
    'pushToken',
    'webhookSecret',
    'jwtSecret',
    'encryptionKey',
    'serviceAccountJson',
    'googleApplicationCredentials',
  ];

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeLogData(item));
  }

  const sanitized: any = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEYS.includes(key.toLowerCase())) {
      sanitized[key] = '***REDACTED***';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeLogData(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Удобный метод для безопасного логирования объектов в одном вызове.
 * Пример: this.logger.log(`Event: ${safeLog(data)}`);
 */
export function safeLog(data: any): string {
  try {
    const sanitized = sanitizeLogData(data);
    return JSON.stringify(sanitized);
  } catch (e) {
    return '[Unserializable data]';
  }
}
