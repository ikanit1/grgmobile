import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';

@WebSocketGateway({
  path: '/api/ws/events',
  cors: {
    // In production, require explicit WS_ALLOWED_ORIGINS. In dev, default to localhost.
    origin: (() => {
      const isProd = process.env.NODE_ENV === 'production';
      const envOrigins = process.env.WS_ALLOWED_ORIGINS?.split(',').map(s => s.trim()).filter(Boolean);
      if (envOrigins && envOrigins.length > 0) return envOrigins;
      return isProd ? [] : ['http://localhost:8100', 'http://localhost:3000'];
    })(),
    credentials: true,
  },
})
export class EventsGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    const token =
      (client.handshake.query?.token as string) ??
      client.handshake.auth?.token ??
      client.handshake.headers?.authorization?.replace('Bearer ', '');
    if (!token) {
      client.emit('error', { message: 'Требуется токен авторизации' });
      client.disconnect(true);
      return;
    }
    try {
      const secret = process.env.JWT_SECRET || 'dev-secret';
      const payload = jwt.verify(token, secret) as Record<string, unknown>;
      (client as any).user = payload;
    } catch {
      client.emit('error', { message: 'Невалидный или просроченный токен' });
      client.disconnect(true);
    }
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { houseId?: number; deviceId?: number },
  ) {
    const room =
      data.deviceId != null
        ? `device:${data.deviceId}`
        : data.houseId != null
        ? `house:${data.houseId}`
        : 'all';
    client.join(room);
    client.emit('subscribed', { room });
  }

  emitDeviceEvent(deviceId: number, payload: any) {
    this.server.to(`device:${deviceId}`).emit('event', payload);
  }

  emitToHouse(houseId: number, payload: any) {
    this.server.to(`house:${houseId}`).emit('event', payload);
  }

  /** Notify clients when device goes online/offline (TZ: device:status_change). */
  emitDeviceStatusChange(deviceId: number, buildingId: number, status: 'online' | 'offline') {
    const payload = { type: 'device:status_change', deviceId, buildingId, status };
    this.server.to(`device:${deviceId}`).emit('device:status_change', payload);
    this.server.to(`house:${buildingId}`).emit('device:status_change', payload);
  }
}
