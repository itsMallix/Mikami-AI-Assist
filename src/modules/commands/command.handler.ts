import { getTodayEvents, getWeekEvents, createCalendarEvent } from '../calendar/calendar.service.js';
import { searchMeetingNotes, getMeetingNote } from '../obsidian/obsidian.service.js';
import { isAuthenticated, getAuthUrl } from '../calendar/calendar.auth.js';

/**
 * Detects if the message is a slash command and handles it.
 * Returns a response string if handled, or null if it's not a command.
 */
export async function handleSlashCommand(text: string): Promise<string | null> {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return null;

  const parts = trimmed.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1).join(' ').trim();

  // ── GOOGLE CALENDAR ────────────────────────────────────────
  if (cmd === '/auth-google') {
    if (isAuthenticated()) {
      return '✅ Google Calendar sudah terhubung! Kamu bisa pakai /jadwal dan /buat-event sekarang.';
    }
    const url = getAuthUrl();
    return `🔐 *Login Google Calendar*\n\nBuka link ini di browser untuk login:\n${url}\n\nSetelah login, salin kode yang muncul lalu kirim:\n/google-code <kode kamu>`;
  }

  if (cmd === '/google-code') {
    if (!args) {
      return '⚠️ Format: /google-code <kode>\nContoh: /google-code 4/0AX...';
    }
    const { exchangeCodeForToken } = await import('../calendar/calendar.auth.js');
    try {
      await exchangeCodeForToken(args);
      return '✅ *Google Calendar berhasil terhubung!*\n\nSekarang kamu bisa:\n• /jadwal — lihat jadwal hari ini\n• /jadwal-minggu — lihat jadwal minggu ini\n• /buat-event — buat event baru';
    } catch (err) {
      return `❌ Gagal verifikasi kode Google: ${(err as Error).message}`;
    }
  }

  if (cmd === '/jadwal' || cmd === '/today') {
    try {
      if (!isAuthenticated()) {
        return '⚠️ Google Calendar belum terhubung.\nKetik /auth-google untuk mulai.';
      }
      return await getTodayEvents();
    } catch (err) {
      return `❌ ${(err as Error).message}`;
    }
  }

  if (cmd === '/jadwal-minggu' || cmd === '/week') {
    try {
      if (!isAuthenticated()) {
        return '⚠️ Google Calendar belum terhubung.\nKetik /auth-google untuk mulai.';
      }
      return await getWeekEvents();
    } catch (err) {
      return `❌ ${(err as Error).message}`;
    }
  }

  if (cmd === '/buat-event' || cmd === '/new-event') {
    if (!args) {
      return `📅 *Buat Event Baru*\n\nFormat:\n/buat-event Judul | tanggal-mulai | tanggal-selesai\n\nContoh:\n/buat-event Meeting Klien | 2024-08-15T14:00 | 2024-08-15T15:00`;
    }

    try {
      if (!isAuthenticated()) {
        return '⚠️ Google Calendar belum terhubung.\nKetik /auth-google untuk mulai.';
      }

      const piped = args.split('|').map((s) => s.trim());
      if (piped.length < 3) {
        return `⚠️ Format kurang lengkap.\n\nGunakan:\n/buat-event Judul Event | 2024-08-15T14:00 | 2024-08-15T15:00`;
      }
      const [title, startStr, endStr, ...descParts] = piped;
      const description = descParts.join(' | ') || undefined;
      return await createCalendarEvent(title, startStr, endStr, description);
    } catch (err) {
      return `❌ Gagal membuat event: ${(err as Error).message}`;
    }
  }

  // ── OBSIDIAN ───────────────────────────────────────────────
  if (cmd === '/catatan' || cmd === '/note') {
    if (!args) {
      return `📓 *Cari Catatan Meeting*\n\nFormat:\n/catatan <kata kunci>\n\nContoh:\n/catatan marketing`;
    }
    try {
      return await searchMeetingNotes(args);
    } catch (err) {
      return `❌ ${(err as Error).message}`;
    }
  }

  if (cmd === '/baca-catatan' || cmd === '/read-note') {
    if (!args) {
      return `📄 *Baca Catatan Meeting*\n\nFormat:\n/baca-catatan <judul>`;
    }
    try {
      return await getMeetingNote(args);
    } catch (err) {
      return `❌ ${(err as Error).message}`;
    }
  }

  // ── HELP ───────────────────────────────────────────────────
  if (cmd === '/help' || cmd === '/bantuan') {
    return `🤖 *Mikami AI Assistant — Daftar Perintah*

📅 *Google Calendar*
• \`/auth-google\` — Hubungkan Google Calendar
• \`/jadwal\` — Lihat jadwal hari ini
• \`/jadwal-minggu\` — Lihat jadwal 7 hari ke depan
• \`/buat-event Judul | 2024-08-15T14:00 | 2024-08-15T15:00\` — Buat event baru

📓 *Obsidian (Catatan Meeting)*
• \`/catatan <kata kunci>\` — Cari catatan meeting
• \`/baca-catatan <judul>\` — Baca isi catatan meeting

❓ *Lainnya*
• \`/help\` — Tampilkan perintah ini

_Atau tanya saja langsung, aku siap jawab! 😊_`;
  }

  return null;
}
