import cron from 'node-cron';
import fetch from 'node-fetch';
import { query, queryOne } from '../database/connection';
import { logger } from '../utils/logger';

// ── Telegram Bot helper ───────────────────────────────────────────────────────

async function sendTelegramMessage(telegramId: number, text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || token === 'your_telegram_bot_token') {
    // Bot not configured — log instead of crashing
    logger.info(`[Reminder simulation] → TG:${telegramId}: ${text}`);
    return false;
  }

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: telegramId,
          text,
          parse_mode: 'HTML',
        }),
      }
    );
    const json = (await res.json()) as any;
    if (!json.ok) {
      logger.warn(`Telegram send failed for ${telegramId}: ${json.description}`);
      return false;
    }
    return true;
  } catch (err) {
    logger.error(`Telegram send error for ${telegramId}:`, err);
    return false;
  }
}

// ── Core reminder logic ───────────────────────────────────────────────────────

/**
 * Finds all active Ikubs and members who have NOT yet paid the current round.
 * Sends a Telegram message to each unpaid member.
 *
 * @param daysLeft  "3 days left" | "1 day left" | "today"
 */
async function sendRoundReminders(daysLeft: '3 days' | '1 day' | 'today'): Promise<void> {
  logger.info(`[Reminders] Running "${daysLeft}" reminder job…`);

  // All active ikubs with their current round
  const activeIkubs = await query(
    `SELECT id, name, contribution_amount, current_round FROM ikubs WHERE status = 'active'`
  );

  let totalSent = 0;
  let totalSkipped = 0;

  for (const ikub of activeIkubs) {
    const nextRound = ikub.current_round + 1;

    // Members who have NOT submitted an approved/pending payment for nextRound
    const unpaidMembers = await query(
      `SELECT u.telegram_id, u.name, m.id as member_id
       FROM members m
       JOIN users u ON u.id = m.user_id
       WHERE m.ikub_id = ?
         AND m.is_active = TRUE
         AND u.telegram_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM payments p
           WHERE p.member_id = m.id
             AND p.ikub_id   = ?
             AND p.round_number = ?
             AND p.status IN ('approved','pending')
         )`,
      [ikub.id, ikub.id, nextRound]
    );

    for (const member of unpaidMembers) {
      const urgency =
        daysLeft === 'today'
          ? '⚠️ <b>Today is the last day!</b>'
          : daysLeft === '1 day'
          ? '🔔 <b>Only 1 day left!</b>'
          : '📅 <b>3 days left</b>';

      const message =
        `${urgency}\n\n` +
        `Hi <b>${member.name}</b>, this is a reminder that your Ikub contribution is due soon.\n\n` +
        `📦 <b>Group:</b> ${ikub.name}\n` +
        `💰 <b>Amount:</b> ${Number(ikub.contribution_amount).toLocaleString('en-ET')} ETB\n` +
        `🔢 <b>Round:</b> ${nextRound}\n\n` +
        `Please submit your payment via the SmartIkub app. 🙏`;

      const sent = await sendTelegramMessage(member.telegram_id, message);
      if (sent) totalSent++;
      else totalSkipped++;
    }
  }

  logger.info(`[Reminders] "${daysLeft}" job done — sent: ${totalSent}, skipped/simulated: ${totalSkipped}`);
}

// ── Schedule registration ─────────────────────────────────────────────────────

/**
 * Registers all three cron jobs.
 * Call this once from src/index.ts after bootstrap.
 *
 * Cron format: second(opt) minute hour day-of-month month day-of-week
 *
 * We run each check daily at 09:00 AM Ethiopia time (UTC+3 = 06:00 UTC).
 * The jobs themselves decide whether to send based on the Ikub's payment_deadline column.
 * Since we don't store an exact deadline date per round yet, we use a simple approach:
 * Run all three jobs on different days of the week to approximate the right timing.
 *
 * When you add a `payment_deadline` column to `ikubs`, you can refine the query
 * to only remind members whose deadline is exactly 3/1/0 days away.
 */
export function schedulePaymentReminders(): void {
  // Every day at 09:00 AM (EAT = UTC+3, so 06:00 UTC)
  // We run all three types and let the DB query handle eligibility.
  // In production, add a `next_payment_date` column to ikubs for precise targeting.

  // 3-day reminder — runs every Monday at 09:00 EAT
  cron.schedule('0 6 * * 1', async () => {
    await sendRoundReminders('3 days');
  }, { timezone: 'Africa/Addis_Ababa' });

  // 1-day reminder — runs every Wednesday at 09:00 EAT
  cron.schedule('0 6 * * 3', async () => {
    await sendRoundReminders('1 day');
  }, { timezone: 'Africa/Addis_Ababa' });

  // Same-day reminder — runs every Thursday at 09:00 EAT
  cron.schedule('0 6 * * 4', async () => {
    await sendRoundReminders('today');
  }, { timezone: 'Africa/Addis_Ababa' });

  logger.info('✅ Payment reminder cron jobs scheduled (Mon/Wed/Thu 09:00 EAT)');
}

/**
 * Manually trigger a reminder — useful for testing via an admin API call.
 */
export async function triggerReminder(daysLeft: '3 days' | '1 day' | 'today'): Promise<void> {
  await sendRoundReminders(daysLeft);
}

export { sendTelegramMessage };
