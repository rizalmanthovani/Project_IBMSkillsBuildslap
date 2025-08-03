const { Pool } = require('pg');
const { Connector } = require('@google-cloud/cloud-sql-connector');

// Inisialisasi connector
const connector = new Connector();

// Variabel untuk menyimpan konfigurasi pool agar bisa diinisialisasi secara lazy
let pool;

async function getPool() {
    if (pool) return pool;

    const clientOpts = await connector.getOptions({
        instanceConnectionName: process.env.INSTANCE_CONNECTION_NAME,
        ipType: 'PUBLIC', // atau 'PRIVATE' jika aplikasi berjalan di VPC yang sama
    });

    pool = new Pool({ ...clientOpts, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, max: 5 });
    return pool;
}

const initializeDatabase = async () => {
    try {
        // Cukup coba lakukan query sederhana untuk memastikan koneksi berhasil
        const dbPool = await getPool();
        await dbPool.query('SELECT NOW()');
        console.log('PostgreSQL database connection successful.');
    } catch (err) {
        console.error('Error connecting to the database:', err);
        throw err; // Lemparkan error agar bisa ditangkap oleh server.js
    }
};

module.exports = {
    query: async (text, params) => {
        const dbPool = await getPool();
        return dbPool.query(text, params);
    },
    initializeDatabase,
    // Ekspor fungsi getPool agar bisa digunakan di skrip migrasi
    getPool
};
