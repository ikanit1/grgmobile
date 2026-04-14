import { of } from 'rxjs';
import { AxiosResponse } from 'axios';
import { UniviewLiteapiHttpClient } from './uniview-liteapi-http.client';
import { CredentialsService } from '../../credentials/credentials.service';
import { Device, DeviceType, DeviceRole } from '../../devices/entities/device.entity';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDevice(overrides: Partial<Device> = {}): Device {
  const d = new Device();
  d.id = 2;
  d.name = 'Test IPC';
  d.type = DeviceType.UNIVIEW_IPC;
  d.role = DeviceRole.CAMERA;
  d.host = '192.168.1.200';
  d.httpPort = 80;
  d.rtspPort = 554;
  d.status = 'online';
  d.isConfigured = false;
  d.buildingId = 1;
  d.defaultChannel = 1;
  d.defaultStream = 'main';
  d.credentials = { encrypted: 'fake-encrypted-blob' } as any;
  return Object.assign(d, overrides);
}

function axiosResp<T>(
  data: T,
  status = 200,
  headers: Record<string, string> = {},
): AxiosResponse<T> {
  return { data, status, statusText: 'OK', headers, config: { headers: {} } as any };
}

function makeCredSvc(
  result: { username: string; password: string } | null = { username: 'admin', password: 'uniview123' },
): jest.Mocked<CredentialsService> {
  return { decrypt: jest.fn().mockReturnValue(result), encrypt: jest.fn() } as unknown as jest.Mocked<CredentialsService>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UniviewLiteapiHttpClient', () => {
  let device: Device;

  beforeEach(() => {
    device = makeDevice();
  });

  // ---- openDoor ----

  describe('openDoor', () => {
    it('returns success=true on 200 response', async () => {
      const req = jest.fn().mockReturnValue(of(axiosResp({ ResponseCode: 0 })));
      const client = new UniviewLiteapiHttpClient({ request: req } as any, makeCredSvc());
      const result = await client.openDoor(device);
      expect(result.success).toBe(true);
      expect(result.message).toBe('Дверь открыта');
    });

    it('calls correct LiteAPI path', async () => {
      const req = jest.fn().mockReturnValue(of(axiosResp({ ResponseCode: 0 })));
      const client = new UniviewLiteapiHttpClient({ request: req } as any, makeCredSvc());
      await client.openDoor(device);
      expect(req).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: 'http://192.168.1.200:80/LAPI/V1.0/Channels/1/OpenDoor',
        }),
      );
    });

    it('uses custom channelId when provided', async () => {
      const req = jest.fn().mockReturnValue(of(axiosResp({ ResponseCode: 0 })));
      const client = new UniviewLiteapiHttpClient({ request: req } as any, makeCredSvc());
      await client.openDoor(device, 5);
      expect(req).toHaveBeenCalledWith(
        expect.objectContaining({ url: expect.stringContaining('/Channels/5/OpenDoor') }),
      );
    });

    it('completes Digest auth flow on 401 with WWW-Authenticate', async () => {
      const wwwAuth = 'Digest realm="IPCamera", nonce="abc123", qop="auth", algorithm=MD5';
      const req = jest.fn()
        .mockReturnValueOnce(of(axiosResp({}, 401, { 'www-authenticate': wwwAuth })))
        .mockReturnValueOnce(of(axiosResp({ ResponseCode: 0 })));
      const client = new UniviewLiteapiHttpClient({ request: req } as any, makeCredSvc());
      const result = await client.openDoor(device);
      expect(result.success).toBe(true);
      expect(req).toHaveBeenCalledTimes(2);
      const secondCall = req.mock.calls[1][0];
      expect(secondCall.headers.Authorization).toMatch(/^Digest /);
    });

    it('returns success=false on 4xx without retry', async () => {
      const req = jest.fn().mockReturnValue(of(axiosResp({ message: 'Forbidden' }, 403)));
      const client = new UniviewLiteapiHttpClient({ request: req } as any, makeCredSvc());
      const result = await client.openDoor(device);
      expect(result.success).toBe(false);
    });

    it('does not retry when WWW-Authenticate header absent after 401', async () => {
      const req = jest.fn().mockReturnValue(of(axiosResp({}, 401, {})));
      const client = new UniviewLiteapiHttpClient({ request: req } as any, makeCredSvc());
      await client.openDoor(device);
      expect(req).toHaveBeenCalledTimes(1);
    });

    it('does not retry when credentials are empty', async () => {
      const credSvc = makeCredSvc(null);
      const d = makeDevice({ username: undefined, password: undefined, credentials: undefined });
      const wwwAuth = 'Digest realm="IPCamera", nonce="abc", qop="auth"';
      const req = jest.fn().mockReturnValue(of(axiosResp({}, 401, { 'www-authenticate': wwwAuth })));
      const client = new UniviewLiteapiHttpClient({ request: req } as any, credSvc);
      await client.openDoor(d);
      expect(req).toHaveBeenCalledTimes(1);
    });
  });

  // ---- getLiveUrl ----

  describe('getLiveUrl', () => {
    it('returns RTSP URL from Data.Url field', async () => {
      const rtsp = 'rtsp://192.168.1.200:554/unicast/c1/s0/live';
      const req = jest.fn().mockReturnValue(of(axiosResp({ Data: { Url: rtsp } })));
      const result = await new UniviewLiteapiHttpClient({ request: req } as any, makeCredSvc()).getLiveUrl(device, {});
      expect(result.protocol).toBe('rtsp');
      expect(result.url).toBe(rtsp);
    });

    it('returns RTSP URL from Data.URL field (uppercase)', async () => {
      const rtsp = 'rtsp://192.168.1.200:554/live';
      const req = jest.fn().mockReturnValue(of(axiosResp({ Data: { URL: rtsp } })));
      expect((await new UniviewLiteapiHttpClient({ request: req } as any, makeCredSvc()).getLiveUrl(device, {})).url).toBe(rtsp);
    });

    it('returns empty string when Data URL fields absent', async () => {
      const req = jest.fn().mockReturnValue(of(axiosResp({ Data: {} })));
      expect((await new UniviewLiteapiHttpClient({ request: req } as any, makeCredSvc()).getLiveUrl(device, {})).url).toBe('');
    });

    it('requests correct path with stream type from query', async () => {
      const req = jest.fn().mockReturnValue(of(axiosResp({ Data: { Url: '' } })));
      await new UniviewLiteapiHttpClient({ request: req } as any, makeCredSvc()).getLiveUrl(device, { channel: 2, stream: 'sub' });
      expect(req).toHaveBeenCalledWith(
        expect.objectContaining({ url: expect.stringContaining('/Channels/2/Media/LiveViewURL?StreamType=sub') }),
      );
    });

    it('falls back to device defaults when query has no channel/stream', async () => {
      const req = jest.fn().mockReturnValue(of(axiosResp({ Data: { Url: '' } })));
      const d = makeDevice({ defaultChannel: 3, defaultStream: 'sub' });
      await new UniviewLiteapiHttpClient({ request: req } as any, makeCredSvc()).getLiveUrl(d, {});
      expect(req).toHaveBeenCalledWith(
        expect.objectContaining({ url: expect.stringContaining('/Channels/3/Media/LiveViewURL?StreamType=sub') }),
      );
    });
  });

  // ---- getSystemInfo ----

  describe('getSystemInfo', () => {
    it('returns Data payload from /System/Equipment', async () => {
      const payload = { DeviceModel: 'IPC3614SR3' };
      const req = jest.fn().mockReturnValue(of(axiosResp({ Data: payload })));
      const result = await new UniviewLiteapiHttpClient({ request: req } as any, makeCredSvc()).getSystemInfo(device);
      expect(result).toEqual(payload);
      expect(req).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'http://192.168.1.200:80/LAPI/V1.0/System/Equipment', method: 'GET' }),
      );
    });

    it('throws LiteAPI error when status >= 400', async () => {
      const req = jest.fn().mockReturnValue(of(axiosResp({ message: 'Not found' }, 404)));
      await expect(new UniviewLiteapiHttpClient({ request: req } as any, makeCredSvc()).getSystemInfo(device)).rejects.toThrow('LiteAPI 404');
    });

    it('returns root response when Data field absent', async () => {
      const req = jest.fn().mockReturnValue(of(axiosResp({ DeviceModel: 'IPC' })));
      const result = await new UniviewLiteapiHttpClient({ request: req } as any, makeCredSvc()).getSystemInfo(device);
      expect(result).toMatchObject({ DeviceModel: 'IPC' });
    });
  });

  // ---- getEvents ----

  describe('getEvents', () => {
    it('returns list from DoorLogs field', async () => {
      const logs = [{ id: 1, action: 'open' }];
      const req = jest.fn().mockReturnValue(of(axiosResp({ Data: { DoorLogs: logs } })));
      const result = await new UniviewLiteapiHttpClient({ request: req } as any, makeCredSvc()).getEvents(device);
      expect(result).toEqual(logs);
    });

    it('returns empty array on error (graceful)', async () => {
      const req = jest.fn().mockReturnValue(of(axiosResp({ message: 'error' }, 500)));
      const result = await new UniviewLiteapiHttpClient({ request: req } as any, makeCredSvc()).getEvents(device);
      expect(result).toEqual([]);
    });

    it('includes Count parameter in request', async () => {
      const req = jest.fn().mockReturnValue(of(axiosResp({ Data: { DoorLogs: [] } })));
      await new UniviewLiteapiHttpClient({ request: req } as any, makeCredSvc()).getEvents(device, undefined, undefined, 25);
      expect(req).toHaveBeenCalledWith(
        expect.objectContaining({ url: expect.stringContaining('Count=25') }),
      );
    });
  });

  // ---- triggerRelay ----

  describe('triggerRelay', () => {
    it('calls PUT /IO/Outputs/{n} with correct payload', async () => {
      const req = jest.fn().mockReturnValue(of(axiosResp({ ResponseCode: 0 })));
      const result = await new UniviewLiteapiHttpClient({ request: req } as any, makeCredSvc()).triggerRelay(device, 2);
      expect(result.success).toBe(true);
      expect(req).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PUT',
          url: expect.stringContaining('/IO/Outputs/2'),
          data: JSON.stringify({ Enabled: 1, Active: 1, Duration: 5 }),
        }),
      );
    });
  });

  // ---- getRecordings ----

  describe('getRecordings', () => {
    it('returns recording list from Data.RecordInfos', async () => {
      const records = [
        { StartTime: '2026-04-15T08:00:00Z', EndTime: '2026-04-15T08:30:00Z', Size: 1024 },
      ];
      const req = jest.fn().mockReturnValue(of(axiosResp({ Data: { RecordInfos: records } })));
      const client = new UniviewLiteapiHttpClient({ request: req } as any, makeCredSvc(null));
      const result = await client.getRecordings(device, 1, '2026-04-15T00:00:00Z', '2026-04-15T23:59:59Z');
      expect(result).toEqual(records);
    });

    it('returns empty array on error', async () => {
      const req = jest.fn().mockReturnValue(of(axiosResp({ message: 'Not Found' }, 404)));
      const client = new UniviewLiteapiHttpClient({ request: req } as any, makeCredSvc(null));
      const result = await client.getRecordings(device, 1);
      expect(result).toEqual([]);
    });
  });

  // ---- getPlaybackUrl ----

  describe('getPlaybackUrl', () => {
    it('constructs RTSP playback URL with time range', async () => {
      const d = makeDevice({ host: '192.168.1.100', rtspPort: 554 });
      const client = new UniviewLiteapiHttpClient({} as any, makeCredSvc({ username: 'admin', password: 'pass' }));
      const result = await client.getPlaybackUrl(d, 1, '2026-04-15T08:00:00Z', '2026-04-15T08:30:00Z');
      expect(result).toMatch(/^rtsp:\/\//);
      expect(result).toContain('192.168.1.100');
      expect(result).toContain('starttime=');
    });

    it('uses device credentials in URL', async () => {
      const d = makeDevice({ host: '10.0.0.1', rtspPort: 554, username: 'user', password: 'pwd' });
      const client = new UniviewLiteapiHttpClient({} as any, makeCredSvc(null));
      const result = await client.getPlaybackUrl(d, 2, '2026-04-15T10:00:00Z', '2026-04-15T10:30:00Z');
      expect(result).toContain('user:pwd@');
      expect(result).toContain('/media/video2');
    });
  });

  // ---- getRecordingTimeline ----

  describe('getRecordingTimeline', () => {
    it('returns timeline segments from Data.Segments', async () => {
      const segments = [
        { StartTime: '2026-04-15T08:00:00Z', EndTime: '2026-04-15T08:30:00Z', Type: 'Normal' },
      ];
      const req = jest.fn().mockReturnValue(of(axiosResp({ Data: { Segments: segments } })));
      const client = new UniviewLiteapiHttpClient({ request: req } as any, makeCredSvc(null));
      const result = await client.getRecordingTimeline(device, 1, '2026-04-15');
      expect(result).toEqual(segments);
    });

    it('returns empty array when no data', async () => {
      const req = jest.fn().mockReturnValue(of(axiosResp({ Data: {} })));
      const client = new UniviewLiteapiHttpClient({ request: req } as any, makeCredSvc(null));
      const result = await client.getRecordingTimeline(device, 1, '2026-04-15');
      expect(result).toEqual([]);
    });
  });

  // ---- getPtzCapabilities ----

  describe('getPtzCapabilities', () => {
    it('returns capabilities from Data', async () => {
      const caps = { Supported: true, PanSupported: true, TiltSupported: true, ZoomSupported: true };
      const req = jest.fn().mockReturnValue(of(axiosResp({ Data: caps })));
      const client = new UniviewLiteapiHttpClient({ request: req } as any, makeCredSvc(null));
      const result = await client.getPtzCapabilities(device, 1);
      expect(result).toEqual(caps);
    });

    it('returns { Supported: false } on error', async () => {
      const req = jest.fn().mockReturnValue(of(axiosResp({ message: 'Not Found' }, 404)));
      const client = new UniviewLiteapiHttpClient({ request: req } as any, makeCredSvc(null));
      const result = await client.getPtzCapabilities(device, 1);
      expect(result).toEqual({ Supported: false });
    });
  });

  // ---- ptzMove ----

  describe('ptzMove', () => {
    it('sends PUT with direction and speed', async () => {
      const req = jest.fn().mockReturnValue(of(axiosResp({ ResponseCode: 0 })));
      const client = new UniviewLiteapiHttpClient({ request: req } as any, makeCredSvc(null));
      await client.ptzMove(device, 1, 'left', 50);
      expect(req).toHaveBeenCalled();
      const callConfig = req.mock.calls[0][0];
      expect(callConfig.method).toBe('PUT');
      expect(callConfig.url).toContain('/Channels/1/PTZ/ContinuousMove');
    });
  });

  // ---- ptzStop ----

  describe('ptzStop', () => {
    it('sends PUT with zero speed', async () => {
      const req = jest.fn().mockReturnValue(of(axiosResp({ ResponseCode: 0 })));
      const client = new UniviewLiteapiHttpClient({ request: req } as any, makeCredSvc(null));
      await client.ptzStop(device, 1);
      expect(req).toHaveBeenCalled();
      const callConfig = req.mock.calls[0][0];
      expect(callConfig.method).toBe('PUT');
      expect(callConfig.url).toContain('/Channels/1/PTZ/ContinuousMove');
      expect(callConfig.data).toBe(JSON.stringify({ Pan: 0, Tilt: 0, Zoom: 0 }));
    });
  });

  // ---- getPtzPresets ----

  describe('getPtzPresets', () => {
    it('returns presets list', async () => {
      const presets = [{ ID: 1, Name: 'Home' }, { ID: 2, Name: 'Gate' }];
      const req = jest.fn().mockReturnValue(of(axiosResp({ Data: { Presets: presets } })));
      const client = new UniviewLiteapiHttpClient({ request: req } as any, makeCredSvc(null));
      const result = await client.getPtzPresets(device, 1);
      expect(result).toEqual(presets);
    });
  });

  // ---- gotoPreset ----

  describe('gotoPreset', () => {
    it('sends PUT to preset goto endpoint', async () => {
      const req = jest.fn().mockReturnValue(of(axiosResp({ ResponseCode: 0 })));
      const client = new UniviewLiteapiHttpClient({ request: req } as any, makeCredSvc(null));
      await client.gotoPreset(device, 1, 2);
      expect(req).toHaveBeenCalled();
      const callConfig = req.mock.calls[0][0];
      expect(callConfig.method).toBe('PUT');
      expect(callConfig.url).toContain('/Channels/1/PTZ/Presets/2/Goto');
    });
  });
});
