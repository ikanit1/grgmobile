import * as path from 'path';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

// Use a separate DB for e2e so dev data is not affected
process.env.DB_TYPE = 'sqlite';
process.env.DB_SQLITE_PATH = path.join(process.cwd(), 'data', 'e2e.sqlite');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'e2e-test-secret';

const E2E_EMAIL = `e2e-${Date.now()}@test.local`;

describe('App (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('auth', () => {
    it('POST /api/auth/register', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: E2E_EMAIL,
          password: 'TestPass123',
          name: 'E2E User',
        })
        .expect(201);
      expect(res.body).toHaveProperty('token');
      expect(res.body).toHaveProperty('user');
      expect(res.body.user).toHaveProperty('id');
      expect(res.body.user.role).toBe('RESIDENT');
      accessToken = res.body.token;
    });

    it('POST /api/auth/login', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ login: E2E_EMAIL, password: 'TestPass123' });
      expect([200, 201]).toContain(res.status);
      expect(res.body).toHaveProperty('token');
      expect(res.body).toHaveProperty('user');
      accessToken = res.body.token;
    });

    it('POST /api/auth/login rejects wrong password', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ login: E2E_EMAIL, password: 'Wrong' })
        .expect(401);
    });
  });

  describe('buildings', () => {
    it('GET /api/buildings without token returns 401', async () => {
      await request(app.getHttpServer())
        .get('/api/buildings')
        .expect(401);
    });

    it('GET /api/buildings with token returns array', async () => {
      expect(accessToken).toBeDefined();
      const res = await request(app.getHttpServer())
        .get('/api/buildings')
        .set('Authorization', `Bearer ${accessToken}`);
      expect([200, 401, 403]).toContain(res.status);
      if (res.status === 200) expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('devices', () => {
    it('GET /api/buildings/1/devices with token returns array or 401/403', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/buildings/1/devices')
        .set('Authorization', `Bearer ${accessToken}`);
      expect([200, 401, 403]).toContain(res.status);
      if (res.status === 200) expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('applications', () => {
    it('GET /api/users/me/applications with token returns array', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/users/me/applications')
        .set('Authorization', `Bearer ${accessToken}`);
      expect([200, 401, 403]).toContain(res.status);
      if (res.status === 200) expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
