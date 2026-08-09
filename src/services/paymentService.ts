import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../database/connection';
import { createError } from '../middleware/errorHandler';

export class PaymentService {
  async submitPayment(data: {
    userId: string;
    ikubId: string;
    transactionId: string;
    amount: number;
    paymentMethod: 'telebirr' | 'cbe_birr' | 'other';
    roundNumber: number;
  }) {
    // Check duplicate transaction ID
    const existing = await queryOne(
      'SELECT id FROM payments WHERE transaction_id = ?',
      [data.transactionId]
    );
    if (existing) throw createError('This transaction ID has already been submitted', 409);

    // Get member record
    const member = await queryOne(
      'SELECT * FROM members WHERE user_id = ? AND ikub_id = ? AND is_active = TRUE',
      [data.userId, data.ikubId]
    );
    if (!member) throw createError('You are not a member of this Ikub', 403);

    // Check if already paid this round
    const paidThisRound = await queryOne(
      "SELECT id FROM payments WHERE member_id = ? AND ikub_id = ? AND round_number = ? AND status != 'rejected'",
      [member.id, data.ikubId, data.roundNumber]
    );
    if (paidThisRound) throw createError('You have already submitted a payment for this round', 409);

    const paymentId = uuidv4();
    await execute(
      `INSERT INTO payments (id, member_id, ikub_id, round_number, transaction_id, amount, payment_method, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [paymentId, member.id, data.ikubId, data.roundNumber, data.transactionId, data.amount, data.paymentMethod]
    );

    // Try to auto-match with received transactions
    await this.tryAutoMatch(paymentId, data.transactionId);

    return this.getPaymentById(paymentId);
  }

  async tryAutoMatch(paymentId: string, transactionId: string) {
    const transaction = await queryOne(
      "SELECT * FROM transactions WHERE transaction_reference = ? AND is_matched = FALSE",
      [transactionId]
    );

    if (transaction) {
      await execute(
        'UPDATE transactions SET is_matched = TRUE, matched_payment_id = ? WHERE id = ?',
        [paymentId, transaction.id]
      );
      // Auto-approve if amounts match
      const payment = await this.getPaymentById(paymentId);
      if (payment && Math.abs(payment.amount - transaction.amount) < 0.01) {
        await execute(
          "UPDATE payments SET status = 'approved', verified_at = NOW() WHERE id = ?",
          [paymentId]
        );
      }
    }
  }

  async getPaymentById(id: string) {
    return queryOne(
      `SELECT p.*, u.name as member_name, u.telegram_id,
        i.name as ikub_name, i.contribution_amount
       FROM payments p
       JOIN members m ON m.id = p.member_id
       JOIN users u ON u.id = m.user_id
       JOIN ikubs i ON i.id = p.ikub_id
       WHERE p.id = ?`,
      [id]
    );
  }

  async approvePayment(paymentId: string, adminId: string) {
    const payment = await queryOne(
      "SELECT * FROM payments WHERE id = ? AND status = 'pending'",
      [paymentId]
    );
    if (!payment) throw createError('Payment not found or already processed', 404);

    await execute(
      "UPDATE payments SET status = 'approved', verified_at = NOW(), verified_by = ? WHERE id = ?",
      [adminId, paymentId]
    );

    return this.getPaymentById(paymentId);
  }

  async rejectPayment(paymentId: string, adminId: string, reason: string) {
    const payment = await queryOne(
      "SELECT * FROM payments WHERE id = ? AND status = 'pending'",
      [paymentId]
    );
    if (!payment) throw createError('Payment not found or already processed', 404);

    await execute(
      "UPDATE payments SET status = 'rejected', verified_at = NOW(), verified_by = ?, rejection_reason = ? WHERE id = ?",
      [adminId, reason, paymentId]
    );

    return this.getPaymentById(paymentId);
  }

  async getAllPayments(page = 1, limit = 20, filters?: {
    status?: string;
    ikubId?: string;
    search?: string;
  }) {
    const offset = (page - 1) * limit;
    const conditions: string[] = [];
    const params: any[] = [];

    if (filters?.status) { conditions.push('p.status = ?'); params.push(filters.status); }
    if (filters?.ikubId) { conditions.push('p.ikub_id = ?'); params.push(filters.ikubId); }
    if (filters?.search) {
      conditions.push('(u.name LIKE ? OR p.transaction_id LIKE ?)');
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const payments = await query(
      `SELECT p.*, u.name as member_name, i.name as ikub_name
       FROM payments p
       JOIN members m ON m.id = p.member_id
       JOIN users u ON u.id = m.user_id
       JOIN ikubs i ON i.id = p.ikub_id
       ${whereClause}
       ORDER BY p.submitted_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [{ total }] = await query(
      `SELECT COUNT(*) as total FROM payments p
       JOIN members m ON m.id = p.member_id
       JOIN users u ON u.id = m.user_id
       JOIN ikubs i ON i.id = p.ikub_id
       ${whereClause}`,
      params
    );

    return { payments, total };
  }

  async getMemberPayments(userId: string, ikubId?: string) {
    const conditions = ['m.user_id = ?'];
    const params: any[] = [userId];

    if (ikubId) { conditions.push('p.ikub_id = ?'); params.push(ikubId); }

    return query(
      `SELECT p.*, i.name as ikub_name
       FROM payments p
       JOIN members m ON m.id = p.member_id
       JOIN ikubs i ON i.id = p.ikub_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY p.submitted_at DESC`,
      params
    );
  }

  async recordTransaction(data: {
    transactionReference: string;
    amount: number;
    source: string;
    senderName?: string;
    senderPhone?: string;
    rawMessage?: string;
    deviceId?: string;
  }) {
    // Check duplicate
    const existing = await queryOne(
      'SELECT id FROM transactions WHERE transaction_reference = ?',
      [data.transactionReference]
    );
    if (existing) return existing;

    const id = uuidv4();
    await execute(
      `INSERT INTO transactions (id, transaction_reference, amount, source, sender_name, sender_phone, raw_message, device_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, data.transactionReference, data.amount, data.source, data.senderName, data.senderPhone, data.rawMessage, data.deviceId]
    );

    // Try to match with pending payments
    const matchedPayment = await queryOne(
      "SELECT * FROM payments WHERE transaction_id = ? AND status = 'pending'",
      [data.transactionReference]
    );

    if (matchedPayment) {
      await this.tryAutoMatch(matchedPayment.id, data.transactionReference);
    }

    return queryOne('SELECT * FROM transactions WHERE id = ?', [id]);
  }
}

export const paymentService = new PaymentService();
