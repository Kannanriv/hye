import { Logger, OnModuleDestroy, UsePipes, ValidationPipe } from '@nestjs/common';
import {
  ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayInit, SubscribeMessage, WebSocketGateway, WebSocketServer, WsException,
} from '@nestjs/websockets';
import type { Subscription } from 'rxjs';
import type { Namespace, Socket } from 'socket.io';
import { SessionsService } from '../identity/sessions.service.js';
import { MessageStatusEventDto, TypingEventDto } from './dto/message.dto.js';
import { MessagingService } from './messaging.service.js';

const userRoom = (userId: string) => `user:${userId}`;

/**
 * Realtime channel (socket.io, namespace /ws).
 *
 * Connect with `io(url + '/ws', { auth: { token: '<session token>' } })`
 * (or `auth: { devUserId }` when AUTH_DEV_HEADER is on).
 *
 * Server → client: `message.new` (MessageView), `message.status`, `typing`.
 * Client → server: `typing` {conversationId, isTyping}, `message.status` {messageId, status}.
 *
 * Every socket joins `user:<id>`; events are addressed to user rooms, so with the socket.io
 * Redis adapter (see README) they reach the user's sockets on any instance.
 */
@WebSocketGateway({ namespace: '/ws' })
@UsePipes(new ValidationPipe({ whitelist: true, exceptionFactory: errors => new WsException(errors.map(e => e.toString()).join('; ')) }))
export class MessagingGateway implements OnGatewayInit, OnGatewayConnection, OnModuleDestroy {
  private readonly logger = new Logger('MessagingGateway');
  private subscription?: Subscription;

  @WebSocketServer()
  server!: Namespace;

  constructor(
    private readonly messaging: MessagingService,
    private readonly sessions: SessionsService,
  ) {}

  afterInit() {
    this.subscription = this.messaging.events.subscribe(event => {
      const rooms = event.recipients.map(userRoom);
      if (!rooms.length) return;
      if (event.type === 'message.new') this.server.to(rooms).emit('message.new', event.message);
      else this.server.to(rooms).emit(event.type, event.payload);
    });
  }

  onModuleDestroy() {
    this.subscription?.unsubscribe();
  }

  async handleConnection(client: Socket) {
    const auth = (client.handshake.auth ?? {}) as { token?: unknown; devUserId?: unknown };
    const principal =
      typeof auth.token === 'string'
        ? await this.sessions.authenticate(auth.token)
        : typeof auth.devUserId === 'string'
          ? await this.sessions.authenticateDevUser(auth.devUserId)
          : null;
    if (!principal) {
      client.emit('error', { message: 'Authentication required' });
      client.disconnect(true);
      return;
    }
    client.data.userId = principal.userId;
    await client.join(userRoom(principal.userId));
  }

  @SubscribeMessage('typing')
  async onTyping(@ConnectedSocket() client: Socket, @MessageBody() body: TypingEventDto) {
    await this.wrap(() => this.messaging.typing(client.data.userId as string, body.conversationId, body.isTyping));
  }

  @SubscribeMessage('message.status')
  async onStatus(@ConnectedSocket() client: Socket, @MessageBody() body: MessageStatusEventDto) {
    await this.wrap(() => this.messaging.acknowledge(client.data.userId as string, body.messageId, body.status));
  }

  private async wrap(fn: () => Promise<void>) {
    try {
      await fn();
    } catch (err) {
      throw new WsException(err instanceof Error ? err.message : 'Request failed');
    }
  }
}
