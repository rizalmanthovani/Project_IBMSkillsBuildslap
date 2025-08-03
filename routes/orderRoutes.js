const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const db = require('../db');
const { sendNewOrderNotification } = require('../services/unofficialWhatsappService');
const { parseISO, addMinutes, format, startOfDay, endOfDay, areIntervalsOverlapping } = require('date-fns');
const { getAiStylistResponse } = require('../services/aiService');

const { createSubscriptionTransaction, handleMidtransNotification } = require('../services/paymentService');

// --- Configuration Constants ---
const OPENING_HOUR = 10;
const OPENING_MINUTE = 0;
const CLOSING_HOUR = 20;
const CLOSING_MINUTE = 30;
const DURATION_IN_SHOP = 30; // in minutes
const DURATION_HOME_SERVICE = 45; // in minutes

const services = [
    "Potong Rambut Pria",
    "Potong Rambut + Cuci",
    "Potong Rambut + Creambath",
    "Cukur Jenggot",
    "Paket Lengkap (Rambut, Cuci, Creambath, Jenggot)"
];

// --- Multer Configuration for File Uploads ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/'); // Pastikan direktori ini ada
    },
    filename: function (req, file, cb) {
        // Buat nama file yang unik untuk menghindari konflik
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// Inisialisasi multer dengan konfigurasi storage
const upload = multer({ storage: storage });

const { isAuthenticated } = require('./authRoutes');

// --- MAIN APPLICATION ROUTES ---

// Halaman utama (pemesanan)
router.get('/', isAuthenticated, async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM barbers");
        const barbers = result.rows;
        res.render('index', { barbers, services, user: req.session.user, error: null, success: null, activePage: 'booking' });
    } catch (err) {
        next(err); // Teruskan error ke middleware pusat
    }
});

