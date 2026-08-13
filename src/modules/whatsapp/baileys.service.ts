import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  WASocket,
  downloadMediaMessage,
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
// @ts-ignore
import { Sticker, StickerTypes } from 'wa-sticker-formatter';
import { config } from '../../config/env.js';
import { processRAGQuery } from '../retrieval/rag.service.js';
import { logChatMessage } from '../../database/db.js';
import { handleSlashCommand } from '../commands/command.handler.js';

let waSocket: WASocket | null = null;

export async function connectWhatsApp() {
  if (!fs.existsSync(config.waSessionDir)) {
    fs.mkdirSync(config.waSessionDir, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(config.waSessionDir);
  const { version } = await fetchLatestBaileysVersion();

  console.log(`📱 Initializing WhatsApp connection (Baileys v${version.join('.')})...`);

  waSocket = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
  });

  waSocket.ev.on('creds.update', saveCreds);

  waSocket.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n======================================================');
      console.log('📲 SCAN QR CODE INI MENGGUNAKAN APLIKASI WHATSAPP HP:');
      console.log('======================================================\n');
      qrcode.generate(qr, { small: true });
      console.log('\n======================================================\n');
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`⚠️ WhatsApp connection closed (Reason: ${statusCode}). Reconnecting: ${shouldReconnect}`);
      if (shouldReconnect) {
        setTimeout(() => connectWhatsApp(), 5000);
      }
    } else if (connection === 'open') {
      console.log('✅ Terhubung sukses ke WhatsApp! Asisten Mikami siap menerima pesan.');
    }
  });

  waSocket.ev.on('messages.upsert', async (m) => {
    try {
      const msg = m.messages[0];
      if (!msg || msg.key.fromMe || !msg.message) return;

      const remoteJid = msg.key.remoteJid;
      if (!remoteJid || remoteJid.endsWith('@g.us')) {
        // Skip group messages for MVP focus
        return;
      }

      // Detect image message (sent directly or as quoted/replied image)
      const imgMsg =
        msg.message.imageMessage ??
        msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage ??
        null;

      // Extract text content (caption on image, or plain text)
      const textContent =
        msg.message.imageMessage?.caption ??
        msg.message.conversation ??
        msg.message.extendedTextMessage?.text ??
        '';

      // Also check if it's a reply to an image with /sticker text
      const quotedImg =
        msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage ?? null;

      if (!textContent.trim() && !imgMsg) return;

      const senderNumber = remoteJid.replace('@s.whatsapp.net', '');
      console.log(`\n📩 Incoming message from ${senderNumber}: "${textContent}"`);

      // ── /sticker command: convert user-sent image → WhatsApp sticker ──
      const isStickerCommand = /^\/sticker\b/i.test(textContent.trim());
      const imageToConvert = imgMsg ?? quotedImg;

      if (isStickerCommand && imageToConvert) {
        console.log(`🎨 /sticker command detected — downloading & converting image from ${senderNumber}...`);
        await waSocket?.sendPresenceUpdate('composing', remoteJid);

        // Acknowledge receipt
        await waSocket?.sendMessage(remoteJid, {
          text: 'Siap king! Gambarnya lagi aku olah nih, tunggu sebentar ya stikernya meluncur... 🚀',
        });

        try {
          // Download the image from WhatsApp servers
          const mediaBuffer = await downloadMediaMessage(
            // When it's a quoted image we need to reconstruct a minimal msg object
            imgMsg
              ? msg
              : {
                  ...msg,
                  message: { imageMessage: quotedImg },
                } as any,
            'buffer',
            {},
          );

          const sticker = new Sticker(mediaBuffer as Buffer, {
            pack: 'Mikami AI Bot',
            author: 'Mikami',
            type: StickerTypes.FULL,
            quality: 70,
          });

          const stickerBuffer = await sticker.toBuffer();
          await waSocket?.sendMessage(remoteJid, { sticker: stickerBuffer });
          console.log(`✅ User sticker converted & sent successfully to ${senderNumber}!`);
        } catch (err) {
          console.error('❌ Failed to convert user image to sticker:', (err as Error).message);
          await waSocket?.sendMessage(remoteJid, {
            text: 'Waduh, gagal nih olah gambarnya 😓 Coba kirim ulang gambarnya ya king!',
          });
        }

        await waSocket?.sendPresenceUpdate('paused', remoteJid);
        logChatMessage(senderNumber, textContent, '[sticker sent]');
        return;
      }

      // If no text to process further, skip
      if (!textContent.trim()) return;

      // Show typing indicator status ("ketik...") in WhatsApp
      await waSocket?.sendPresenceUpdate('composing', remoteJid);

      // ── Slash command handler (priority over RAG) ──
      const commandReply = await handleSlashCommand(textContent);
      if (commandReply !== null) {
        await waSocket?.sendMessage(remoteJid, { text: commandReply });
        await waSocket?.sendPresenceUpdate('paused', remoteJid);
        console.log(`📤 Command reply sent to ${senderNumber}`);
        logChatMessage(senderNumber, textContent, commandReply);
        return;
      }

      // Process via RAG Engine
      const aiReply = await processRAGQuery(textContent);

      // Check for [STICKER: filename] tag in aiReply
      const stickerMatch = aiReply.match(/\[STICKER:\s*([^\]]+)\]/i);
      let stickerFileName = stickerMatch ? stickerMatch[1].trim() : null;
      const cleanReplyText = aiReply.replace(/\[STICKER:\s*[^\]]+\]/gi, '').trim();

      // Send text reply back to WhatsApp user
      if (cleanReplyText) {
        await waSocket?.sendMessage(remoteJid, { text: cleanReplyText });
      }
      await waSocket?.sendPresenceUpdate('paused', remoteJid);
      console.log(`📤 Reply sent to ${senderNumber}:\n"${cleanReplyText}"\n`);

      // If sticker tag was present, convert preset image to native WhatsApp Sticker
      if (stickerFileName) {
        const assetsDir = path.resolve('./assets');
        const assetPath = path.join(assetsDir, stickerFileName);

        if (fs.existsSync(assetPath)) {
          console.log(`🎨 Converting preset image "${stickerFileName}" to WhatsApp Sticker for ${senderNumber}...`);
          try {
            const sticker = new Sticker(assetPath, {
              pack: 'Mikami AI Bot',
              author: 'Mikami AI',
              type: StickerTypes.FULL,
              quality: 70,
            });

            const stickerBuffer = await sticker.toBuffer();
            await waSocket?.sendMessage(remoteJid, { sticker: stickerBuffer });
            console.log(`✅ WhatsApp Sticker sent successfully!`);
          } catch (stErr) {
            console.error(`Failed to send sticker ${stickerFileName}:`, (stErr as Error).message);
            // Fallback to image message if conversion fails
            try {
              const buffer = fs.readFileSync(assetPath);
              await waSocket?.sendMessage(remoteJid, { image: buffer });
            } catch (imgErr) {}
          }
        } else {
          console.warn(`⚠️ Sticker file not found at path: ${assetPath}`);
        }
      }

      // Log to database asynchronously
      logChatMessage(senderNumber, textContent, cleanReplyText);
    } catch (error) {
      console.error('Error handling incoming WhatsApp message:', error);
    }
  });

  return waSocket;
}
