const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcrypt');
const { sendOtpMessage } = require('../services/unofficialWhatsappService'); // Pastikan ini menunjuk ke file yang benar
const SALT_ROUNDS = 10;

/**
 * Mengubah nomor WhatsApp ke format E.164.
 * Contoh: '08123' -> '628123', '+628123' -> '628123'
 * @param {string} number Nomor WhatsApp yang akan dinormalisasi.
 * @returns {string} Nomor yang sudah dinormalisasi.
 */
function normalizeWhatsappNumber(number) {
    let normalized = number.trim().replace(/[- \s]/g, ''); // Hapus spasi dan strip
    if (normalized.startsWith('08')) {
        return '62' + normalized.substring(1);
    }
    // Jika sudah menggunakan +62, hapus '+' saja
    return normalized.replace(/^\+/, '');
}

// Middleware untuk memeriksa apakah pengguna sudah login
function isAuthenticated(req, res, next) {
    if (req.session.user) {
        return next();
    }
    res.redirect('/welcome'); // Arahkan ke halaman welcome jika belum login
}

// Middleware untuk memeriksa apakah pengguna adalah tamu (belum login)
function isGuest(req, res, next) {
    if (!req.session.user) {
        return next();
    }
    res.redirect('/');
}

// Welcome page
router.get('/welcome', isGuest, (req, res) => {
    res.render('welcome');
});

// Login page
router.get('/login', isGuest, (req, res) => {
    const successMessage = req.query.success || null;
    res.render('login', { error: null, success: successMessage });
});

// Process login
router.post('/login', isGuest, async (req, res) => {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
        return res.render('login', { error: 'Username/No. WhatsApp dan Password wajib diisi.', success: null });
    }

    const trimmedIdentifier = identifier.trim();

    try {
        const result = await db.query(
            `SELECT * FROM users WHERE LOWER(username) = LOWER($1) OR whatsapp_number = $1`,
            [trimmedIdentifier]
        );
        const user = result.rows[0];

        if (!user) {
            return res.render('login', { error: 'Kombinasi kredensial tidak valid.', success: null });
        }

        const match = await bcrypt.compare(password, user.password);

        if (match) {
            req.session.user = {
                username: user.username,
                name: user.name,
                whatsapp: user.whatsapp_number
            };
            res.redirect('/');
        } else {
            return res.render('login', { error: 'Kombinasi kredensial tidak valid.', success: null });
        }
    } catch (err) {
        console.error('Login error:', err);
        return res.render('login', { error: 'Terjadi kesalahan pada server.', success: null });
    }
});

// Registration page
router.get('/register', isGuest, (req, res) => {
    res.render('register', { error: null, formData: {}, showLoginLink: false });
});

