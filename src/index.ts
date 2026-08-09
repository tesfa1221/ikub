import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { Server } from 'socket.io';

import { logger } from './utils/logger';
import { setupRoutes } from './routes';
import { setupSocketIO } from './socket';
import { testConnection } from './database/connection';
import { errorHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';
import { schedulePaymentReminders } from './services/reminderService';

dotenv.config();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Middleware
app.use(helmet());
app.use(compression());
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(rateLimiter);

// Attach io to request
app.use((req: any, _res, next) => {
  req.io = io;
  next();
});

// Routes
setupRoutes(app);

// Error handler
app.use(errorHandler);

// Socket.IO
setupSocketIO(io);

const PORT = process.env.PORT || 5000;

async function bootstrap() {
  try {
    await testConnection();
    logger.info('✅ Database connected successfully');

    server.listen(PORT, () => {
      logger.info(`🚀 SmartIkub API running on port ${PORT}`);
      logger.info(`🌍 Environment: ${process.env.NODE_ENV}`);
      schedulePaymentReminders();
    });
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

bootstrap();

export { io };
