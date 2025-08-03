const midtransClient = require('midtrans-client');
const db = require('../db');

// Inisialisasi Midtrans Snap
const snap = new midtransClient.Snap({
    isProduction: process.env.NODE_ENV === 'production',
    serverKey: process.env.MIDTRANS_SERVER_KEY,
    clientKey: process.env.MIDTRANS_CLIENT_KEY
});

/**
 * Membuat transaksi langganan AI Stylist di Midtrans.
 * @param {object} user - Objek pengguna dari sesi.
 * @returns {Promise<string>} Token transaksi dari Midtrans.
 */
async function createSubscriptionTransaction(user) {
    const orderId = `SUB-AI-${user.whatsapp}-${Date.now()}`;
    const amount = 50000; // Rp 50.000

    const parameter = {
        transaction_details: {
            order_id: orderId,
            gross_amount: amount
        },
        item_details: [{
            id: 'AI_SUB_1M',
            price: amount,
            quantity: 1,
            name: 'Langganan AI Stylist (1 Bulan)'
        }],
        customer_details: {
            first_name: user.name,
            phone: user.whatsapp
        }
    };

    try {
        const transaction = await snap.createTransaction(parameter);
        const transactionToken = transaction.token;

        // Simpan transaksi ke database dengan status 'pending'
        await db.query(
            `INSERT INTO midtrans_transactions (order_id, user_whatsapp, amount, status, transaction_token) VALUES ($1, $2, $3, 'pending', $4)`,
            [orderId, user.whatsapp, amount, transactionToken]
        );

        return transactionToken;
    } catch (error) {
        console.error("Midtrans transaction creation failed:", error);
        // Lemparkan kembali error asli dari Midtrans agar detailnya tidak hilang.
        // Ini akan memberikan log yang lebih kaya di orderRoutes.js.
        throw error;
    }
}

/**
 * Menangani notifikasi webhook dari Midtrans.
 * @param {object} notificationJson - Body notifikasi dari Midtrans.
 */
async function handleMidtransNotification(notificationJson) {
    const notification = await snap.transaction.notification(notificationJson);
    const order_id = notification.order_id;
    const transaction_status = notification.transaction_status;
    const fraud_status = notification.fraud_status;

    console.log(`Transaction notification received. Order ID: ${order_id}, Status: ${transaction_status}, Fraud Status: ${fraud_status}`);

    // Cari transaksi di database
    const txResult = await db.query(`SELECT * FROM midtrans_transactions WHERE order_id = $1`, [order_id]);
    if (txResult.rows.length === 0) {
        throw new Error(`Transaction with order_id ${order_id} not found.`);
    }
    const userWhatsapp = txResult.rows[0].user_whatsapp;

    if (transaction_status == 'capture' || transaction_status == 'settlement') {
        if (fraud_status == 'accept') {
            // Pembayaran berhasil
            // 1. Update status transaksi di DB
            await db.query(`UPDATE midtrans_transactions SET status = 'success' WHERE order_id = $1`, [order_id]);

            // 2. Update status langganan pengguna
            const expiryDate = new Date();
            expiryDate.setMonth(expiryDate.getMonth() + 1); // Langganan 1 bulan

            await db.query(
                `UPDATE users SET ai_subscription_status = 'active', ai_subscription_expires_at = $1 WHERE whatsapp_number = $2`,
                [expiryDate.toISOString(), userWhatsapp]
            );
            console.log(`Subscription activated for user ${userWhatsapp} until ${expiryDate.toISOString()}`);
        }
    } else if (transaction_status == 'cancel' || transaction_status == 'deny' || transaction_status == 'expire') {
        // Pembayaran gagal
        await db.query(`UPDATE midtrans_transactions SET status = 'failed' WHERE order_id = $1`, [order_id]);
    }
}

module.exports = {
    createSubscriptionTransaction,
    handleMidtransNotification
};
