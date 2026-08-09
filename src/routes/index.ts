import { Express } from 'express';
import authRoutes from './auth';
import ikubRoutes from './ikub';
import paymentRoutes from './payment';
import drawRoutes from './draw';
import androidRoutes from './android';
import reportRoutes from './report';
import reminderRoutes from './reminder';
import marketplaceRoutes from './marketplace';

export function setupRoutes(app: Express): void {
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'SmartIkub API', version: '1.0.0', timestamp: new Date().toISOString() });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/ikubs', ikubRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/draws', drawRoutes);
  app.use('/api/android', androidRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/reminders', reminderRoutes);
  app.use('/api/marketplace', marketplaceRoutes);

  app.use((_req, res) => {
    res.status(404).json({ success: false, message: 'Route not found' });
  });
}
