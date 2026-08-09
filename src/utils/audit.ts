import { v4 as uuidv4 } from 'uuid';
import { execute } from '../database/connection';
import { logger } from './logger';

export async function auditLog(
  actorId: string,
  actorType: 'admin' | 'user' | 'system',
  action: string,
  entityType: string,
  entityId: string,
  details: object = {},
  ipAddress?: string
): Promise<void> {
  try {
    await execute(
      `INSERT INTO audit_logs (id, actor_id, actor_type, action, entity_type, entity_id, details, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuidv4(), actorId, actorType, action, entityType, entityId, JSON.stringify(details), ipAddress || null]
    );
  } catch (error) {
    logger.error('Failed to write audit log:', error);
  }
}
