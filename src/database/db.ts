import pg from 'pg';
import { config } from '../config/env.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
});

export async function initDatabase() {
  try {
    const client = await pool.connect();
    try {
      // Create message_logs table if not exists
      await client.query(`
        CREATE TABLE IF NOT EXISTS message_logs (
          id SERIAL PRIMARY KEY,
          sender VARCHAR(100) NOT NULL,
          message TEXT NOT NULL,
          response TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Create user_memories table if not exists
      await client.query(`
        CREATE TABLE IF NOT EXISTS user_memories (
          id SERIAL PRIMARY KEY,
          sender VARCHAR(100) NOT NULL,
          memory_text TEXT NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      console.log('✅ PostgreSQL database initialized (tables ready).');
    } finally {
      client.release();
    }
  } catch (err) {
    console.warn('⚠️ PostgreSQL connection failed. Chat logging & memory to DB will be bypassed if Postgres is unreachable:', (err as Error).message);
  }
}

export async function logChatMessage(sender: string, message: string, response: string) {
  try {
    await pool.query(
      'INSERT INTO message_logs (sender, message, response) VALUES ($1, $2, $3)',
      [sender, message, response]
    );
  } catch (err) {
    console.error('Failed to log chat message to DB:', (err as Error).message);
  }
}

export async function saveUserMemory(sender: string, memoryText: string): Promise<void> {
  try {
    await pool.query(
      'INSERT INTO user_memories (sender, memory_text) VALUES ($1, $2)',
      [sender, memoryText]
    );
  } catch (err) {
    console.error('Failed to save user memory to DB:', (err as Error).message);
    throw err;
  }
}

export async function getUserMemories(sender: string): Promise<string[]> {
  try {
    const res = await pool.query(
      'SELECT memory_text FROM user_memories WHERE sender = $1 ORDER BY created_at DESC LIMIT 30',
      [sender]
    );
    return res.rows.map(row => row.memory_text);
  } catch (err) {
    console.error('Failed to get user memories from DB:', (err as Error).message);
    return [];
  }
}