// Process registration and send OTP
router.post('/register', isGuest, async (req, res) => {
    const { username, customer_name, customer_whatsapp, password, confirm_password } = req.body;
    const formData = { username, customer_name, customer_whatsapp };

    if (!username || !customer_name || !customer_whatsapp || !password || !confirm_password) {
        return res.render('register', { error: 'Semua field wajib diisi.', formData, showLoginLink: false });
    }
    if (password !== confirm_password) {
        return res.render('register', { error: 'Password dan Konfirmasi Password tidak cocok.', formData, showLoginLink: false });
    }
    if (password.length < 6) {
        return res.render('register', { error: 'Password minimal harus 6 karakter.', formData, showLoginLink: false });
    }
    
    const normalizedWhatsapp = normalizeWhatsappNumber(customer_whatsapp);
    // Validasi format nomor WhatsApp setelah normalisasi
    if (!/^62\d{9,14}$/.test(normalizedWhatsapp)) {
        return res.render('register', { error: 'Format Nomor WhatsApp tidak valid (contoh: 6281234567890).', formData, showLoginLink: false });
    }

    const trimmedUsername = username.trim();
    const trimmedName = customer_name.trim();

    try {
        // Cek apakah username atau nomor WhatsApp sudah ada
        const userCheckResult = await db.query(`SELECT * FROM users WHERE LOWER(username) = LOWER($1) OR whatsapp_number = $2`, [trimmedUsername, normalizedWhatsapp]);
        const user = userCheckResult.rows[0];

        if (user) {
            if (user.username.toLowerCase() === trimmedUsername.toLowerCase()) {
                return res.render('register', { error: 'Username ini sudah digunakan. Silakan pilih yang lain.', formData, showLoginLink: false });
            } else {
                return res.render('register', { error: 'Nomor WhatsApp ini sudah terdaftar. Silakan login atau gunakan fitur Lupa Password.', formData, showLoginLink: true });
            }
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

        // --- LOGIKA BARU: Simpan data ke session, BUKAN ke database ---
        req.session.registrationData = {
            username: trimmedUsername,
            name: trimmedName,
            password: hashedPassword,
            whatsapp_number: normalizedWhatsapp,
        };

        // Generate, simpan, dan kirim OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
        const insertOtpSql = `
            INSERT INTO otp_requests (whatsapp_number, otp_code, expires_at) 
            VALUES ($1, $2, $3) 
            ON CONFLICT (whatsapp_number) 
            DO UPDATE SET otp_code = EXCLUDED.otp_code, expires_at = EXCLUDED.expires_at
        `;
        await db.query(insertOtpSql, [normalizedWhatsapp, otp, expiresAt.toISOString()]);

        await sendOtpMessage(normalizedWhatsapp, otp);
        
        // Arahkan ke halaman verifikasi OTP
        res.render('verify-otp', { error: null, whatsapp_number: normalizedWhatsapp });

    } catch (err) {
        console.error('Registration error:', err);
        return res.render('register', { error: 'Gagal mendaftar, terjadi kesalahan pada server.', formData, showLoginLink: false });
    }
});

// Verify OTP for registration
router.post('/register/verify', isGuest, async (req, res) => {
    const { customer_whatsapp, otp } = req.body;

    try {
        const sql = `SELECT * FROM otp_requests WHERE whatsapp_number = $1`;
        const otpResult = await db.query(sql, [customer_whatsapp]);
        const row = otpResult.rows[0];

        if (!row || row.otp_code !== otp || new Date() > new Date(row.expires_at)) {
            const error = !row ? 'Verifikasi gagal. Coba lagi.' : (new Date() > new Date(row.expires_at) ? 'Kode OTP sudah kedaluwarsa.' : 'Kode OTP salah.');
            return res.render('verify-otp', { error, whatsapp_number: customer_whatsapp });
        }

        // --- LOGIKA BARU: Cek apakah ini adalah verifikasi dari registrasi ---
        if (req.session.registrationData && req.session.registrationData.whatsapp_number === customer_whatsapp) {
            const { username, name, password, whatsapp_number } = req.session.registrationData;

            // Simpan pengguna ke database SETELAH OTP valid
            const insertUserSql = `INSERT INTO users (username, name, password, whatsapp_number) VALUES ($1, $2, $3, $4) RETURNING *`;
            const newUserResult = await db.query(insertUserSql, [username, name, password, whatsapp_number]);
            const newUser = newUserResult.rows[0];

            // Hapus data registrasi dari session
            delete req.session.registrationData;

            // Login pengguna baru
            req.session.user = {
                username: newUser.username,
                name: newUser.name,
                whatsapp: newUser.whatsapp_number
            };

            // Hapus OTP dari database dan arahkan ke halaman utama
            await db.query(`DELETE FROM otp_requests WHERE whatsapp_number = $1`, [customer_whatsapp]);
            return res.redirect('/');
        }

        // Jika bukan dari alur registrasi (misal, login via OTP di masa depan)
        // Kode ini bisa disesuaikan jika ada alur lain. Untuk saat ini, kita anggap ini error.
        await db.query(`DELETE FROM otp_requests WHERE whatsapp_number = $1`, [customer_whatsapp]);
        return res.render('login', { error: 'Sesi registrasi tidak ditemukan. Silakan coba daftar kembali.', success: null });

    } catch (err) {
        console.error('OTP verification error:', err);
        return res.render('verify-otp', { error: 'Terjadi kesalahan pada server saat verifikasi.', whatsapp_number: customer_whatsapp });
    }
});

// Resend OTP
router.post('/resend-otp', isGuest, async (req, res) => {
    const { whatsapp_number } = req.body;

    if (!whatsapp_number) {
        return res.status(400).json({ success: false, message: 'Nomor WhatsApp diperlukan.' });
    }

    try {
        // Generate, simpan, dan kirim OTP baru
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 menit dari sekarang

        const insertOtpSql = `
            INSERT INTO otp_requests (whatsapp_number, otp_code, expires_at) 
            VALUES ($1, $2, $3) 
            ON CONFLICT (whatsapp_number) 
            DO UPDATE SET otp_code = EXCLUDED.otp_code, expires_at = EXCLUDED.expires_at
        `;
        await db.query(insertOtpSql, [whatsapp_number, otp, expiresAt.toISOString()]);

        await sendOtpMessage(whatsapp_number, otp);

        res.json({ success: true, message: 'Kode OTP baru telah dikirimkan.' });

    } catch (err) {
        console.error('Resend OTP error:', err);
        res.status(500).json({ success: false, message: 'Gagal mengirim ulang OTP karena kesalahan server.' });
    }
});

// Logout
router.get('/logout', (req, res, next) => {
    req.session.destroy(err => {
        if (err) {
            console.error("Gagal menghancurkan sesi:", err);
            return next(err);
        }
        res.redirect('/welcome');
    });
});

// --- PASSWORD RESET ROUTES ---

router.get('/forgot-password', isGuest, (req, res) => {
    res.render('forgot-password', { error: null });
});

router.post('/forgot-password', isGuest, async (req, res) => {
    const { customer_whatsapp } = req.body;
    const normalizedWhatsapp = normalizeWhatsappNumber(customer_whatsapp);

    // Perbaikan bug: validasi menggunakan nomor yang sudah dinormalisasi
    if (!/^62\d{9,14}$/.test(normalizedWhatsapp)) {
        return res.render('forgot-password', { error: 'Format Nomor WhatsApp tidak valid.' });
    }

    try {
        // Check if user exists
        const userResult = await db.query(`SELECT * FROM users WHERE whatsapp_number = $1`, [normalizedWhatsapp]);
        if (userResult.rows.length === 0) {
            return res.render('forgot-password', { error: 'Nomor WhatsApp tidak terdaftar.' });
        }

        // Generate and send OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes expiry

        // Save OTP to database (upsert logic)
        const insertOtpSql = `
            INSERT INTO otp_requests (whatsapp_number, otp_code, expires_at) 
            VALUES ($1, $2, $3) 
            ON CONFLICT (whatsapp_number) 
            DO UPDATE SET otp_code = EXCLUDED.otp_code, expires_at = EXCLUDED.expires_at
        `;
        await db.query(insertOtpSql, [normalizedWhatsapp, otp, expiresAt.toISOString()]);

        // Send OTP via WhatsApp
        await sendOtpMessage(normalizedWhatsapp, otp);

        // Render the reset password page, passing the whatsapp number
        res.render('reset-password', { error: null, whatsapp_number: normalizedWhatsapp });

    } catch (err) {
        console.error('Forgot password error:', err);
        res.render('forgot-password', { error: 'Terjadi kesalahan pada server.' });
    }
});

router.post('/reset-password', isGuest, async (req, res) => {
    const { whatsapp_number, otp, password, confirm_password } = req.body;

    if (!otp || !password || !confirm_password) {
        return res.render('reset-password', { error: 'Semua field wajib diisi.', whatsapp_number });
    }
    if (password !== confirm_password) {
        return res.render('reset-password', { error: 'Password baru dan konfirmasi tidak cocok.', whatsapp_number });
    }
    if (password.length < 6) {
        return res.render('reset-password', { error: 'Password baru minimal harus 6 karakter.', whatsapp_number });
    }

    try {
        const otpResult = await db.query(`SELECT * FROM otp_requests WHERE whatsapp_number = $1 AND otp_code = $2 AND expires_at > NOW()`, [whatsapp_number, otp]);
        if (otpResult.rows.length === 0) {
            return res.render('reset-password', { error: 'Kode OTP salah atau sudah kedaluwarsa.', whatsapp_number });
        }

        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
        await db.query(`UPDATE users SET password = $1 WHERE whatsapp_number = $2`, [hashedPassword, whatsapp_number]);

        await db.query(`DELETE FROM otp_requests WHERE whatsapp_number = $1`, [whatsapp_number]);

        res.redirect('/login?success=Password+berhasil+diperbarui.+Silakan+login+kembali.');
    } catch (err) {
        console.error('Reset password error:', err);
        res.render('reset-password', { error: 'Terjadi kesalahan pada server saat mereset password.', whatsapp_number });
    }
});


module.exports = { router, isAuthenticated };