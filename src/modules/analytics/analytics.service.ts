import { google } from 'googleapis';
import { getAuthenticatedClient } from '../calendar/calendar.auth.js';
import { config } from '../../config/env.js';

/**
 * Helper to resolve property ID from alias or ID string
 */
function getPropertyId(aliasOrId?: string): string {
  if (!aliasOrId) {
    if (!config.gaPropertyId) {
      throw new Error('GA_PROPERTY_ID belum dikonfigurasi di file .env.');
    }
    return config.gaPropertyId;
  }

  const clean = aliasOrId.trim().toLowerCase();

  // If it's all digits, treat it as direct Property ID
  if (/^\d+$/.test(clean)) {
    return clean;
  }

  // Resolve from gaProperties mapping
  const mapped = config.gaProperties[clean];
  if (!mapped) {
    const list = Object.keys(config.gaProperties).join(', ');
    throw new Error(`Alias "${aliasOrId}" tidak ditemukan. Pilihan yang tersedia: ${list || 'tidak ada (gunakan angka ID langsung)'}`);
  }

  return mapped;
}

/**
 * Fetch traffic report for the past 7 days from GA4
 */
export async function getGA4TrafficReport(aliasOrId?: string): Promise<string> {
  const auth = getAuthenticatedClient();
  if (!auth) {
    throw new Error('Google account belum terhubung. Silakan jalankan @calendar-auth terlebih dahulu.');
  }

  try {
    const propertyId = getPropertyId(aliasOrId);
    const analyticsdata = google.analyticsdata({ version: 'v1beta', auth });
    const response = await analyticsdata.properties.runReport({
      property: `properties/${propertyId}`,
      requestBody: {
        dateRanges: [
          { startDate: '7daysAgo', endDate: 'today' }
        ],
        metrics: [
          { name: 'activeUsers' },
          { name: 'sessions' },
          { name: 'screenPageViews' }
        ],
        dimensions: [
          { name: 'date' }
        ]
      }
    });

    const rows = response.data.rows || [];
    if (rows.length === 0) {
      return `📊 *Laporan GA4 (Property: ${propertyId})*\n\nTidak ada data traffic untuk 7 hari terakhir.`;
    }

    rows.sort((a, b) => {
      const dateA = a.dimensionValues?.[0]?.value || '';
      const dateB = b.dimensionValues?.[0]?.value || '';
      return dateA.localeCompare(dateB);
    });

    let totalUsers = 0;
    let totalViews = 0;
    let reportList = '';

    for (const row of rows) {
      const rawDate = row.dimensionValues?.[0]?.value || '';
      const formattedDate = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
      const activeUsers = parseInt(row.metricValues?.[0]?.value || '0', 10);
      const sessions = parseInt(row.metricValues?.[1]?.value || '0', 10);
      const pageViews = parseInt(row.metricValues?.[2]?.value || '0', 10);

      totalUsers += activeUsers;
      totalViews += pageViews;

      reportList += `📅 *${formattedDate}*\n• Pengunjung: ${activeUsers} | Sesi: ${sessions} | Pageviews: ${pageViews}\n`;
    }

    return `📊 *Laporan Traffic GA4 (7 Hari Terakhir)*\n` +
           `ID Properti: \`${propertyId}\`\n\n` +
           `📈 *Total Ringkasan*:\n` +
           `• Total Pengunjung Unik: ${totalUsers}\n` +
           `• Total Pageviews: ${totalViews}\n\n` +
           `📋 *Detail Harian*:\n${reportList}`.trim();
  } catch (err) {
    console.error('GA4 Traffic Report Error:', err);
    throw new Error(`Gagal mengambil laporan GA4: ${(err as Error).message}`);
  }
}

/**
 * Fetch realtime active users (past 30 minutes) from GA4
 */