// API untuk mendapatkan slot waktu yang tersedia
router.get('/api/available-slots', isAuthenticated, async (req, res) => {
    const { date, barberId } = req.query;
    if (!date || !barberId) {
        return res.status(400).json({ error: 'Date and Barber ID are required' });
    }

    const selectedDate = parseISO(date);
    const startOfSelectedDay = startOfDay(selectedDate);
    const endOfSelectedDay = endOfDay(selectedDate);

    const sql = `SELECT order_start_time, order_end_time FROM orders WHERE barber_id = $1 AND order_start_time BETWEEN $2 AND $3`;

    try {
        const result = await db.query(sql, [barberId, startOfSelectedDay.toISOString(), endOfSelectedDay.toISOString()]);
        const orders = result.rows;
        
        const bookedIntervals = orders.map(order => ({
            start: parseISO(order.order_start_time),
            end: parseISO(order.order_end_time)
        }));

        const availableSlots = [];
        const openingTime = new Date(selectedDate.setHours(OPENING_HOUR, OPENING_MINUTE, 0, 0));
        const closingTime = new Date(selectedDate.setHours(CLOSING_HOUR, CLOSING_MINUTE, 0, 0));
        let currentTime = openingTime;

        // Slot waktu per 30 menit
        while (currentTime < closingTime) {
            const slot = {
                start: currentTime,
                end: addMinutes(currentTime, 30) // Cek slot per 30 menit
            };

            const isOverlapping = bookedIntervals.some(booked => 
                areIntervalsOverlapping(
                    { start: slot.start, end: slot.end },
                    { start: booked.start, end: booked.end },
                    { inclusive: false } // Slot tidak boleh bersentuhan
                )
            );

            if (!isOverlapping) {
                availableSlots.push(format(slot.start, 'HH:mm'));
            }

            currentTime = addMinutes(currentTime, 30);
        }

        res.json(availableSlots);
    } catch (err) {
        console.error("Error fetching available slots:", err);
        return res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

// Memproses pesanan baru
router.post('/order', isAuthenticated, async (req, res) => {
    const { service_type, order_type, order_date, order_time, barber_id, address } = req.body;
    const { name: customer_name, whatsapp: customer_whatsapp } = req.session.user; // Ambil nama & no WA dari sesi

    // Validasi input dasar
    if (!service_type || !order_type || !order_date || !order_time || !barber_id) {
        try {
            const barbersResult = await db.query("SELECT * FROM barbers");
            res.render('index', { barbers: barbersResult.rows, services, user: req.session.user, error: 'Semua field wajib diisi.', success: null, activePage: 'booking' });
        } catch (dbErr) {
            res.status(500).send("Terjadi kesalahan.");
        }
        return;
    }

    const orderStartTime = parseISO(`${order_date}T${order_time}:00`);
    const duration = order_type === 'home-service' ? DURATION_HOME_SERVICE : DURATION_IN_SHOP;
    const orderEndTime = addMinutes(orderStartTime, duration);

    try {
        // Cek ulang ketersediaan untuk mencegah race condition
        const checkSql = `SELECT order_start_time, order_end_time FROM orders WHERE barber_id = $1 AND order_start_time BETWEEN $2 AND $3`;
        const startOfSelectedDay = startOfDay(orderStartTime);
        const endOfSelectedDay = endOfDay(orderStartTime);
        
        const existingOrdersResult = await db.query(checkSql, [barber_id, startOfSelectedDay.toISOString(), endOfSelectedDay.toISOString()]);
        const existingOrders = existingOrdersResult.rows;

        const isOverlapping = existingOrders.some(order =>
            areIntervalsOverlapping(
                { start: orderStartTime, end: orderEndTime },
                { start: parseISO(order.order_start_time), end: parseISO(order.order_end_time) },
                { inclusive: false }
            )
        );

        if (isOverlapping) {
            const barbersResult = await db.query("SELECT * FROM barbers");
            return res.render('index', { 
                barbers: barbersResult.rows, 
                services, 
                user: req.session.user, 
                error: 'Maaf, slot waktu yang Anda pilih sudah tidak tersedia. Silakan pilih waktu lain.', 
                success: null,
                activePage: 'booking'
            });
        }

        // Jika tidak ada konflik, masukkan pesanan baru
        const insertSql = `INSERT INTO orders (customer_name, customer_whatsapp, service_type, order_type, order_start_time, order_end_time, barber_id, address) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`;
        const params = [customer_name, customer_whatsapp, service_type, order_type, orderStartTime.toISOString(), orderEndTime.toISOString(), barber_id, address || null];

        // Reset kuota chat AI pengguna setelah booking berhasil
        const resetQuotaSql = `UPDATE users SET ai_chat_quota = 5 WHERE whatsapp_number = $1 AND ai_subscription_status = 'inactive'`;
        await db.query(resetQuotaSql, [customer_whatsapp]);
        console.log(`AI chat quota has been reset for user ${customer_whatsapp}.`);

        await db.query(insertSql, params);

        // Kirim notifikasi ke tukang cukur
        const barberResult = await db.query("SELECT * FROM barbers WHERE id = $1", [barber_id]);
        const barber = barberResult.rows[0];

        if (barber) {
            const orderDetails = {
                customer_name,
                customer_whatsapp,
                service_type,
                order_type,
                order_start_time: orderStartTime,
                address
            };
            await sendNewOrderNotification(barber, orderDetails);
        }

        res.redirect('/success');
    } catch (err) {
        console.error("Order creation error:", err);
        try {
            const barbersResult = await db.query("SELECT * FROM barbers");
            res.render('index', { 
                barbers: barbersResult.rows, 
                services, 
                user: req.session.user, 
                error: 'Gagal membuat pesanan karena kesalahan server.', 
                success: null,
                activePage: 'booking'
            });
        } catch (dbErr) {
            res.status(500).send("Terjadi kesalahan.");
        }
    }
});


// Halaman sukses setelah memesan
router.get('/success', isAuthenticated, (req, res) => {
    res.render('success');
});

// Halaman ketika pembayaran belum selesai (Unfinish)
router.get('/payment-unfinish', isAuthenticated, (req, res) => {
    res.render('payment-unfinish', { user: req.session.user });
});

// Halaman ketika pembayaran error
router.get('/payment-error', isAuthenticated, (req, res) => {
    res.render('payment-error', { user: req.session.user });
});

// Halaman AI Stylist
router.get('/ai-stylist', isAuthenticated, (req, res) => {
    res.render('ai-chat', { 
        user: req.session.user, 
        activePage: 'ai-stylist',
        midtransClientKey: process.env.MIDTRANS_CLIENT_KEY // Kirim client key ke frontend
    });
});

// API endpoint untuk chat
router.post('/api/chat', isAuthenticated, upload.single('faceImage'), async (req, res) => {    
    const { message } = req.body;
    const imageFile = req.file; // File yang diunggah tersedia di req.file
    const userWhatsapp = req.session.user.whatsapp;

    if (!message && !imageFile) { 
        return res.status(400).json({ error: 'Tidak ada pesan atau gambar yang dikirim.' });
    }

    try {
        // 1. Cek status langganan dan kuota pengguna
        const userResult = await db.query(`SELECT ai_chat_quota, ai_subscription_status, ai_subscription_expires_at FROM users WHERE whatsapp_number = $1`, [userWhatsapp]);
        const userData = userResult.rows[0];

        if (!userData) {
            // This handles cases where the user exists in the session but not in the DB
            // Ini menangani kasus di mana pengguna ada di sesi tetapi tidak di DB
            return res.status(404).json({ error: "Data pengguna tidak ditemukan. Silakan coba login kembali." });
        }

        const isSubscribed = userData.ai_subscription_status === 'active' && new Date(userData.ai_subscription_expires_at) > new Date();

        if (!isSubscribed && userData.ai_chat_quota <= 0) {
            return res.status(403).json({ 
                error: "Kuota chat AI Anda telah habis.",
                reason: "QUOTA_EXCEEDED"
            });
        }

        // Panggil service AI yang sudah dimodularkan
        const aiResponse = await getAiStylistResponse(message, imageFile, isSubscribed);

        // 2. Jika tidak berlangganan, kurangi kuota
        if (!isSubscribed) {
            await db.query(`UPDATE users SET ai_chat_quota = ai_chat_quota - 1 WHERE whatsapp_number = $1`, [userWhatsapp]);
        }

        res.json({ reply: aiResponse });
    } catch (error) {
        console.error("Error calling Gemini API:", error);
        res.status(500).json({ error: "Maaf, AI Stylist sedang sibuk. Coba lagi beberapa saat." });
    }
});

// API endpoint untuk mendapatkan info pengguna (termasuk kuota)
router.get('/api/user-info', isAuthenticated, async (req, res) => {
    try {
        const userResult = await db.query(`SELECT name, username, whatsapp_number, ai_chat_quota, ai_subscription_status, ai_subscription_expires_at FROM users WHERE whatsapp_number = $1`, [req.session.user.whatsapp]);
        const userInfo = userResult.rows[0];
        if (!userInfo) {
            // Handles cases where user in session doesn't exist in DB.
            return res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
        }
        res.json(userInfo);
    } catch (error) {
        console.error("Error in /api/user-info:", error); // Log error spesifik dari database
        res.status(500).json({ error: 'Gagal mengambil data pengguna.' });
    }
});

// API endpoint untuk membuat transaksi langganan
router.post('/api/subscribe', isAuthenticated, async (req, res) => {
    try {
        const transactionToken = await createSubscriptionTransaction(req.session.user);
        res.json({ token: transactionToken });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Halaman Langganan Premium
router.get('/subscribe', isAuthenticated, (req, res) => {
    res.render('subscribe', {
        user: req.session.user,
        activePage: 'ai-stylist', // Agar sidebar tetap menyorot menu AI Stylist
        midtransClientKey: process.env.MIDTRANS_CLIENT_KEY
    });
});

// API endpoint untuk notifikasi Midtrans (webhook)
router.post('/api/midtrans-notification', async (req, res) => {
    try {
        await handleMidtransNotification(req.body);
        res.status(200).send('OK');
    } catch (error) {
        console.error("Midtrans notification error:", error);
        res.status(500).send('Error processing notification');
    }
});

// Halaman Riwayat Pesanan
router.get('/history', isAuthenticated, async (req, res) => {
    const sql = `
        SELECT o.*, b.name as barber_name 
        FROM orders o
        JOIN barbers b ON o.barber_id = b.id
        WHERE o.customer_whatsapp = $1 
        ORDER BY o.order_start_time DESC
    `;
    try {
        const result = await db.query(sql, [req.session.user.whatsapp]);
        const orders = result.rows;
        res.render('history', { user: req.session.user, orders: orders, activePage: 'history' });
    } catch (err) {
        console.error("Failed to fetch order history:", err);
        return res.status(500).send("Gagal mengambil riwayat pesanan.");
    }
});

// Halaman Profil
router.get('/profile', isAuthenticated, async (req, res) => {
    try {
        // Ambil data pengguna terbaru dari database untuk mendapatkan status langganan
        const userResult = await db.query(`SELECT * FROM users WHERE whatsapp_number = $1`, [req.session.user.whatsapp]);
        const userInfo = userResult.rows[0];

        if (!userInfo) {
            return res.redirect('/logout'); // Jika pengguna tidak ditemukan, logout saja
        }

        res.render('profile', { user: userInfo, activePage: 'profile' });
    } catch (error) {
        console.error("Error fetching user profile:", error);
        res.status(500).send("Gagal memuat profil.");
    }
});

// Halaman Tentang Kami
router.get('/about', isAuthenticated, (req, res) => {
    res.render('about', { user: req.session.user, activePage: 'about' });
});

module.exports = router;
