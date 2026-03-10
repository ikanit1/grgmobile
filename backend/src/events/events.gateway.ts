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

@WebSocketGateway({ path: '/api/ws/events', cors: true })
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
}
