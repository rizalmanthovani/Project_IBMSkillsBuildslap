require('dotenv').config(); // dotenv akan otomatis mencari .env di direktori atas
const { getPool } = require('../db');

const runMigrations = async () => {
    const pool = await getPool();
    try {
        console.log('Starting database migration...');
        // Gunakan pool secara langsung untuk transaksi agar lebih sederhana
        await pool.query('BEGIN'); // Mulai transaksi

        // Tabel untuk tukang cukur
        await pool.query(`
            CREATE TABLE IF NOT EXISTS barbers (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                whatsapp_number VARCHAR(20) NOT NULL
            )
        `);
        console.log('Table "barbers" created or already exists.');

        // Tabel untuk pesanan
        await pool.query(`
            CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,
                customer_name VARCHAR(255) NOT NULL,
                customer_whatsapp VARCHAR(20) NOT NULL,
                service_type VARCHAR(255) NOT NULL,
                order_type VARCHAR(50) NOT NULL, -- 'in-shop' atau 'home-service'
                order_start_time TIMESTAMPTZ NOT NULL,
                order_end_time TIMESTAMPTZ NOT NULL,
                barber_id INTEGER NOT NULL,
                address TEXT, -- Opsional, untuk home service
                FOREIGN KEY (barber_id) REFERENCES barbers (id)
            )
        `);
        console.log('Table "orders" created or already exists.');

        // Tabel untuk menyimpan permintaan OTP
        await pool.query(`
            CREATE TABLE IF NOT EXISTS otp_requests (
                whatsapp_number VARCHAR(20) PRIMARY KEY,
                otp_code VARCHAR(10) NOT NULL,
                expires_at TIMESTAMPTZ NOT NULL,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('Table "otp_requests" created or already exists.');

        // Tabel untuk menyimpan data pengguna
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                username VARCHAR(255) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                password TEXT NOT NULL,
                whatsapp_number VARCHAR(20) NOT NULL UNIQUE,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                ai_chat_quota INTEGER NOT NULL DEFAULT 5,
                ai_subscription_status VARCHAR(20) NOT NULL DEFAULT 'inactive', -- 'inactive', 'active'
                ai_subscription_expires_at TIMESTAMPTZ
            )
        `);
        console.log('Table "users" created or already exists.');

        // Tabel untuk menyimpan transaksi Midtrans
        await pool.query(`
            CREATE TABLE IF NOT EXISTS midtrans_transactions (
                order_id VARCHAR(255) PRIMARY KEY,
                user_whatsapp VARCHAR(20) NOT NULL,
                amount INTEGER NOT NULL,
                status VARCHAR(50) NOT NULL, -- 'pending', 'success', 'failed'
                transaction_token TEXT,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('Table "midtrans_transactions" created or already exists.');

        // Contoh data tukang cukur (bisa ditambahkan sesuai kebutuhan)
        await pool.query(`INSERT INTO barbers (id, name, whatsapp_number) VALUES (1, 'Agus', '6281234567890') ON CONFLICT (id) DO NOTHING`);
        await pool.query(`INSERT INTO barbers (id, name, whatsapp_number) VALUES (2, 'Budi', '6281234567891') ON CONFLICT (id) DO NOTHING`);
        console.log('Initial data for "barbers" seeded.');

        await pool.query('COMMIT'); // Selesaikan transaksi
        console.log('Database migration completed successfully.');
    } catch (err) {
        // Jika terjadi error, rollback transaksi
        await pool.query('ROLLBACK');
        console.error('Error during database migration:', err);
        process.exit(1);
    } finally {
        // Tutup pool setelah selesai. Ini aman karena skrip migrasi adalah proses yang berdiri sendiri.
        // Untuk aplikasi utama, Anda tidak akan memanggil pool.end() sampai aplikasi benar-benar berhenti.
        await pool.end();
    }
};

runMigrations();
