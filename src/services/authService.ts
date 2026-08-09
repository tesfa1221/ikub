import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../database/connection';
import { createError } from '../middleware/errorHandler';

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

export class AuthService {
  // Telegram Mini App login
  async telegramLogin(telegramUser: TelegramUser): Promise<{ user: any; token: string }> {
    let user = await queryOne(
      'SELECT * FROM users WHERE telegram_id = ?',
      [telegramUser.id]
    );

    if (!user) {
      // Create new user
      const userId = uuidv4();
      const name = [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(' ');

      await execute(
        `INSERT INTO users (id, telegram_id, name, role) VALUES (?, ?, ?, 'member')`,
        [userId, telegramUser.id, name]
      );

      user = await queryOne('SELECT * FROM users WHERE id = ?', [userId]);
    } else {
      // Update last seen info
      const name = [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(' ');
      await execute('UPDATE users SET name = ? WHERE telegram_id = ?', [name, telegramUser.id]);
    }

    const token = jwt.sign(
      {
        id: user.id,
        telegramId: user.telegram_id,
        role: user.role,
        name: user.name,
      },
      process.env.JWT_SECRET!,
      { expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as any }
    );

    const { password_hash, ...safeUser } = user;
    return { user: safeUser, token };
  }

  // Admin login
  async adminLogin(username: string, password: string): Promise<{ admin: any; token: string }> {
    const admin = await queryOne(
      'SELECT * FROM admins WHERE (username = ? OR email = ?) AND is_active = TRUE',
      [username, username]
    );

    if (!admin) {
      throw createError('Invalid credentials', 401);
    }

    const isValid = await bcrypt.compare(password, admin.password_hash);
    if (!isValid) {
      throw createError('Invalid credentials', 401);
    }

    // Update last login
    await execute('UPDATE admins SET last_login = NOW() WHERE id = ?', [admin.id]);

    const token = jwt.sign(
      {
        id: admin.id,
        username: admin.username,
        role: admin.role,
        name: admin.name,
        isAdmin: true,
      },
      process.env.ADMIN_JWT_SECRET!,
      { expiresIn: (process.env.ADMIN_JWT_EXPIRES_IN || '24h') as any }
    );

    const { password_hash, ...safeAdmin } = admin;
    return { admin: safeAdmin, token };
  }

  async updateProfile(userId: string, data: { phone?: string; name?: string }): Promise<any> {
    const fields: string[] = [];
    const values: any[] = [];

    if (data.name) { fields.push('name = ?'); values.push(data.name); }
    if (data.phone) { fields.push('phone = ?'); values.push(data.phone); }

    if (fields.length === 0) throw createError('No fields to update', 400);

    values.push(userId);
    await execute(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);

    return queryOne('SELECT id, telegram_id, name, phone, role, created_at FROM users WHERE id = ?', [userId]);
  }
}

export const authService = new AuthService();