export async function getGA4RealtimeReport(aliasOrId?: string): Promise<string> {
  const auth = getAuthenticatedClient();
  if (!auth) {
    throw new Error('Google account belum terhubung. Silakan jalankan @calendar-auth terlebih dahulu.');
  }

  try {
    const propertyId = getPropertyId(aliasOrId);
    const analyticsdata = google.analyticsdata({ version: 'v1beta', auth });
    const response = await analyticsdata.properties.runRealtimeReport({
      property: `properties/${propertyId}`,
      requestBody: {
        metrics: [
          { name: 'activeUsers' }
        ],
        dimensions: [
          { name: 'country' }
        ]
      }
    });

    const rows = response.data.rows || [];
    let totalActiveUsers = 0;
    const countries: Record<string, number> = {};

    for (const row of rows) {
      const country = row.dimensionValues?.[0]?.value || 'Unknown';
      const activeUsers = parseInt(row.metricValues?.[0]?.value || '0', 10);
      totalActiveUsers += activeUsers;
      countries[country] = (countries[country] || 0) + activeUsers;
    }

    if (totalActiveUsers === 0) {
      return `🟢 *GA4 Realtime Report (Property: ${propertyId})*\n\nSaat ini sedang sepi, 0 pengunjung aktif dalam 30 menit terakhir.`;
    }

    let countryBreakdown = '';
    for (const [country, count] of Object.entries(countries)) {
      countryBreakdown += `• ${country}: ${count} user(s)\n`;
    }

    return `🟢 *GA4 Realtime Report*\n` +
           `ID Properti: \`${propertyId}\`\n\n` +
           `👥 *Pengunjung Aktif (30 Menit Terakhir)*: ${totalActiveUsers} orang\n\n` +
           `🌍 *Lokasi Pengunjung*:\n${countryBreakdown}`.trim();
  } catch (err) {
    console.error('GA4 Realtime Report Error:', err);
    throw new Error(`Gagal mengambil data realtime GA4: ${(err as Error).message}`);
  }
}

/**
 * Fetch top pages (past 7 days) from GA4
 */
export async function getGA4TopPagesReport(aliasOrId?: string): Promise<string> {
  const auth = getAuthenticatedClient();
  if (!auth) {
    throw new Error('Google account belum terhubung. Silakan jalankan @calendar-auth terlebih dahulu.');
  }

  try {
    const propertyId = getPropertyId(aliasOrId);
    const analyticsdata = google.analyticsdata({ version: 'v1beta', auth });
    const response = await analyticsdata.properties.runReport({
      property: `properties/${propertyId}`,
      requestBody: {
        dateRanges: [
          { startDate: '7daysAgo', endDate: 'today' }
        ],
        metrics: [
          { name: 'screenPageViews' }
        ],
        dimensions: [
          { name: 'pagePath' },
          { name: 'pageTitle' }
        ],
        limit: '10'
      }
    });

    const rows = response.data.rows || [];
    if (rows.length === 0) {
      return `📑 *Top Pages GA4 (Property: ${propertyId})*\n\nTidak ada data halaman populer dalam 7 hari terakhir.`;
    }

    let list = '';
    rows.forEach((row: any, i: number) => {
      const path = row.dimensionValues?.[0]?.value || '/';
      const title = row.dimensionValues?.[1]?.value || 'Untitled';
      const views = row.metricValues?.[0]?.value || '0';
      list += `${i + 1}. *${title}* (\`${path}\`)\n   └ 👀 ${views} views\n`;
    });

    return `📑 *Top 10 Halaman Populer (7 Hari Terakhir)*\n` +
           `ID Properti: \`${propertyId}\`\n\n` +
           `${list}`.trim();
  } catch (err) {
    console.error('GA4 Top Pages Report Error:', err);
    throw new Error(`Gagal mengambil data halaman populer GA4: ${(err as Error).message}`);
  }
}

/**
 * Fetch traffic sources (past 7 days) from GA4
 */
export async function getGA4TrafficSourcesReport(aliasOrId?: string): Promise<string> {
  const auth = getAuthenticatedClient();
  if (!auth) {
    throw new Error('Google account belum terhubung. Silakan jalankan @calendar-auth terlebih dahulu.');
  }

  try {
    const propertyId = getPropertyId(aliasOrId);
    const analyticsdata = google.analyticsdata({ version: 'v1beta', auth });
    const response = await analyticsdata.properties.runReport({
      property: `properties/${propertyId}`,
      requestBody: {
        dateRanges: [
          { startDate: '7daysAgo', endDate: 'today' }
        ],
        metrics: [
          { name: 'activeUsers' }
        ],
        dimensions: [
          { name: 'sessionSource' }
        ],
        limit: '10'
      }
    });

    const rows = response.data.rows || [];
    if (rows.length === 0) {
      return `🌍 *Traffic Sources GA4 (Property: ${propertyId})*\n\nTidak ada data sumber traffic dalam 7 hari terakhir.`;
    }

    let list = '';
    rows.forEach((row: any, i: number) => {
      const source = row.dimensionValues?.[0]?.value || '(direct)';
      const users = row.metricValues?.[0]?.value || '0';
      list += `${i + 1}. *${source}* — 👥 ${users} users\n`;
    });

    return `🌍 *Sumber Traffic Utama (7 Hari Terakhir)*\n` +
           `ID Properti: \`${propertyId}\`\n\n` +
           `${list}`.trim();
  } catch (err) {
    console.error('GA4 Traffic Sources Report Error:', err);
    throw new Error(`Gagal mengambil data sumber traffic GA4: ${(err as Error).message}`);
  }
}
