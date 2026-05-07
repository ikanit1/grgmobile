import { ForbiddenException } from '@nestjs/common';
import { ControlService } from './control.service';
import { UserRole } from '../users/entities/user.entity';
import { DeviceType, DeviceRole } from '../devices/entities/device.entity';

function makeUser(role: UserRole) {
  return { id: 1, role, buildingId: 1, organizationId: 'org1', complexId: 'cx1' } as any;
}

function makeServiceFixture(deviceOverrides: Record<string, unknown> = {}) {
  const device = {
    id: 5, buildingId: 1, name: 'Front Door',
    type: DeviceType.UNIVIEW_IPC, role: DeviceRole.DOORPHONE,
    ...deviceOverrides,
  } as any;
  const devicesService = { findById: jest.fn().mockResolvedValue(device) } as any;
  const accessService = { assertCanAccessDevice: jest.fn().mockResolvedValue(undefined) } as any;
  const univiewClient = { applyDefaultOsd: jest.fn().mockResolvedValue(undefined) } as any;
  const service = new ControlService(
    devicesService, univiewClient,
    {} as any, accessService,
    {} as any, {} as any, {} as any, {} as any,
  );
  return { service, devicesService, accessService, univiewClient, device };
}

describe('ControlService.applyOsd', () => {
  it('calls applyDefaultOsd with device name when dto.channelName omitted', async () => {
    const { service, univiewClient, device } = makeServiceFixture();
    await service.applyOsd(5, {}, makeUser(UserRole.ORG_ADMIN));
    expect(univiewClient.applyDefaultOsd).toHaveBeenCalledWith(device, 'Front Door');
  });

  it('calls applyDefaultOsd with dto.channelName when provided', async () => {
    const { service, univiewClient, device } = makeServiceFixture();
    await service.applyOsd(5, { channelName: 'Подъезд 1' }, makeUser(UserRole.ORG_ADMIN));
    expect(univiewClient.applyDefaultOsd).toHaveBeenCalledWith(device, 'Подъезд 1');
  });

  it('throws ForbiddenException for RESIDENT role', async () => {
    const { service } = makeServiceFixture();
    await expect(service.applyOsd(5, {}, makeUser(UserRole.RESIDENT)))
      .rejects.toThrow(ForbiddenException);
  });

  it('calls assertCanAccessDevice with device buildingId', async () => {
    const { service, accessService } = makeServiceFixture();
    await service.applyOsd(5, {}, makeUser(UserRole.ORG_ADMIN));
    expect(accessService.assertCanAccessDevice).toHaveBeenCalledWith(
      expect.objectContaining({ role: UserRole.ORG_ADMIN }),
      1,
    );
  });
});
