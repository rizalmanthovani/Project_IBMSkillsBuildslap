require('dotenv').config();
const { getPool } = require('../db');
const readline = require('readline');

// Fungsi untuk meminta konfirmasi dari pengguna di terminal
const askConfirmation = (question) => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise(resolve => rl.question(question, ans => {
        rl.close();
        resolve(ans);
    }));
};

const resetDatabase = async () => {
    console.log('\n\x1b[31m%s\x1b[0m', '=================================================================');
    console.log('\x1b[31m%s\x1b[0m', 'PERINGATAN: Operasi ini akan MENGHAPUS SEMUA TABEL DAN DATA.');
    console.log('\x1b[31m%s\x1b[0m', 'Tindakan ini tidak dapat diurungkan.');
    console.log('\x1b[31m%s\x1b[0m', '=================================================================\n');

    const confirmation = await askConfirmation('Ketik "YA" untuk melanjutkan: ');

    if (confirmation !== 'YA') {
        console.log('Operasi dibatalkan.');
        process.exit(0);
    }

    const pool = await getPool();
    try {
        console.log('Memulai proses reset database...');
        await pool.query('BEGIN');

        // Daftar tabel yang akan dihapus.
        const tables = ['midtrans_transactions', 'orders', 'otp_requests', 'users', 'barbers'];

        for (const table of tables) {
            console.log(`Menghapus tabel "${table}"...`);
            // DROP TABLE IF EXISTS akan mencegah error jika tabel tidak ada
            // CASCADE akan otomatis menghapus semua objek yang bergantung (seperti foreign keys)
            await pool.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
        }

        await pool.query('COMMIT');
        console.log('\n\x1b[32m%s\x1b[0m', 'Database berhasil di-reset. Semua tabel telah dihapus.');
        console.log('Jalankan "npm run migrate" untuk membuat ulang skema database.');

    } catch (err) {
        await pool.query('ROLLBACK');
        console.error('Error saat reset database:', err);
        process.exit(1);
    } finally {
        await pool.end();
    }
};

resetDatabase();