import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getTodayEvents, getWeekEvents, createCalendarEvent } from '../calendar/calendar.service.js';
import { searchMeetingNotes, getMeetingNote } from '../obsidian/obsidian.service.js';
import { isAuthenticated, getAuthUrl } from '../calendar/calendar.auth.js';

// ── Type definisi ────────────────────────────────────────────
interface CommandConfig {
  trigger: string;
  aliases?: string[];
  description?: string;
  reply?: string;
  reply_already_connected?: string;
  reply_connect_prompt?: string;
  reply_no_args?: string;
  reply_success?: string;
  reply_error?: string;
  reply_not_connected?: string;
  reply_format_error?: string;
}

interface NamespaceConfig {
  prefix: string;
  description: string;
  commands: Record<string, CommandConfig>;
}

interface CommandsFile {
  namespaces: Record<string, NamespaceConfig>;
  global: Record<string, CommandConfig>;
}

// ── Load commands.json saat startup ─────────────────────────
const configPath = resolve(process.cwd(), 'src/modules/commands/commands.json');
const config = JSON.parse(readFileSync(configPath, 'utf-8')) as CommandsFile;

// ── Build flat lookup map: trigger/alias → { ns, key } ──────
//    Ini memungkinkan pencarian O(1) saat pesan masuk
const triggerMap = new Map<string, { ns: string; key: string }>();

for (const [ns, namespace] of Object.entries(config.namespaces)) {
  for (const [key, cmd] of Object.entries(namespace.commands)) {
    triggerMap.set(cmd.trigger, { ns, key });
    for (const alias of cmd.aliases ?? []) {
      triggerMap.set(alias, { ns, key });
    }
  }
}
for (const [key, cmd] of Object.entries(config.global)) {
  triggerMap.set(cmd.trigger, { ns: 'global', key });
  for (const alias of cmd.aliases ?? []) {
    triggerMap.set(alias, { ns: 'global', key });
  }
}

// ── Ambil CommandConfig dari lookup result ───────────────────
function getCmd(ns: string, key: string): CommandConfig {
  if (ns === 'global') return config.global[key];
  return config.namespaces[ns].commands[key];
}

// ── Helper: ganti placeholder {{key}} dengan nilai nyata ────
function r(template: string, vars: Record<string, string> = {}): string {
  return Object.entries(vars).reduce(
    (str, [k, v]) => str.replaceAll(`{{${k}}}`, v),
    template
  );
}

/**
 * Detects if the message is a slash/at command and handles it.
 * Returns a response string if handled, or null if it's not a command.
 */
