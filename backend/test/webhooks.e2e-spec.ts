/**
 * E2E tests for POST /api/webhooks/akuvox endpoint.
 *
 * Uses SQLite in-memory (separate DB file) to isolate from dev data.
 * WEBHOOK_SECRET is set before AppModule loads.
 */

import * as path from 'path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { Device, DeviceType, DeviceRole } from '../src/devices/entities/device.entity';
import { EventLog } from '../src/events/entities/event-log.entity';

// ─── Environment must be set before AppModule loads ────────────────────────
const TEST_WEBHOOK_SECRET = 'test-webhook-secret-e2e';
const TEST_MAC = '0C:11:05:22:BE:A4';

process.env.DB_TYPE = 'sqlite';
process.env.DB_SQLITE_PATH = path.join(process.cwd(), 'data', 'webhooks-e2e.sqlite');
process.env.JWT_SECRET = 'test-jwt-secret-webhooks-32bytes!!';
process.env.WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
process.env.CREDENTIALS_ENCRYPTION_KEY = 'test-encryption-key-32-bytes!!!!';

describe('POST /api/webhooks/akuvox (e2e)', () => {
  let app: INestApplication;
  let devicesRepo: Repository<Device>;
  let eventLogRepo: Repository<EventLog>;
  let testDevice: Device;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    devicesRepo = moduleFixture.get<Repository<Device>>(getRepositoryToken(Device));
    eventLogRepo = moduleFixture.get<Repository<EventLog>>(getRepositoryToken(EventLog));

    // Create a test device with known MAC
    testDevice = devicesRepo.create({
      name: 'Test Akuvox Panel',
      type: DeviceType.AKUVOX,
      role: DeviceRole.DOORPHONE,
      host: '192.168.1.100',
      httpPort: 80,
      rtspPort: 554,
      macAddress: TEST_MAC,
      status: 'online',
      isConfigured: true,
      buildingId: 1,
    });
    testDevice = await devicesRepo.save(testDevice);
  });

  afterAll(async () => {
    await devicesRepo.delete({ id: testDevice.id });
    await app.close();
  });

  // ─── Secret validation ────────────────────────────────────────────────────

  describe('secret validation', () => {
    it('returns 401 when X-Webhook-Secret is absent', () =>
      request(app.getHttpServer())
        .post('/api/webhooks/akuvox')
        .send({ mac: TEST_MAC, eventType: 'door_open' })
        .expect(401));

    it('returns 401 when X-Webhook-Secret is wrong', () =>
      request(app.getHttpServer())
        .post('/api/webhooks/akuvox')
        .set('X-Webhook-Secret', 'wrong-secret')
        .send({ mac: TEST_MAC, eventType: 'door_open' })
        .expect(401));

    it('returns 200 with valid secret and known MAC', () =>
      request(app.getHttpServer())
        .post('/api/webhooks/akuvox')
        .set('X-Webhook-Secret', TEST_WEBHOOK_SECRET)
        .send({ mac: TEST_MAC, eventType: 'door_open' })
        .expect(200));
  });

  // ─── MAC validation ───────────────────────────────────────────────────────

  describe('MAC validation', () => {
    it('returns 403 when MAC is not registered', () =>
      request(app.getHttpServer())
        .post('/api/webhooks/akuvox')
        .set('X-Webhook-Secret', TEST_WEBHOOK_SECRET)
        .send({ mac: 'AA:BB:CC:DD:EE:FF', eventType: 'door_open' })
        .expect(403));

    it('matches MAC case-insensitively (dashes, lowercase)', () => {
      const macVariant = TEST_MAC.replace(/:/g, '-').toLowerCase();
      return request(app.getHttpServer())
        .post('/api/webhooks/akuvox')
        .set('X-Webhook-Secret', TEST_WEBHOOK_SECRET)
        .send({ mac: macVariant, eventType: 'door_open' })
        .expect(200);
    });
  });

  // ─── Event persistence ────────────────────────────────────────────────────

  describe('event persistence', () => {
    it('creates EventLog record for door_open event', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/webhooks/akuvox')
        .set('X-Webhook-Secret', TEST_WEBHOOK_SECRET)
        .send({ mac: TEST_MAC, eventType: 'door_open' })
        .expect(200);

      const { logId } = res.body as { logId: number };
      expect(typeof logId).toBe('number');

      const log = await eventLogRepo.findOne({ where: { id: logId } });
      expect(log).toBeDefined();
      expect(log!.deviceId).toBe(testDevice.id);
      expect(log!.eventType).toContain('door_open');
    });

    it('stores payload fields in EventLog.data', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/webhooks/akuvox')
        .set('X-Webhook-Secret', TEST_WEBHOOK_SECRET)
        .send({ mac: TEST_MAC, eventType: 'door_open', payload: { floor: 3, unit: 'A' } })
        .expect(200);

      const log = await eventLogRepo.findOne({ where: { id: (res.body as any).logId } });
      expect(log!.data).toMatchObject({ floor: 3, unit: 'A', mac: TEST_MAC });
    });

    it('returns logId in response body', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/webhooks/akuvox')
        .set('X-Webhook-Secret', TEST_WEBHOOK_SECRET)
        .send({ mac: TEST_MAC, eventType: 'call_finished' })
        .expect(200);

      expect(res.body).toHaveProperty('logId');
      expect(typeof (res.body as any).logId).toBe('number');
    });
  });

  // ─── Request body validation ──────────────────────────────────────────────

  describe('body validation', () => {
    it('returns 400 when mac field is missing', () =>
      request(app.getHttpServer())
        .post('/api/webhooks/akuvox')
        .set('X-Webhook-Secret', TEST_WEBHOOK_SECRET)
        .send({ eventType: 'door_open' })
        .expect(400));

    it('returns 400 when eventType field is missing', () =>
      request(app.getHttpServer())
        .post('/api/webhooks/akuvox')
        .set('X-Webhook-Secret', TEST_WEBHOOK_SECRET)
        .send({ mac: TEST_MAC })
        .expect(400));
  });
});
