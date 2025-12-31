// Run database migrations
require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

async function runMigrations() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('✅ Connected\n');

    // Migration 1: Add notes column to phase_tasks
    console.log('Adding notes column to phase_tasks...');
    await client.query('ALTER TABLE phase_tasks ADD COLUMN IF NOT EXISTS notes TEXT');
    console.log('✅ Added notes column\n');

    // Migration 2: Add invited_at column to companies
    console.log('Adding invited_at column to companies...');
    await client.query('ALTER TABLE companies ADD COLUMN IF NOT EXISTS invited_at TIMESTAMP');
    console.log('✅ Added invited_at column\n');

    // Migration 3: Add invite_count column to companies
    console.log('Adding invite_count column to companies...');
    await client.query('ALTER TABLE companies ADD COLUMN IF NOT EXISTS invite_count INTEGER DEFAULT 0');
    console.log('✅ Added invite_count column\n');

    console.log('🎉 All migrations completed successfully!');

  } catch (error) {
    console.error('❌ Migration error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigrations();