export async function handleSlashCommand(text: string, sender: string): Promise<string | null> {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/') && !trimmed.startsWith('@')) return null;

  const parts = trimmed.split(/\s+/);
  const trigger = parts[0].toLowerCase();
  const args = parts.slice(1).join(' ').trim();

  // Lookup trigger di map
  const ref = triggerMap.get(trigger);
  if (!ref) return null;

  const cmd = getCmd(ref.ns, ref.key);

  // ── GLOBAL ─────────────────────────────────────────────────
  if (ref.ns === 'global') {
    return cmd.reply ?? null;
  }

  // ── CALENDAR NAMESPACE ─────────────────────────────────────
  if (ref.ns === 'calendar') {

    if (ref.key === 'auth') {
      const url = getAuthUrl();
      if (isAuthenticated()) {
        return `ℹ️ *Akun Google sudah terhubung.* Jika kamu ingin memperbarui izin/scope, silakan klik link ini:\n\n${url}`;
      }
      return r(cmd.reply_connect_prompt ?? '', { url });
    }

    if (ref.key === 'code') {
      if (!args) return cmd.reply_no_args ?? null;
      const { exchangeCodeForToken } = await import('../calendar/calendar.auth.js');
      try {
        await exchangeCodeForToken(args);
        return cmd.reply_success ?? null;
      } catch (err) {
        return r(cmd.reply_error ?? '❌ {{error}}', { error: (err as Error).message });
      }
    }

    if (ref.key === 'today') {
      try {
        if (!isAuthenticated()) return cmd.reply_not_connected ?? null;
        return await getTodayEvents();
      } catch (err) {
        return r(cmd.reply_error ?? '❌ {{error}}', { error: (err as Error).message });
      }
    }

    if (ref.key === 'week') {
      try {
        if (!isAuthenticated()) return cmd.reply_not_connected ?? null;
        return await getWeekEvents();
      } catch (err) {
        return r(cmd.reply_error ?? '❌ {{error}}', { error: (err as Error).message });
      }
    }

    if (ref.key === 'create') {
      if (!args) return cmd.reply_no_args ?? null;
      try {
        if (!isAuthenticated()) return cmd.reply_not_connected ?? null;
        const piped = args.split('|').map((s) => s.trim());
        if (piped.length < 3) return cmd.reply_format_error ?? null;
        const [title, startStr, endStr, ...descParts] = piped;
        const description = descParts.join(' | ') || undefined;
        return await createCalendarEvent(title, startStr, endStr, description);
      } catch (err) {
        return r(cmd.reply_error ?? '❌ {{error}}', { error: (err as Error).message });
      }
    }
  }

  // ── OBSIDIAN NAMESPACE ─────────────────────────────────────
  if (ref.ns === 'obsidian') {

    if (ref.key === 'search') {
      if (!args) return cmd.reply_no_args ?? null;
      try {
        return await searchMeetingNotes(args);
      } catch (err) {
        return r(cmd.reply_error ?? '❌ {{error}}', { error: (err as Error).message });
      }
    }

    if (ref.key === 'read') {
      if (!args) return cmd.reply_no_args ?? null;
      try {
        return await getMeetingNote(args);
      } catch (err) {
        return r(cmd.reply_error ?? '❌ {{error}}', { error: (err as Error).message });
      }
    }
  }

  // ── MEMORY NAMESPACE ───────────────────────────────────────
  if (ref.ns === 'memory') {
    if (ref.key === 'save') {
      if (!args) return cmd.reply_no_args ?? null;
      try {
        const { saveUserMemory } = await import('../../database/db.js');
        await saveUserMemory(sender, args);
        return r(cmd.reply_success ?? '', { fact: args });
      } catch (err) {
        return r(cmd.reply_error ?? '❌ {{error}}', { error: (err as Error).message });
      }
    }

    if (ref.key === 'clear') {
      try {
        const { pool } = await import('../../database/db.js');
        await pool.query('DELETE FROM user_memories WHERE sender = $1', [sender]);
        return cmd.reply_success ?? null;
      } catch (err) {
        return r(cmd.reply_error ?? '❌ {{error}}', { error: (err as Error).message });
      }
    }
  }

  // ── ANALYTICS NAMESPACE ────────────────────────────────────
  if (ref.ns === 'analytics') {
    if (!isAuthenticated()) {
      return cmd.reply_not_connected ?? null;
    }

    const propParam = args || undefined;

    if (ref.key === 'report') {
      try {
        const { getGA4TrafficReport } = await import('../analytics/analytics.service.js');
        return await getGA4TrafficReport(propParam);
      } catch (err) {
        return r(cmd.reply_error ?? '❌ {{error}}', { error: (err as Error).message });
      }
    }

    if (ref.key === 'realtime') {
      try {
        const { getGA4RealtimeReport } = await import('../analytics/analytics.service.js');
        return await getGA4RealtimeReport(propParam);
      } catch (err) {
        return r(cmd.reply_error ?? '❌ {{error}}', { error: (err as Error).message });
      }
    }

    if (ref.key === 'pages') {
      try {
        const { getGA4TopPagesReport } = await import('../analytics/analytics.service.js');
        return await getGA4TopPagesReport(propParam);
      } catch (err) {
        return r(cmd.reply_error ?? '❌ {{error}}', { error: (err as Error).message });
      }
    }

    if (ref.key === 'source') {
      try {
        const { getGA4TrafficSourcesReport } = await import('../analytics/analytics.service.js');
        return await getGA4TrafficSourcesReport(propParam);
      } catch (err) {
        return r(cmd.reply_error ?? '❌ {{error}}', { error: (err as Error).message });
      }
    }
  }

  return null;
}
