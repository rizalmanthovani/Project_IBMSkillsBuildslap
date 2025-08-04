require('dotenv').config(); // Muat variabel lingkungan dari file .env
const express = require('express');

// --- VALIDASI ENVIRONMENT VARIABLES ---
// Pindahkan validasi ini ke bagian paling atas, setelah dotenv.config().
// Ini memastikan bahwa semua variabel yang diperlukan ada SEBELUM file lain
// (seperti service atau route) di-require dan mencoba menggunakannya.
// Ini akan mencegah crash saat startup jika ada variabel yang hilang.
const requiredEnv = [
    'INSTANCE_CONNECTION_NAME', 
    'DB_USER', 
    'DB_PASSWORD', 
    'DB_NAME',
    'SESSION_SECRET',
    'GEMINI_API_KEY',
    'GOOGLE_APPLICATION_CREDENTIALS' // Tambahkan ini
];
const missingEnv = requiredEnv.filter(envVar => !process.env[envVar]);

if (missingEnv.length > 0) {
    console.error(`FATAL ERROR: Variabel lingkungan berikut tidak diatur: ${missingEnv.join(', ')}`);
    console.error("Pastikan semua variabel telah diatur di lingkungan Cloud Run (Variables & Secrets) atau di file .env untuk pengembangan lokal.");
    process.exit(1);
}

const path = require('path');
const session = require('express-session');
const authRoutes = require('./routes/authRoutes').router; // Impor router autentikasi
const mainRoutes = require('./routes/orderRoutes'); // Ganti nama untuk kejelasan
const { initializeWhatsAppClient } = require('./services/unofficialWhatsappService'); // Impor service WhatsApp tidak resmi
const { initializeDatabase } = require('./db');

const app = express();
const PORT = process.env.PORT || 33879; // Gunakan port dari environment, default ke 8080 untuk lokal

// Setup session middleware
app.use(session({
    secret: process.env.SESSION_SECRET || 'default-secret-for-dev', // Gunakan secret dari environment variable
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: false, // Set 'true' jika menggunakan HTTPS
        maxAge: 24 * 60 * 60 * 1000 // Cookie berlaku selama 24 jam
    }
}));

// Setup Template Engine EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware untuk parsing body dari request
// express.json() akan mem-parse body request menjadi objek JSON.
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware untuk menyajikan file statis (CSS, JS, gambar)
app.use(express.static(path.join(__dirname, 'public')));

// Gunakan routes yang sudah dibuat
app.use('/', authRoutes); // Gunakan rute autentikasi
app.use('/', mainRoutes); // Gunakan rute utama aplikasi

// Middleware untuk menangani error terpusat
app.use((err, req, res, next) => {
    console.error("An unhandled error occurred:", err);
    // Anda bisa menambahkan logika untuk render halaman error yang lebih baik
    res.status(500).send('Terjadi kesalahan pada server. Silakan coba lagi nanti.');
});

// Inisialisasi database lalu jalankan server
(async () => {
    try {
        await initializeDatabase();
        initializeWhatsAppClient(); // Panggil inisialisasi di sini
        app.listen(PORT, () => {
            console.log(`Server berjalan di http://localhost:${PORT}`);
            console.log('Tekan CTRL+C untuk menghentikan server.');
        });
    } catch (err) {
        console.error('FATAL ERROR: Gagal terhubung ke database. Pastikan server database berjalan dan konfigurasi di .env sudah benar.');
        console.error(err);
        process.exit(1); // Keluar dari aplikasi dengan kode error
    }
})();

