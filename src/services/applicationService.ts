import { v4 as uuidv4 } from 'uuid';
import { query, rawQuery, queryOne, execute } from '../database/connection';
import { createError } from '../middleware/errorHandler';

export class ApplicationService {

  /**
   * Public marketplace — list all open ikubs with safe public fields only.
   * Never exposes member names, transaction data, or invitation codes.
   */
  async getPublicIkubs(page = 1, limit = 20, filters?: {
    schedule?: string;
    minAmount?: number;
    maxAmount?: number;
    search?: string;
  }) {
    const offset = (page - 1) * limit;
    const conditions: string[] = ["i.status IN ('pending','active')"];
    const params: any[] = [];

    if (filters?.schedule)  { conditions.push('i.schedule = ?');               params.push(filters.schedule); }
    if (filters?.minAmount) { conditions.push('i.contribution_amount >= ?');    params.push(filters.minAmount); }
    if (filters?.maxAmount) { conditions.push('i.contribution_amount <= ?');    params.push(filters.maxAmount); }
    if (filters?.search) {
      conditions.push('(i.name LIKE ? OR i.description LIKE ?)');
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // Use rawQuery (non-prepared) for dynamic WHERE — avoids MariaDB prepared stmt issues
    const ikubs = await rawQuery(
      `SELECT i.id, i.name, i.description, i.contribution_amount,
         i.schedule, i.max_members, i.total_rounds, i.current_round,
         i.status, i.start_date, i.created_at
       FROM ikubs i
       ${whereClause}
       ORDER BY i.created_at DESC
       LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
      params
    );

    const countRows = await rawQuery(
      `SELECT COUNT(*) as total FROM ikubs i ${whereClause}`,
      params
    );
    const total = countRows[0]?.total || 0;

    // Enrich each ikub with member count separately (avoid complex joins)
    const enriched = await Promise.all(ikubs.map(async (ikub: any) => {
      const [mc] = await query(
        'SELECT COUNT(*) as cnt FROM members WHERE ikub_id = ? AND is_active = TRUE',
        [ikub.id]
      );
      const memberCount = parseInt(mc.cnt) || 0;
      return {
        ...ikub,
        member_count: memberCount,
        spots_left: Math.max(0, ikub.max_members - memberCount),
      };
    }));

    return { ikubs: enriched, total };
  }

  /**
   * Calculate trust score for a user based on payment history.
   * Score 0–100:
   *   - On-time payments: +10 per approved payment
   *   - Completed ikubs: +15 bonus
   *   - Rejected payments: -5 each
   *   - No history: 50 (neutral)
   */
  async calculateTrustScore(userId: string): Promise<{
    score: number;
    label: string;
    color: string;
    total_payments: number;
    approved_payments: number;
    rejected_payments: number;
    completed_ikubs: number;
  }> {
    const [stats] = await query(
      `SELECT
         COUNT(p.id) as total_payments,
         SUM(CASE WHEN p.status = 'approved' THEN 1 ELSE 0 END) as approved_payments,
         SUM(CASE WHEN p.status = 'rejected' THEN 1 ELSE 0 END) as rejected_payments,
         (SELECT COUNT(*) FROM members mem
          JOIN ikubs i ON i.id = mem.ikub_id
          WHERE mem.user_id = ? AND i.status = 'completed') as completed_ikubs
       FROM members m
       JOIN payments p ON p.member_id = m.id
       WHERE m.user_id = ?`,
      [userId, userId]
    );

    const approved = parseInt(stats.approved_payments) || 0;
    const rejected = parseInt(stats.rejected_payments) || 0;
    const completed = parseInt(stats.completed_ikubs) || 0;
    const total = parseInt(stats.total_payments) || 0;

    if (total === 0) {
      return { score: 50, label: 'New Member', color: 'gray', total_payments: 0, approved_payments: 0, rejected_payments: 0, completed_ikubs: 0 };
    }

    let score = 50; // baseline
    score += Math.min(approved * 3, 35);  // max +35 from payments
    score += completed * 10;               // +10 per completed ikub
    score -= rejected * 8;                 // -8 per rejection
    score = Math.max(0, Math.min(100, score));

    let label: string;
    let color: string;
    if (score >= 85)      { label = 'Excellent'; color = 'green'; }
    else if (score >= 70) { label = 'Good';      color = 'blue'; }
    else if (score >= 55) { label = 'Fair';      color = 'yellow'; }
    else if (score >= 35) { label = 'Poor';      color = 'orange'; }
    else                  { label = 'Risk';      color = 'red'; }

    return { score, label, color, total_payments: total, approved_payments: approved, rejected_payments: rejected, completed_ikubs: completed };
  }

  /**
   * Member applies to join a public ikub.
   */
  async applyToJoin(userId: string, ikubId: string, message?: string) {
    // Check ikub is open
    const ikub = await queryOne(
      "SELECT * FROM ikubs WHERE id = ? AND status IN ('pending','active')",
      [ikubId]
    );
    if (!ikub) throw createError('Ikub not found or not accepting applications', 404);

    // Check spots
    const memberCount = await queryOne(
      'SELECT COUNT(*) as count FROM members WHERE ikub_id = ? AND is_active = TRUE',
      [ikubId]
    );
    if (memberCount.count >= ikub.max_members) {
      throw createError('This Ikub is full', 400);
    }

    // Already a member?
    const isMember = await queryOne(
      'SELECT id FROM members WHERE user_id = ? AND ikub_id = ?',
      [userId, ikubId]
    );
    if (isMember) throw createError('You are already a member of this Ikub', 409);

    // Already applied?
    const existing = await queryOne(
      "SELECT * FROM applications WHERE user_id = ? AND ikub_id = ?",
      [userId, ikubId]
    );
    if (existing) {
      if (existing.status === 'pending') throw createError('You have already applied to this Ikub', 409);
      if (existing.status === 'approved') throw createError('Your application was already approved', 409);
      // Rejected — allow re-apply by updating
      await execute(
        "UPDATE applications SET status = 'pending', message = ?, reviewed_by = NULL, reviewed_at = NULL, rejection_reason = NULL WHERE id = ?",
        [message || null, existing.id]
      );
      return queryOne('SELECT * FROM applications WHERE id = ?', [existing.id]);
    }

    const id = uuidv4();
    await execute(
      'INSERT INTO applications (id, user_id, ikub_id, message) VALUES (?, ?, ?, ?)',
      [id, userId, ikubId, message || null]
    );

    return queryOne('SELECT * FROM applications WHERE id = ?', [id]);
  }

  /**
   * Admin approves application — automatically adds user as member.
   */
  async approveApplication(applicationId: string, adminId: string) {
    const app = await queryOne(
      "SELECT a.*, u.name as user_name FROM applications a JOIN users u ON u.id = a.user_id WHERE a.id = ? AND a.status = 'pending'",
      [applicationId]
    );
    if (!app) throw createError('Application not found or already processed', 404);

    // Double-check spots
    const memberCount = await queryOne(
      'SELECT COUNT(*) as count FROM members WHERE ikub_id = ? AND is_active = TRUE',
      [app.ikub_id]
    );
    const ikub = await queryOne('SELECT * FROM ikubs WHERE id = ?', [app.ikub_id]);
    if (memberCount.count >= ikub.max_members) {
      throw createError('Ikub is now full', 400);
    }

    // Approve application
    await execute(
      "UPDATE applications SET status = 'approved', reviewed_by = ?, reviewed_at = NOW() WHERE id = ?",
      [adminId, applicationId]
    );

    // Add as member
    const memberId = uuidv4();
    await execute(
      'INSERT INTO members (id, user_id, ikub_id, order_number) VALUES (?, ?, ?, ?)',
      [memberId, app.user_id, app.ikub_id, memberCount.count + 1]
    );

    return this.getApplicationById(applicationId);
  }

  /**
   * Admin rejects application.
   */
  async rejectApplication(applicationId: string, adminId: string, reason: string) {
    const app = await queryOne(
      "SELECT * FROM applications WHERE id = ? AND status = 'pending'",
      [applicationId]
    );
    if (!app) throw createError('Application not found or already processed', 404);

    await execute(
      "UPDATE applications SET status = 'rejected', reviewed_by = ?, reviewed_at = NOW(), rejection_reason = ? WHERE id = ?",
      [adminId, reason, applicationId]
    );

    return this.getApplicationById(applicationId);
  }

  async getApplicationById(id: string) {
    return queryOne(
      `SELECT a.*, u.name as user_name, u.telegram_id, u.phone,
         i.name as ikub_name, i.contribution_amount
       FROM applications a
       JOIN users u ON u.id = a.user_id
       JOIN ikubs i ON i.id = a.ikub_id
       WHERE a.id = ?`,
      [id]
    );
  }

  /**
   * Admin: get all pending/all applications for an ikub with trust scores.
   */
  async getApplicationsForIkub(ikubId: string, status?: string) {
    const whereStatus = status ? `AND a.status = '${status}'` : '';

    return rawQuery(
      `SELECT a.*, u.name as user_name, u.telegram_id, u.phone, u.created_at as user_since,
         (SELECT COUNT(*) FROM payments p JOIN members m ON m.id = p.member_id WHERE m.user_id = a.user_id AND p.status = 'approved') as approved_payments,
         (SELECT COUNT(*) FROM payments p JOIN members m ON m.id = p.member_id WHERE m.user_id = a.user_id AND p.status = 'rejected') as rejected_payments,
         (SELECT COUNT(*) FROM members mem JOIN ikubs ik ON ik.id = mem.ikub_id WHERE mem.user_id = a.user_id AND ik.status = 'completed') as completed_ikubs
       FROM applications a
       JOIN users u ON u.id = a.user_id
       WHERE a.ikub_id = ? ${whereStatus}
       ORDER BY a.created_at DESC`,
      [ikubId]
    );
  }

  /**
   * Member: get their own applications.
   */
  async getUserApplications(userId: string) {
    return query(
      `SELECT a.*, i.name as ikub_name, i.contribution_amount, i.schedule, i.status as ikub_status
       FROM applications a
       JOIN ikubs i ON i.id = a.ikub_id
       WHERE a.user_id = ?
       ORDER BY a.created_at DESC`,
      [userId]
    );
  }

  /**
   * Admin: get all pending applications across all ikubs.
   */
  async getAllPendingApplications() {
    return query(
      `SELECT a.*, u.name as user_name, u.telegram_id, i.name as ikub_name, i.contribution_amount,
         (SELECT COUNT(*) FROM payments p JOIN members m ON m.id = p.member_id WHERE m.user_id = a.user_id AND p.status = 'approved') as approved_payments
       FROM applications a
       JOIN users u ON u.id = a.user_id
       JOIN ikubs i ON i.id = a.ikub_id
       WHERE a.status = 'pending'
       ORDER BY a.created_at ASC`,
      []
    );
  }
}

export const applicationService = new ApplicationService();
