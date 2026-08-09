import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';

export function setupSocketIO(io: Server): void {
  // Auth middleware for socket
  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      // Try user token first
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      socket.data.user = decoded;
      socket.data.type = 'user';
      return next();
    } catch {
      try {
        // Try admin token
        const decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET!) as any;
        socket.data.user = decoded;
        socket.data.type = 'admin';
        return next();
      } catch {
        return next(new Error('Invalid token'));
      }
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user;
    const userType = socket.data.type;

    logger.info(`Socket connected: ${user?.name} (${userType})`);

    // Join personal room
    if (userType === 'user' && user.telegramId) {
      socket.join(`user:${user.telegramId}`);
    }

    // Admin joins admin room
    if (userType === 'admin') {
      socket.join('admin');
      logger.info(`Admin ${user.name} joined admin room`);
    }

    // Join ikub rooms
    socket.on('join:ikub', (ikubId: string) => {
      socket.join(`ikub:${ikubId}`);
      logger.debug(`${user.name} joined ikub:${ikubId}`);
    });

    socket.on('leave:ikub', (ikubId: string) => {
      socket.leave(`ikub:${ikubId}`);
    });

    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: ${user?.name}`);
    });

    // Ping/pong for connection health
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: new Date().toISOString() });
    });
  });
}
