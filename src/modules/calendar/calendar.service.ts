import { google, calendar_v3 } from 'googleapis';
import { getAuthenticatedClient } from './calendar.auth.js';

function getCalendarClient() {
  const auth = getAuthenticatedClient();
  if (!auth) {
    throw new Error('Google Calendar belum terautentikasi. Ketik /auth-google untuk mulai login.');
  }
  return google.calendar({ version: 'v3', auth });
}

function formatEventTime(event: calendar_v3.Schema$Event): string {
  if (event.start?.dateTime) {
    const start = new Date(event.start.dateTime);
    const end = new Date(event.end?.dateTime || event.start.dateTime);
    const timeOpts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' };
    return `${start.toLocaleTimeString('id-ID', timeOpts)} - ${end.toLocaleTimeString('id-ID', timeOpts)}`;
  }
  if (event.start?.date) {
    return 'Sepanjang hari';
  }
  return '-';
}

function formatDateLabel(date: Date): string {
  return date.toLocaleDateString('id-ID', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Jakarta',
  });
}

/**
 * Get events for today
 */
export async function getTodayEvents(): Promise<string> {
  const calendar = getCalendarClient();

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });

  const events = res.data.items || [];
  if (events.length === 0) {
    return `📅 *Jadwal Hari Ini* — ${formatDateLabel(now)}\n\n✨ Hari ini kosong! Tidak ada event di Google Calendar.`;
  }

  const lines = events.map((ev, i) => {
    const time = formatEventTime(ev);
    const title = ev.summary || '(Tanpa judul)';
    const location = ev.location ? `\n   📍 ${ev.location}` : '';
    return `${i + 1}. 🗓 *${title}*\n   ⏰ ${time}${location}`;
  });

  return `📅 *Jadwal Hari Ini* — ${formatDateLabel(now)}\n\n${lines.join('\n\n')}`;
}

/**
 * Get events for this week (next 7 days)
 */
export async function getWeekEvents(): Promise<string> {
  const calendar = getCalendarClient();

  const now = new Date();
  const endOfWeek = new Date(now);
  endOfWeek.setDate(endOfWeek.getDate() + 7);

  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin: now.toISOString(),
    timeMax: endOfWeek.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });

  const events = res.data.items || [];
  if (events.length === 0) {
    return `📅 *Jadwal Minggu Ini*\n\n✨ Tidak ada event dalam 7 hari ke depan.`;
  }

  // Group by date
  const grouped: Record<string, string[]> = {};
  for (const ev of events) {
    const dateKey = ev.start?.dateTime
      ? new Date(ev.start.dateTime).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Jakarta' })
      : ev.start?.date || 'Unknown';

    if (!grouped[dateKey]) grouped[dateKey] = [];
    const time = formatEventTime(ev);
    grouped[dateKey].push(`  • *${ev.summary || '(Tanpa judul)'}* — ${time}`);
  }

  const lines = Object.entries(grouped).map(([date, evts]) => `📅 *${date}*\n${evts.join('\n')}`);
  return `📅 *Jadwal 7 Hari ke Depan*\n\n${lines.join('\n\n')}`;
}

/**
 * Create a new calendar event
 * startStr and endStr are ISO strings or parseable date strings
 */
export async function createCalendarEvent(
  title: string,
  startStr: string,
  endStr: string,
  description?: string,
): Promise<string> {
  const calendar = getCalendarClient();

  const event: calendar_v3.Schema$Event = {
    summary: title,
    description: description,
    start: {
      dateTime: new Date(startStr).toISOString(),
      timeZone: 'Asia/Jakarta',
    },
    end: {
      dateTime: new Date(endStr).toISOString(),
      timeZone: 'Asia/Jakarta',
    },
  };

  const res = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: event,
  });

  const createdEvent = res.data;
  const time = formatEventTime(createdEvent);
  const link = createdEvent.htmlLink ? `\n🔗 ${createdEvent.htmlLink}` : '';

  return `✅ *Event berhasil dibuat!*\n\n📌 *${createdEvent.summary}*\n⏰ ${time}${link}`;
}
