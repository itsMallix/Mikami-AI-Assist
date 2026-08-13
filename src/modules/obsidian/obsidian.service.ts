import fs from 'fs';
import path from 'path';
import { config } from '../../config/env.js';

function getVaultPath(): string {
  if (!config.obsidianVaultPath) {
    throw new Error('OBSIDIAN_VAULT_PATH belum dikonfigurasi di file .env');
  }
  return config.obsidianVaultPath;
}

function getMeetingFolder(): string {
  return path.join(getVaultPath(), config.obsidianMeetingFolder || 'Meetings');
}

/**
 * List all meeting note files from the vault
 */
function listMeetingFiles(): string[] {
  const folder = getMeetingFolder();
  if (!fs.existsSync(folder)) {
    return [];
  }
  return fs
    .readdirSync(folder, { withFileTypes: true })
    .filter((f) => f.isFile() && f.name.endsWith('.md'))
    .map((f) => path.join(folder, f.name));
}

/**
 * Search meeting notes by keyword (searches filename & content)
 */
export async function searchMeetingNotes(keyword: string): Promise<string> {
  const files = listMeetingFiles();

  if (files.length === 0) {
    return `📓 *Catatan Meeting*\n\nFolder catatan meeting belum ditemukan atau kosong.\nPastikan path vault dan folder sudah benar di .env`;
  }

  const kwLower = keyword.toLowerCase();
  const results: Array<{ title: string; snippet: string; filePath: string }> = [];

  for (const filePath of files) {
    const title = path.basename(filePath, '.md');
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const titleMatch = title.toLowerCase().includes(kwLower);
      const contentMatch = content.toLowerCase().includes(kwLower);

      if (titleMatch || contentMatch) {
        // Extract a snippet around the keyword in content
        let snippet = '';
        if (contentMatch) {
          const idx = content.toLowerCase().indexOf(kwLower);
          const start = Math.max(0, idx - 80);
          const end = Math.min(content.length, idx + 150);
          snippet = '...' + content.slice(start, end).replace(/\n+/g, ' ').trim() + '...';
        } else {
          // Just first 150 chars of content
          snippet = content.slice(0, 150).replace(/\n+/g, ' ').trim() + '...';
        }
        results.push({ title, snippet, filePath });
      }
    } catch {
      // skip unreadable files
    }
  }

  if (results.length === 0) {
    return `📓 *Catatan Meeting*\n\nTidak ditemukan catatan dengan kata kunci: _"${keyword}"_`;
  }

  const lines = results.slice(0, 5).map((r, i) => `${i + 1}. 📄 *${r.title}*\n   ${r.snippet}`);
  return `📓 *Hasil Pencarian Catatan Meeting*\nKata kunci: _"${keyword}"_\n\n${lines.join('\n\n')}${results.length > 5 ? `\n\n_...dan ${results.length - 5} catatan lainnya_` : ''}`;
}

/**
 * Read full content of a meeting note by title (partial match supported)
 */
export async function getMeetingNote(titleQuery: string): Promise<string> {
  const files = listMeetingFiles();

  if (files.length === 0) {
    return `📓 Folder catatan meeting belum ditemukan atau kosong.`;
  }

  const qLower = titleQuery.toLowerCase();
  const match = files.find((f) => path.basename(f, '.md').toLowerCase().includes(qLower));

  if (!match) {
    return `📓 *Catatan Meeting*\n\nTidak ditemukan catatan dengan judul: _"${titleQuery}"_`;
  }

  try {
    const content = fs.readFileSync(match, 'utf-8');
    const title = path.basename(match, '.md');

    // Limit to 1500 chars to avoid WhatsApp message limit
    const preview = content.length > 1500 ? content.slice(0, 1500) + '\n\n_...(catatan dipotong, buka di Obsidian untuk melihat selengkapnya)_' : content;
    return `📄 *${title}*\n\n${preview}`;
  } catch {
    return `❌ Gagal membaca catatan. Coba lagi.`;
  }
}
