document.addEventListener('DOMContentLoaded', () => {
    const subscribeBtn = document.getElementById('subscribe-btn');

    if (subscribeBtn) {
        subscribeBtn.addEventListener('click', async () => {
            try {
                // Tampilkan indikator loading
                subscribeBtn.disabled = true;
                subscribeBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Memproses...';

                const response = await fetch('/api/subscribe', { method: 'POST' });
                const data = await response.json();

                if (data.token) {
                    window.snap.pay(data.token, {
                        onSuccess: function(result){
                            alert("Pembayaran berhasil! Akun Anda telah di-upgrade.");
                            window.location.href = '/ai-stylist'; // Arahkan kembali ke halaman chat
                        },
                        onPending: function(result){
                            alert("Menunggu pembayaran Anda. Status langganan akan diperbarui setelah pembayaran selesai.");
                            subscribeBtn.disabled = false;
                            subscribeBtn.textContent = 'Langganan Sekarang';
                        },
                        onError: function(result){
                            alert("Pembayaran gagal. Silakan coba lagi.");
                            subscribeBtn.disabled = false;
                            subscribeBtn.textContent = 'Langganan Sekarang';
                        },
                        onClose: function(){
                            // Dipanggil saat popup Snap ditutup tanpa menyelesaikan pembayaran
                            console.log('Popup pembayaran ditutup.');
                            subscribeBtn.disabled = false;
                            subscribeBtn.textContent = 'Langganan Sekarang';
                        }
                    });
                } else {
                    throw new Error(data.error || 'Token pembayaran tidak diterima.');
                }
            } catch (error) {
                console.error('Subscription error:', error);
                alert('Gagal memulai proses langganan. Silakan coba lagi.');
                subscribeBtn.disabled = false;
                subscribeBtn.textContent = 'Langganan Sekarang';
            }
        });
    }
});