import { of, throwError } from 'rxjs';
import { AxiosResponse } from 'axios';
import { AkuvoxClient } from './akuvox.client';
import { CredentialsService } from '../../credentials/credentials.service';
import { Device, DeviceType, DeviceRole } from '../../devices/entities/device.entity';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDevice(overrides: Partial<Device> = {}): Device {
  const d = new Device();
  d.id = 1;
  d.name = 'Test Panel';
  d.type = DeviceType.AKUVOX;
  d.role = DeviceRole.DOORPHONE;
  d.host = '192.168.1.100';
  d.httpPort = 80;
  d.rtspPort = 554;
  d.status = 'online';
  d.isConfigured = false;
  d.buildingId = 1;
  d.credentials = { encrypted: 'fake-encrypted-blob' } as any;
  return Object.assign(d, overrides);
}

function axiosResp<T>(data: T, status = 200): AxiosResponse<T> {
  return {
    data,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: {},
    config: { headers: {} } as any,
  };
}

function makeCredSvc(
  result: { username: string; password: string } | null = { username: 'admin', password: 'secret' },
): jest.Mocked<CredentialsService> {
  return { decrypt: jest.fn().mockReturnValue(result), encrypt: jest.fn() } as unknown as jest.Mocked<CredentialsService>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AkuvoxClient', () => {
  let device: Device;

  beforeEach(() => {
    device = makeDevice();
  });

  // ---- openDoor ----

  describe('openDoor', () => {
    it('returns success=true when retcode === 0', async () => {
      const http = { get: jest.fn().mockReturnValue(of(axiosResp({ retcode: 0 }))) };
      const client = new AkuvoxClient(http as any, makeCredSvc());
      const res = await client.openDoor(device, 1);
      expect(res.success).toBe(true);
      expect(res.message).toBe('Дверь открыта');
    });

    it('returns success=true when result === 0', async () => {
      const http = { get: jest.fn().mockReturnValue(of(axiosResp({ result: 0 }))) };
      expect((await new AkuvoxClient(http as any, makeCredSvc()).openDoor(device, 1)).success).toBe(true);
    });

    it('returns success=true when success === true', async () => {
      const http = { get: jest.fn().mockReturnValue(of(axiosResp({ success: true }))) };
      expect((await new AkuvoxClient(http as any, makeCredSvc()).openDoor(device, 1)).success).toBe(true);
    });

    it('returns success=false when retcode !== 0', async () => {
      const http = { get: jest.fn().mockReturnValue(of(axiosResp({ retcode: 1 }))) };
      const res = await new AkuvoxClient(http as any, makeCredSvc()).openDoor(device, 1);
      expect(res.success).toBe(false);
    });

    it('returns success=false on network error (does not throw)', async () => {
      const http = { get: jest.fn().mockReturnValue(throwError(() => new Error('ECONNREFUSED'))) };
      const res = await new AkuvoxClient(http as any, makeCredSvc()).openDoor(device, 1);
      expect(res.success).toBe(false);
      expect(res.message).toBe('Не удалось открыть дверь');
    });

    it('clamps relay index to [1..255]', async () => {
      const get = jest.fn().mockReturnValue(of(axiosResp({ retcode: 0 })));
      const client = new AkuvoxClient({ get } as any, makeCredSvc());
      await client.openDoor(device, 0);
      expect(get).toHaveBeenLastCalledWith(expect.stringContaining('index=1'), expect.anything());
      await client.openDoor(device, 999);
      expect(get).toHaveBeenLastCalledWith(expect.stringContaining('index=255'), expect.anything());
    });

    it('uses Basic auth header from decrypted credentials', async () => {
      const get = jest.fn().mockReturnValue(of(axiosResp({ retcode: 0 })));
      const client = new AkuvoxClient({ get } as any, makeCredSvc({ username: 'user1', password: 'pass1' }));
      await client.openDoor(device, 1);
      const expectedToken = Buffer.from('user1:pass1', 'utf-8').toString('base64');
      expect(get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ headers: { Authorization: `Basic ${expectedToken}` } }),
      );
    });

    it('falls back to device.username/password when decrypt returns null', async () => {
      const get = jest.fn().mockReturnValue(of(axiosResp({ retcode: 0 })));
      const d = makeDevice({ username: 'fallback', password: 'fbpass', credentials: undefined });
      const client = new AkuvoxClient({ get } as any, makeCredSvc(null));
      await client.openDoor(d, 1);
      const expectedToken = Buffer.from('fallback:fbpass', 'utf-8').toString('base64');
      expect(get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ headers: { Authorization: `Basic ${expectedToken}` } }),
      );
    });
  });

  // ---- getSystemInfo ----

  describe('getSystemInfo', () => {
    it('returns data payload on success', async () => {
      const payload = { model: 'X912', firmware: '2.1.3' };
      const http = { get: jest.fn().mockReturnValue(of(axiosResp({ retcode: 0, data: payload }))) };
      const result = await new AkuvoxClient(http as any, makeCredSvc()).getSystemInfo(device);
      expect(result).toEqual(payload);
    });

    it('throws when retcode !== 0', async () => {
      const http = { get: jest.fn().mockReturnValue(of(axiosResp({ retcode: 1, message: 'Auth failed' }))) };
      await expect(new AkuvoxClient(http as any, makeCredSvc()).getSystemInfo(device)).rejects.toThrow('Auth failed');
    });

    it('throws with default message when retcode !== 0 and no message field', async () => {
      const http = { get: jest.fn().mockReturnValue(of(axiosResp({ retcode: 1 }))) };
      await expect(new AkuvoxClient(http as any, makeCredSvc()).getSystemInfo(device)).rejects.toThrow('Не удалось получить данные устройства');
    });

    it('throws when status !== 200', async () => {
      const http = { get: jest.fn().mockReturnValue(of(axiosResp({ retcode: 0 }, 503))) };
      await expect(new AkuvoxClient(http as any, makeCredSvc()).getSystemInfo(device)).rejects.toThrow();
    });

    it('propagates network error', async () => {
      const http = { get: jest.fn().mockReturnValue(throwError(() => new Error('ETIMEDOUT'))) };
      await expect(new AkuvoxClient(http as any, makeCredSvc()).getSystemInfo(device)).rejects.toThrow('ETIMEDOUT');
    });
  });

  // ---- getDoorLog ----

  describe('getDoorLog', () => {
    it('returns list from data.list', async () => {
      const entries = [{ id: 1 }, { id: 2 }];
      const http = { get: jest.fn().mockReturnValue(of(axiosResp({ data: { list: entries } }))) };
      expect(await new AkuvoxClient(http as any, makeCredSvc()).getDoorLog(device)).toEqual(entries);
    });

    it('returns list from top-level list field', async () => {
      const entries = [{ id: 3 }];
      const http = { get: jest.fn().mockReturnValue(of(axiosResp({ list: entries }))) };
      expect(await new AkuvoxClient(http as any, makeCredSvc()).getDoorLog(device)).toEqual(entries);
    });

    it('returns empty array when no recognized list field present', async () => {
      const http = { get: jest.fn().mockReturnValue(of(axiosResp({}))) };
      expect(await new AkuvoxClient(http as any, makeCredSvc()).getDoorLog(device)).toEqual([]);
    });

    it('throws when status !== 200', async () => {
      const http = { get: jest.fn().mockReturnValue(of(axiosResp({}, 503))) };
      await expect(new AkuvoxClient(http as any, makeCredSvc()).getDoorLog(device)).rejects.toThrow();
    });
  });

  // ---- getRelayStatus ----

  describe('getRelayStatus', () => {
    it('returns data on success', async () => {
      const payload = { relay1: 'idle' };
      const http = { get: jest.fn().mockReturnValue(of(axiosResp({ retcode: 0, data: payload }))) };
      expect(await new AkuvoxClient(http as any, makeCredSvc()).getRelayStatus(device)).toEqual(payload);
    });

    it('throws with message from response', async () => {
      const http = { get: jest.fn().mockReturnValue(of(axiosResp({ retcode: 1, message: 'Relay error' }))) };
      await expect(new AkuvoxClient(http as any, makeCredSvc()).getRelayStatus(device)).rejects.toThrow('Relay error');
    });

    it('throws with default message when body message is absent', async () => {
      const http = { get: jest.fn().mockReturnValue(of(axiosResp({ retcode: 1 }))) };
      await expect(new AkuvoxClient(http as any, makeCredSvc()).getRelayStatus(device)).rejects.toThrow('Не удалось получить статус реле');
    });
  });

  // ---- getLiveUrl ----

  describe('getLiveUrl', () => {
    it('builds correct RTSP URL with encoded credentials', async () => {
      const client = new AkuvoxClient({ get: jest.fn() } as any, makeCredSvc({ username: 'admin', password: 'p@ss' }));
      const d = makeDevice({ host: '10.0.0.1', rtspPort: 554 });
      const result = await client.getLiveUrl(d, {});
      expect(result.protocol).toBe('rtsp');
      expect(result.url).toMatch(/^rtsp:\/\/admin:p%40ss@10\.0\.0\.1:554/);
    });

    it('uses device defaultStream for path', async () => {
      const client = new AkuvoxClient({ get: jest.fn() } as any, makeCredSvc());
      const d = makeDevice({ host: '10.0.0.1', rtspPort: 554, defaultStream: 'stream1' });
      const result = await client.getLiveUrl(d, {});
      expect(result.url).toContain('/stream1');
    });

    it('defaults to stream1 when no defaults configured', async () => {
      const client = new AkuvoxClient({ get: jest.fn() } as any, makeCredSvc());
      const d = makeDevice({ host: '10.0.0.1', rtspPort: 554 });
      const result = await client.getLiveUrl(d, { channel: 1 });
      expect(result.url).toContain('/stream1');
    });
  });

  // ---- openDoor (network call correctness) ----

  describe('openDoor URL', () => {
    it('calls correct Akuvox endpoint', async () => {
      const get = jest.fn().mockReturnValue(of(axiosResp({ retcode: 0 })));
      const client = new AkuvoxClient({ get } as any, makeCredSvc());
      await client.openDoor(device, 1);
      expect(get).toHaveBeenCalledWith(
        'http://192.168.1.100:80/fcgi/do?action=openDoor&index=1',
        expect.anything(),
      );
    });
  });
});
