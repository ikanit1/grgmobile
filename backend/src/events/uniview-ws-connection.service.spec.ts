import { UniviewLiteapiWsClient } from '../vendors/uniview/uniview-liteapi-ws.client';
import { UniviewWsConnectionService } from './uniview-ws-connection.service';
import { DeviceType, DeviceRole } from '../devices/entities/device.entity';

jest.mock('../vendors/uniview/uniview-liteapi-ws.client', () => {
  const actual = jest.requireActual('../vendors/uniview/uniview-liteapi-ws.client');
  return {
    ...actual,
    UniviewLiteapiWsClient: jest.fn().mockImplementation(() => ({
      onEvent: jest.fn(),
      connect: jest.fn().mockResolvedValue(undefined),
      subscribeEvents: jest.fn().mockResolvedValue({}),
      get isConnected() { return true; },
      disconnect: jest.fn(),
    })),
  };
});

function makeDevice(overrides = {}) {
  return {
    id: 1, host: '10.0.0.1', httpPort: 80,
    type: DeviceType.UNIVIEW_IPC, role: DeviceRole.DOORPHONE,
    buildingId: 1, building: { id: 1 },
    ...overrides,
  } as any;
}

function makeService() {
  const eventsGateway = { emitDeviceEvent: jest.fn(), emitToHouse: jest.fn() } as any;
  const eventLogService = { create: jest.fn().mockResolvedValue(undefined) } as any;
  const pushService = {} as any;
  const accessService = { getUserIdsWithAccessToBuilding: jest.fn().mockResolvedValue([]) } as any;
  return new UniviewWsConnectionService(eventsGateway, eventLogService, pushService, accessService);
}

describe('UniviewWsConnectionService — wsUrl', () => {
  afterEach(() => jest.clearAllMocks());

  it('constructs UniviewLiteapiWsClient with path /LAPI/V1.0/Notify/Event', async () => {
    const service = makeService();
    await service.start(makeDevice());
    expect(UniviewLiteapiWsClient).toHaveBeenCalledWith(
      'ws://10.0.0.1:80/LAPI/V1.0/Notify/Event',
    );
  });

  it('does not start a second connection if already started for device', async () => {
    const service = makeService();
    const device = makeDevice();
    await service.start(device);
    await service.start(device);
    expect(UniviewLiteapiWsClient).toHaveBeenCalledTimes(1);
  });
});
