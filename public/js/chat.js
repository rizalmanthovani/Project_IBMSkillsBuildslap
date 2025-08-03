document.addEventListener('DOMContentLoaded', () => {
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    const chatWindow = document.getElementById('chat-window');
    const uploadBtn = document.getElementById('upload-btn');
    const imageUpload = document.getElementById('image-upload');
    const imagePreviewContainer = document.getElementById('image-preview-container');
    const imagePreview = document.getElementById('image-preview');
    const removeImageBtn = document.getElementById('remove-image-btn');
    const quotaInfo = document.getElementById('quota-info');
    const subscribeCta = document.getElementById('subscribe-cta');
    const subscribeBtn = document.getElementById('subscribe-btn');
    let currentUserInfo = {};

    // Trigger file input ketika tombol paperclip diklik
    uploadBtn.addEventListener('click', () => imageUpload.click());

    // Menangani pemilihan gambar dan menampilkan preview
    imageUpload.addEventListener('change', () => {
        const file = imageUpload.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                imagePreview.src = e.target.result;
                imagePreviewContainer.style.display = 'flex';
            };
            reader.readAsDataURL(file);
        }
    });

    // Menangani penghapusan gambar dari preview
    removeImageBtn.addEventListener('click', () => {
        imageUpload.value = ''; // Mengosongkan input file
        imagePreviewContainer.style.display = 'none';
        imagePreview.src = '#';
    });

    // Fungsi untuk mengambil dan menampilkan info pengguna
    async function fetchUserInfo() {
        try {
            const response = await fetch('/api/user-info');
            currentUserInfo = await response.json();
            
            const isSubscribed = currentUserInfo.ai_subscription_status === 'active' && new Date(currentUserInfo.ai_subscription_expires_at) > new Date();

            if (isSubscribed) {
                quotaInfo.innerHTML = `<i class="bi bi-patch-check-fill text-success me-2"></i> Langganan Aktif`;
            } else {
                quotaInfo.innerHTML = `Sisa Penggunaan: <strong>${currentUserInfo.ai_chat_quota}</strong>`;
                if (currentUserInfo.ai_chat_quota <= 0) {
                    subscribeCta.style.display = 'block';
                }
            }
        } catch (error) {
            console.error('Gagal memuat info pengguna:', error);
        }
    }
    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const userMessage = chatInput.value.trim();
        const imageFile = imageUpload.files[0];

        if (!userMessage && !imageFile) return; // Jangan lakukan apa-apa jika input kosong

        // Gunakan FormData untuk mengirim teks dan file
        const formData = new FormData();
        if (userMessage) formData.append('message', userMessage);
        if (imageFile) formData.append('faceImage', imageFile);

        // Tampilkan pesan dan/atau gambar pengguna di chat window
        if (userMessage) {
            appendMessage(userMessage, 'user');
        }
        if (imageFile) {
            appendImage(imagePreview.src, 'user');
        }

        // Reset input setelah dikirim
        chatInput.value = '';
        imageUpload.value = '';
        imagePreviewContainer.style.display = 'none';
        imagePreview.src = '#';

        // Tampilkan indikator "mengetik"
        const typingIndicator = showTypingIndicator();

        try {
            // Kirim FormData ke backend
            const response = await fetch('/api/chat', {
                method: 'POST',
                body: formData, // Browser akan otomatis mengatur Content-Type ke multipart/form-data
            });

            if (!response.ok) {
                const errorData = await response.json();
                // Tangani error spesifik kuota habis
                if (errorData.reason === 'QUOTA_EXCEEDED') {
                    typingIndicator.remove();
                    appendMessage(errorData.error, 'ai');
                    subscribeCta.style.display = 'block'; // Tampilkan tombol langganan
                    return; // Hentikan proses
                }
                throw new Error(errorData.error || 'Gagal mendapatkan respons dari server.');
            }

            const data = await response.json();

            // Hapus indikator "mengetik" dan tampilkan respons AI
            typingIndicator.remove();
            // Hanya tampilkan pesan jika ada balasan
            if (data.reply) {
                fetchUserInfo(); // Perbarui info kuota setelah berhasil
                appendMessage(data.reply, 'ai');
            }

        } catch (error) {
            console.error('Error:', error);


            typingIndicator.remove();
            appendMessage('Maaf, terjadi kesalahan. Silakan coba lagi nanti.', 'ai');
        }
    });

    // Event listener untuk tombol langganan
    subscribeBtn.addEventListener('click', async () => {
        try {
            const response = await fetch('/api/subscribe', { method: 'POST' });
            const data = await response.json();

            if (data.token) {
                window.snap.pay(data.token, {
                    onSuccess: function(result){
                        alert("Pembayaran berhasil! Halaman akan dimuat ulang.");
                        window.location.reload();
                    },
                    onPending: function(result){
                        alert("Menunggu pembayaran Anda.");
                    },
                    onError: function(result){
                        alert("Pembayaran gagal.");
                    }
                });
            }
        } catch (error) {
            alert('Gagal memulai proses langganan.');
        }
    });

    function appendMessage(message, sender) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('chat-message', `${sender}-message`);
        
        const bubble = document.createElement('div');
        bubble.classList.add('message-bubble');

        if (sender === 'ai') {
            // Cek jika ada placeholder untuk CTA
            if (message.includes('[UPGRADE_CTA]')) {
                const ctaButton = document.createElement('a');
                ctaButton.href = '/subscribe';
                ctaButton.className = 'btn btn-primary btn-sm mt-2 fw-bold';
                ctaButton.textContent = 'Upgrade ke Premium';
                
                const messageText = message.replace('[UPGRADE_CTA]', '');
                bubble.innerHTML = marked.parse(messageText);
                bubble.appendChild(ctaButton);
            } else {
                // Parse respons AI dari Markdown ke HTML agar formatnya bagus
                bubble.innerHTML = marked.parse(message);
            }
        } else {
            // Tampilkan pesan pengguna sebagai teks biasa
            bubble.textContent = message;
        }

        messageElement.appendChild(bubble);
        chatWindow.appendChild(messageElement);
        chatWindow.scrollTop = chatWindow.scrollHeight; // Auto-scroll ke bawah
    }

    // Fungsi baru untuk menampilkan gambar di chat
    function appendImage(src, sender) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('chat-message', `${sender}-message`);
        
        const bubble = document.createElement('div');
        bubble.classList.add('message-bubble', 'image-bubble');
        
        const img = document.createElement('img');
        img.src = src;

        bubble.appendChild(img);
        messageElement.appendChild(bubble);
        chatWindow.appendChild(messageElement);
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }

    function showTypingIndicator() {
        const indicator = document.createElement('div');
        indicator.classList.add('chat-message', 'ai-message');
        indicator.innerHTML = `<div class="message-bubble typing-indicator"><span></span><span></span><span></span></div>`;
        chatWindow.appendChild(indicator);
        chatWindow.scrollTop = chatWindow.scrollHeight;
        return indicator;
    }

    // Muat info pengguna saat halaman pertama kali dibuka
    fetchUserInfo();
});