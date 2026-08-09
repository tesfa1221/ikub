import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../database/connection';
import { createError } from '../middleware/errorHandler';

export class DrawService {
  async conductDraw(ikubId: string, adminId: string, notes?: string) {
    const ikub = await queryOne(
      "SELECT * FROM ikubs WHERE id = ? AND status = 'active'",
      [ikubId]
    );
    if (!ikub) throw createError('Ikub not found or not active', 404);

    // Get eligible members (active, paid this round, not yet received payout)
    const eligibleMembers = await query(
      `SELECT m.id, u.name FROM members m
       JOIN users u ON u.id = m.user_id
       WHERE m.ikub_id = ? AND m.is_active = TRUE AND m.has_received = FALSE
       AND EXISTS (
         SELECT 1 FROM payments p 
         WHERE p.member_id = m.id AND p.round_number = ? AND p.status = 'approved'
       )`,
      [ikubId, ikub.current_round + 1]
    );

    if (eligibleMembers.length === 0) {
      throw createError('No eligible members for the draw. Ensure all members have paid.', 400);
    }

    // Random selection
    const winnerIndex = Math.floor(Math.random() * eligibleMembers.length);
    const winner = eligibleMembers[winnerIndex];

    // Calculate prize amount (contribution × number of members)
    const memberCount = await queryOne(
      'SELECT COUNT(*) as count FROM members WHERE ikub_id = ? AND is_active = TRUE',
      [ikubId]
    );
    const prizeAmount = ikub.contribution_amount * memberCount.count;

    const drawId = uuidv4();
    const newRound = ikub.current_round + 1;

    await execute(
      `INSERT INTO draws (id, ikub_id, round_number, winner_member_id, amount, conducted_by, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [drawId, ikubId, newRound, winner.id, prizeAmount, adminId, notes]
    );

    // Mark winner as received
    await execute('UPDATE members SET has_received = TRUE WHERE id = ?', [winner.id]);

    // Update ikub round
    await execute('UPDATE ikubs SET current_round = ? WHERE id = ?', [newRound, ikubId]);

    // If all rounds complete, mark as completed
    if (newRound >= ikub.total_rounds) {
      await execute("UPDATE ikubs SET status = 'completed' WHERE id = ?", [ikubId]);
    }

    return this.getDrawById(drawId);
  }

  async getDrawById(id: string) {
    return queryOne(
      `SELECT d.*, i.name as ikub_name, u.name as winner_name, u.telegram_id as winner_telegram_id,
        a.name as conducted_by_name
       FROM draws d
       JOIN ikubs i ON i.id = d.ikub_id
       JOIN members m ON m.id = d.winner_member_id
       JOIN users u ON u.id = m.user_id
       LEFT JOIN admins a ON a.id = d.conducted_by
       WHERE d.id = ?`,
      [id]
    );
  }

  async getDrawsByIkub(ikubId: string) {
    return query(
      `SELECT d.*, u.name as winner_name, u.telegram_id as winner_telegram_id
       FROM draws d
       JOIN members m ON m.id = d.winner_member_id
       JOIN users u ON u.id = m.user_id
       WHERE d.ikub_id = ?
       ORDER BY d.round_number DESC`,
      [ikubId]
    );
  }

  async getAllDraws(page = 1, limit = 20) {
    const offset = (page - 1) * limit;

    const draws = await query(
      `SELECT d.*, i.name as ikub_name, u.name as winner_name
       FROM draws d
       JOIN ikubs i ON i.id = d.ikub_id
       JOIN members m ON m.id = d.winner_member_id
       JOIN users u ON u.id = m.user_id
       ORDER BY d.draw_date DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    const [{ total }] = await query('SELECT COUNT(*) as total FROM draws');
    return { draws, total };
  }

  async getUpcomingDraw(ikubId: string) {
    const ikub = await queryOne(
      "SELECT * FROM ikubs WHERE id = ? AND status = 'active'",
      [ikubId]
    );
    if (!ikub) return null;

    const nextRound = ikub.current_round + 1;

    const paidMembers = await query(
      `SELECT COUNT(*) as count FROM payments p
       JOIN members m ON m.id = p.member_id
       WHERE p.ikub_id = ? AND p.round_number = ? AND p.status = 'approved'`,
      [ikubId, nextRound]
    );

    const totalMembers = await queryOne(
      'SELECT COUNT(*) as count FROM members WHERE ikub_id = ? AND is_active = TRUE',
      [ikubId]
    );

    return {
      ikub_id: ikubId,
      next_round: nextRound,
      paid_members: paidMembers[0]?.count || 0,
      total_members: totalMembers?.count || 0,
      ready: paidMembers[0]?.count === totalMembers?.count,
    };
  }
}

export const drawService = new DrawService();
