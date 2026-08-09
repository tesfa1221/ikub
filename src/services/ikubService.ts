import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../database/connection';
import { createError } from '../middleware/errorHandler';

export class IkubService {
  async createIkub(data: {
    name: string;
    description?: string;
    contribution_amount: number;
    schedule: string;
    max_members: number;
    total_rounds: number;
    start_date?: string;
    createdBy: string;
  }) {
    const id = uuidv4();
    const invitationCode = 'IKUB' + Math.random().toString(36).substring(2, 8).toUpperCase();

    await execute(
      `INSERT INTO ikubs (id, name, description, contribution_amount, schedule, max_members, total_rounds, status, invitation_code, start_date, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      [
        id, data.name, data.description, data.contribution_amount,
        data.schedule, data.max_members, data.total_rounds,
        invitationCode, data.start_date || null, data.createdBy
      ]
    );

    return this.getIkubById(id);
  }

  async getIkubById(id: string) {
    const ikub = await queryOne(
      `SELECT i.*, 
        (SELECT COUNT(*) FROM members m WHERE m.ikub_id = i.id AND m.is_active = TRUE) as member_count,
        (SELECT COUNT(*) FROM payments p WHERE p.ikub_id = i.id AND p.status = 'approved') as approved_payments
       FROM ikubs i WHERE i.id = ?`,
      [id]
    );

    if (!ikub) throw createError('Ikub not found', 404);
    return ikub;
  }

  async getAllIkubs(page = 1, limit = 20, status?: string) {
    const offset = (page - 1) * limit;
    const whereClause = status ? 'WHERE i.status = ?' : '';
    const params = status ? [status, limit, offset] : [limit, offset];

    const ikubs = await query(
      `SELECT i.*, 
        (SELECT COUNT(*) FROM members m WHERE m.ikub_id = i.id AND m.is_active = TRUE) as member_count
       FROM ikubs i ${whereClause}
       ORDER BY i.created_at DESC
       LIMIT ? OFFSET ?`,
      params
    );

    const [{ total }] = await query(
      `SELECT COUNT(*) as total FROM ikubs ${whereClause}`,
      status ? [status] : []
    );

    return { ikubs, total };
  }

  async updateIkub(id: string, data: Partial<{
    name: string;
    description: string;
    contribution_amount: number;
    schedule: string;
    max_members: number;
    status: string;
    start_date: string;
  }>) {
    const fields: string[] = [];
    const values: any[] = [];

    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    });

    if (fields.length === 0) throw createError('No fields to update', 400);

    values.push(id);
    await execute(`UPDATE ikubs SET ${fields.join(', ')} WHERE id = ?`, values);
    return this.getIkubById(id);
  }

  async joinIkub(userId: string, invitationCode: string) {
    const ikub = await queryOne(
      "SELECT * FROM ikubs WHERE invitation_code = ? AND status IN ('pending','active')",
      [invitationCode]
    );

    if (!ikub) throw createError('Invalid invitation code or Ikub is not accepting members', 404);

    // Check if already a member
    const existing = await queryOne(
      'SELECT * FROM members WHERE user_id = ? AND ikub_id = ?',
      [userId, ikub.id]
    );
    if (existing) throw createError('You are already a member of this Ikub', 409);

    // Check capacity
    const memberCount = await queryOne(
      'SELECT COUNT(*) as count FROM members WHERE ikub_id = ? AND is_active = TRUE',
      [ikub.id]
    );
    if (memberCount.count >= ikub.max_members) {
      throw createError('This Ikub is full', 400);
    }

    const memberId = uuidv4();
    await execute(
      'INSERT INTO members (id, user_id, ikub_id, order_number) VALUES (?, ?, ?, ?)',
      [memberId, userId, ikub.id, memberCount.count + 1]
    );

    return this.getMemberIkubs(userId);
  }

  async getMemberIkubs(userId: string) {
    return query(
      `SELECT i.*, m.id as member_id, m.join_date, m.order_number, m.has_received,
        (SELECT COUNT(*) FROM members mem WHERE mem.ikub_id = i.id AND mem.is_active = TRUE) as member_count
       FROM ikubs i
       JOIN members m ON m.ikub_id = i.id
       WHERE m.user_id = ? AND m.is_active = TRUE
       ORDER BY m.join_date DESC`,
      [userId]
    );
  }

  async getIkubMembers(ikubId: string) {
    return query(
      `SELECT u.id, u.name, u.phone, u.telegram_id, m.id as member_id, 
        m.join_date, m.order_number, m.has_received, m.is_active,
        (SELECT COUNT(*) FROM payments p WHERE p.member_id = m.id AND p.status = 'approved') as paid_rounds
       FROM users u
       JOIN members m ON m.user_id = u.id
       WHERE m.ikub_id = ? AND m.is_active = TRUE
       ORDER BY m.order_number ASC`,
      [ikubId]
    );
  }

  async generateNewInvitationCode(ikubId: string): Promise<string> {
    const code = 'IKUB' + Math.random().toString(36).substring(2, 8).toUpperCase();
    await execute('UPDATE ikubs SET invitation_code = ? WHERE id = ?', [code, ikubId]);
    return code;
  }

  async getDashboardStats() {
    const [stats] = await query(`
      SELECT
        (SELECT COUNT(*) FROM ikubs) as total_ikubs,
        (SELECT COUNT(*) FROM ikubs WHERE status = 'active') as active_ikubs,
        (SELECT COUNT(*) FROM users WHERE role = 'member') as total_members,
        (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'approved') as total_collected,
        (SELECT COUNT(*) FROM payments WHERE status = 'pending') as pending_payments,
        (SELECT COUNT(*) FROM draws WHERE DATE(draw_date) >= CURDATE()) as upcoming_draws
    `);
    return stats;
  }

  async getMonthlyContributions() {
    return query(`
      SELECT 
        DATE_FORMAT(submitted_at, '%Y-%m') as month,
        SUM(amount) as total,
        COUNT(*) as count
      FROM payments
      WHERE status = 'approved' AND submitted_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
      GROUP BY DATE_FORMAT(submitted_at, '%Y-%m')
      ORDER BY month ASC
    `);
  }

  /**
   * Returns all members of an Ikub and their payment status for a given round.
   * Used for member-to-member transparency — shows ✅/❌ per member, no amounts.
   */
  async getRoundPaymentStatus(ikubId: string, roundNumber?: number) {
    // Default to the next/current round
    const ikub = await this.getIkubById(ikubId);
    const round = roundNumber ?? (ikub.current_round + 1);

    return query(
      `SELECT
         u.name,
         u.id as user_id,
         m.id as member_id,
         m.order_number,
         m.has_received,
         CASE
           WHEN p.id IS NOT NULL AND p.status = 'approved' THEN 'paid'
           WHEN p.id IS NOT NULL AND p.status = 'pending'  THEN 'pending'
           ELSE 'unpaid'
         END AS payment_status
       FROM members m
       JOIN users u ON u.id = m.user_id
       LEFT JOIN payments p
         ON p.member_id = m.id
        AND p.ikub_id   = ?
        AND p.round_number = ?
        AND p.status != 'rejected'
       WHERE m.ikub_id = ? AND m.is_active = TRUE
       ORDER BY m.order_number ASC`,
      [ikubId, round, ikubId]
    );
  }
}

export const ikubService = new IkubService();
