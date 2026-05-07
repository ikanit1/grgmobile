import { ForbiddenException } from '@nestjs/common';
import { ControlService } from './control.service';
import { UserRole } from '../users/entities/user.entity';
import { DeviceType, DeviceRole } from '../devices/entities/device.entity';

function makeUser(role: UserRole) {
  return { id: 1, role, buildingId: 1, organizationId: 'org1', complexId: 'cx1' } as any;
}

function makeFixture(deviceOverrides: Record<string, unknown> = {}) {
  const device = {
    id: 5, buildingId: 1, name: 'Front Door',
    type: DeviceType.UNIVIEW_IPC, role: DeviceRole.DOORPHONE,
    defaultChannel: 1,
    ...deviceOverrides,
  } as any;
  const devicesService = { findById: jest.fn().mockResolvedValue(device) } as any;
  const accessService = { assertCanAccessDevice: jest.fn().mockResolvedValue(undefined) } as any;
  const univiewClient = {
    setRelayDuration: jest.fn().mockResolvedValue(undefined),
    setWdr: jest.fn().mockResolvedValue(undefined),
  } as any;
  const service = new ControlService(
    devicesService, univiewClient,
    {} as any, accessService,
    {} as any, {} as any, {} as any, {} as any,
  );
  return { service, univiewClient, accessService, device };
}

// ─── setRelayConfig ───

describe('ControlService.setRelayConfig', () => {
  it('calls setRelayDuration with device, relayId=1 default, durationSec', async () => {
    const { service, univiewClient, device } = makeFixture();
    await service.setRelayConfig(5, { durationSec: 3 }, makeUser(UserRole.ORG_ADMIN));
    expect(univiewClient.setRelayDuration).toHaveBeenCalledWith(device, 1, 3);
  });

  it('calls setRelayDuration with explicit relayId when provided', async () => {
    const { service, univiewClient, device } = makeFixture();
    await service.setRelayConfig(5, { relayId: 2, durationSec: 5 }, makeUser(UserRole.ORG_ADMIN));
    expect(univiewClient.setRelayDuration).toHaveBeenCalledWith(device, 2, 5);
  });

  it('throws ForbiddenException for RESIDENT role', async () => {
    const { service } = makeFixture();
    await expect(service.setRelayConfig(5, { durationSec: 3 }, makeUser(UserRole.RESIDENT)))
      .rejects.toThrow(ForbiddenException);
  });
});

// ─── setImageConfig ───

describe('ControlService.setImageConfig', () => {
  it('calls setWdr with device, defaultChannel, enabled=true, level=5', async () => {
    const { service, univiewClient, device } = makeFixture();
    await (service as any).setImageConfig(5, { wdrEnabled: true }, makeUser(UserRole.ORG_ADMIN));
    expect(univiewClient.setWdr).toHaveBeenCalledWith(device, 1, true, 5);
  });

  it('uses wdrLevel from dto when provided', async () => {
    const { service, univiewClient, device } = makeFixture();
    await (service as any).setImageConfig(5, { wdrEnabled: true, wdrLevel: 7 }, makeUser(UserRole.ORG_ADMIN));
    expect(univiewClient.setWdr).toHaveBeenCalledWith(device, 1, true, 7);
  });

  it('throws ForbiddenException for RESIDENT role', async () => {
    const { service } = makeFixture();
    await expect((service as any).setImageConfig(5, { wdrEnabled: true }, makeUser(UserRole.RESIDENT)))
      .rejects.toThrow(ForbiddenException);
  });
});
