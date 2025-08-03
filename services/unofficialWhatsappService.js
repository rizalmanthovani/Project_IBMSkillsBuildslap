const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

let client;
let isClientReady = false;

/**
 * Inisialisasi client WhatsApp.
 * Ini akan menampilkan kode QR di terminal yang perlu Anda pindai
 * dengan aplikasi WhatsApp di ponsel Anda saat pertama kali dijalankan.
 */
function initializeWhatsAppClient() {
    console.log('Menginisialisasi WhatsApp Client...');

    client = new Client({
        authStrategy: new LocalAuth(), // Menyimpan sesi agar tidak perlu scan QR setiap kali restart
        puppeteer: {
            headless: true,
            // Argumen ini sangat penting untuk berjalan di lingkungan server/Docker
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
        }
    });

    client.on('qr', (qr) => {
        console.log('--- PINDAI KODE QR INI DENGAN WHATSAPP ANDA ---');
        qrcode.generate(qr, { small: true });
        console.log('-------------------------------------------------');
    });

    client.on('ready', () => {
        isClientReady = true;
        console.log('WhatsApp Client sudah siap!');
    });

    client.on('auth_failure', msg => {
        console.error('AUTENTIKASI GAGAL', msg);
        process.exit(1); // Keluar jika autentikasi gagal, mungkin sesi rusak.
    });

    client.initialize();
}

/**
 * Mengirim kode OTP ke pengguna via nomor WhatsApp pribadi.
 * @param {string} phoneNumber - Nomor tujuan (format: 62...).
 * @param {string} otp - Kode OTP yang akan dikirim.
 */
async function sendOtpMessage(phoneNumber, otp) {
    if (!isClientReady) {
        throw new Error('WhatsApp client belum siap. Mohon tunggu atau pindai kode QR.');
    }
    const text = `[BarberLux] Kode verifikasi Anda adalah: ${otp}. Jangan berikan kode ini kepada siapa pun.`;
    const chatId = `${phoneNumber}@c.us`; // Format ID chat WhatsApp
    await client.sendMessage(chatId, text);
    console.log(`Pesan OTP (via nomor pribadi) terkirim ke ${phoneNumber}`);
}

async function sendNewOrderNotification(barber, orderDetails) {
    if (!isClientReady) {
        console.warn('WhatsApp client belum siap, notifikasi pesanan baru tidak terkirim.');
        return;
    }
    const text = `Pesanan Baru dari ${orderDetails.customer_name} (${orderDetails.service_type}) untuk ${new Date(orderDetails.order_start_time).toLocaleString('id-ID')}.`;
    const chatId = `${barber.whatsapp_number}@c.us`;
    await client.sendMessage(chatId, text);
    console.log(`Notifikasi pesanan baru (via nomor pribadi) terkirim ke ${barber.name}`);
}

module.exports = {
    initializeWhatsAppClient,
    sendOtpMessage,
    sendNewOrderNotification
};