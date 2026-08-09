import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { execute, query } from './connection';
import dotenv from 'dotenv';

dotenv.config();

async function seed() {
  console.log('🌱 Seeding database...');

  // Create super admin
  const adminId = uuidv4();
  const passwordHash = await bcrypt.hash('Admin@12345', 12);

  await execute(
    `INSERT IGNORE INTO admins (id, username, email, password_hash, name, role)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [adminId, 'superadmin', 'admin@smartikub.com', passwordHash, 'Super Admin', 'super_admin']
  );

  // Create sample Ikub group
  const ikubId = uuidv4();
  const invitationCode = 'IKUB' + Math.random().toString(36).substring(2, 8).toUpperCase();

  await execute(
    `INSERT IGNORE INTO ikubs (id, name, description, contribution_amount, schedule, max_members, total_rounds, status, invitation_code, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ikubId,
      'Addis Monthly Ikub',
      'A trusted monthly savings group for Addis Ababa members',
      1000.00,
      'monthly',
      10,
      10,
      'active',
      invitationCode,
      adminId,
    ]
  );

  console.log('✅ Seed completed');
  console.log('👤 Admin credentials:');
  console.log('   Username: superadmin');
  console.log('   Password: Admin@12345');
  console.log(`📋 Sample Ikub invitation code: ${invitationCode}`);

  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
