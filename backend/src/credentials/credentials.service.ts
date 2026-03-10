import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

const ALG = 'aes-256-gcm';
const IV_LEN = 16;
const AUTH_TAG_LEN = 16;
const KEY_LEN = 32;

@Injectable()
export class CredentialsService {
  private readonly key: Buffer;

  constructor() {
    const envKey = process.env.CREDENTIALS_ENCRYPTION_KEY;
    if (envKey && envKey.length >= 32) {
      this.key = Buffer.from(envKey.slice(0, 32), 'utf-8');
    } else {
      this.key = crypto.scryptSync('dev-default-key-change-in-production', 'salt', KEY_LEN);
    }
  }

  encrypt(plain: { username: string; password: string }): Record<string, string> {
    const iv = crypto.randomBytes(IV_LEN);
    const cipher = crypto.createCipheriv(ALG, this.key, iv);
    const enc = Buffer.concat([
      cipher.update(JSON.stringify(plain), 'utf-8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    const combined = Buffer.concat([iv, authTag, enc]);
    return { encrypted: combined.toString('base64') };
  }

  decrypt(credentials: Record<string, string> | null | undefined): { username: string; password: string } | null {
    if (!credentials?.encrypted) return null;
    try {
      const combined = Buffer.from(credentials.encrypted, 'base64');
      const iv = combined.subarray(0, IV_LEN);
      const authTag = combined.subarray(IV_LEN, IV_LEN + AUTH_TAG_LEN);
      const enc = combined.subarray(IV_LEN + AUTH_TAG_LEN);
      const decipher = crypto.createDecipheriv(ALG, this.key, iv);
      decipher.setAuthTag(authTag);
      const plain = decipher.update(enc) + decipher.final('utf-8');
      return JSON.parse(plain) as { username: string; password: string };
    } catch {
      return null;
    }
  }
}
