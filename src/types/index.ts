import { Request } from 'express';

// ── User ────────────────────────────────────────────────────────────────────
export interface User {
  id: string;
  telegram_id: number | null;
  name: string;
  phone: string | null;
  role: 'member' | 'admin' | 'super_admin';
  avatar_url: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

// ── Admin ────────────────────────────────────────────────────────────────────
export interface Admin {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  name: string;
  role: 'admin' | 'super_admin';
  is_active: boolean;
  last_login: Date | null;
  created_at: Date;
  updated_at: Date;
}

// ── Ikub ─────────────────────────────────────────────────────────────────────
export interface Ikub {
  id: string;
  name: string;
  description: string | null;
  contribution_amount: number;
  schedule: 'weekly' | 'biweekly' | 'monthly';
  max_members: number;
  current_round: number;
  total_rounds: number;
  status: 'pending' | 'active' | 'completed' | 'paused';
  start_date: Date | null;
  end_date: Date | null;
  invitation_code: string;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

// ── Member ────────────────────────────────────────────────────────────────────
export interface Member {
  id: string;
  user_id: string;
  ikub_id: string;
  join_date: Date;
  order_number: number | null;
  has_received: boolean;
  is_active: boolean;
}

// ── Payment ───────────────────────────────────────────────────────────────────
export interface Payment {
  id: string;
  member_id: string;
  ikub_id: string;
  round_number: number;
  transaction_id: string;
  amount: number;
  payment_method: 'telebirr' | 'cbe_birr' | 'other';
  status: 'pending' | 'approved' | 'rejected';
  submitted_at: Date;
  verified_at: Date | null;
  verified_by: string | null;
  rejection_reason: string | null;
  notes: string | null;
}

// ── Draw ──────────────────────────────────────────────────────────────────────
export interface Draw {
  id: string;
  ikub_id: string;
  round_number: number;
  winner_member_id: string;
  amount: number;
  draw_date: Date;
  conducted_by: string | null;
  notes: string | null;
}

// ── Transaction (from Android) ────────────────────────────────────────────────
export interface Transaction {
  id: string;
  transaction_reference: string;
  amount: number;
  source: 'telebirr' | 'cbe_birr' | 'other';
  sender_name: string | null;
  sender_phone: string | null;
  raw_message: string | null;
  device_id: string | null;
  received_at: Date;
  is_matched: boolean;
  matched_payment_id: string | null;
}

// ── Auth Request ──────────────────────────────────────────────────────────────
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    telegramId?: number;
    role: string;
    name: string;
  };
  admin?: {
    id: string;
    username: string;
    role: string;
    name: string;
    isAdmin: boolean;
  };
  deviceId?: string;
  io?: any;
}

// ── API Response ──────────────────────────────────────────────────────────────
export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  pagination?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  timestamp: string;
}
