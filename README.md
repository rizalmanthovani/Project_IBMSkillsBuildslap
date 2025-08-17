# BarberLux: Aplikasi Booking Barbershop Modern dengan AI Stylist

**Url Web:** [johncukurship.online]


Ini adalah proyek website pertama saya, sebuah perjalanan belajar yang dimulai pada Februari 2025. BarberLux adalah aplikasi web fungsional yang dibangun dengan Node.js dan Express, dirancang untuk memodernisasi pengalaman booking di barbershop. Proyek ini mengintegrasikan berbagai teknologi modern, termasuk database PostgreSQL di Google Cloud SQL, API pembayaran Midtrans, dan fitur inovatif "AI Stylist" yang didukung oleh Google Gemini. Aplikasi ini dideploy di Google Compute Engine (GCE).

## Fitur Utama

*   **Sistem Autentikasi Lengkap**: Alur registrasi, login, dan manajemen sesi yang aman menggunakan `bcrypt` untuk hashing password dan `express-session`.
*   **Verifikasi & Reset Password via OTP WhatsApp**: Proses registrasi dan lupa password yang aman dengan verifikasi OTP yang dikirimkan melalui `whatsapp-web.js`.
*   **Sistem Booking Online Dinamis**: Pengguna dapat memilih layanan, kapster, dan jadwal. Slot waktu yang ditampilkan bersifat *real-time*, hanya menampilkan jam yang benar-benar tersedia untuk mencegah *double-booking*.
*   **AI Stylist (Google Gemini)**: Fitur konsultasi gaya rambut dengan AI.
    *   Mampu memberikan rekomendasi berdasarkan deskripsi teks.
    *   Mendukung **analisis foto wajah** yang diunggah pengguna untuk rekomendasi yang lebih personal.
    *   Menggunakan *prompt* yang berbeda untuk pengguna gratis (terbatas pada topik rambut) dan premium (bisa bertanya topik apa pun).
*   **Sistem Kuota & Langganan Premium**:
    *   Pengguna gratis mendapatkan 5 kuota chat yang akan **di-reset setiap kali berhasil melakukan booking**.
    *   Pengguna dapat berlangganan untuk mendapatkan akses chat tanpa batas.
*   **Integrasi Pembayaran (Midtrans)**: Proses pembayaran langganan yang mulus dan aman menggunakan Midtrans Snap.
*   **Aktivasi Langganan via Webhook**: Notifikasi dari Midtrans (webhook) secara otomatis mengupdate status langganan pengguna di database, memberikan akses premium secara instan setelah pembayaran berhasil.
*   **Manajemen Akun**: Pengguna dapat melihat detail profil, status langganan, dan riwayat semua pesanan mereka.

## Tumpukan Teknologi (Technology Stack)

*   **Backend**: Node.js, Express.js
*   **Frontend**: EJS (Embedded JavaScript templates), HTML5, CSS3, JavaScript (ES6+)
*   **Database**: PostgreSQL
*   **Platform & Deployment**:
    *   **Hosting**: Google Compute Engine (GCE)
    *   **Managed Database**: Google Cloud SQL
    *   **Koneksi Database**: `@google-cloud/cloud-sql-connector` untuk koneksi yang aman dan terotentikasi.
*   **API & Layanan Eksternal**:
    *   Google Gemini API (untuk AI Stylist)
    *   Midtrans (untuk gerbang pembayaran)
    *   WhatsApp (via `whatsapp-web.js` untuk notifikasi OTP & pesanan)

## Arsitektur & Alur Kerja

1.  **Alur Registrasi & Booking**: Pengguna mendaftar -> Menerima OTP di WhatsApp -> Verifikasi -> Login -> Melakukan booking -> Kuota AI direset.
2.  **Alur Langganan AI**: Kuota AI pengguna habis -> Pengguna memilih untuk berlangganan -> Dialihkan ke Midtrans Snap untuk pembayaran -> Midtrans mengirim notifikasi webhook ke API backend -> Backend memverifikasi notifikasi dan mengaktifkan status premium pengguna di database.

### Sebuah Kolaborasi dengan Asisten AI

Proyek ini bukan hanya tentang kode, tetapi juga tentang bagaimana memanfaatkan alat bantu AI modern untuk mempercepat pembelajaran dan pengembangan. Perjalanan ini merupakan kolaborasi antara saya dan asisten AI utama, masing-masing dengan perannya:

1.  **IBM Granite (Arsitek Konseptual)**: Pada tahap awal, saya mencoba menggunakan IBM GRANITE Instance tetapi karena prompt yang terlalu panjang maka saya gagal memanfaatkan IBM Granite untuk membuat arsitektur konseptual. Namun saya paham tentang penggunaan IBM Granite Instance dengan bekerja sama menggunakan Replicate dan juga google collab. 

2.  **GitHub Copilot (Rekan Coding Harian)**: Copilot menjadi asisten yang selalu siap sedia di dalam VS Code, mempercepat proses coding dengan melengkapi fungsi, memperbaiki sintaks minor, dan mengurangi pengetikan berulang.

3.  **Gemini Code Assist (Problem Solver & Mentor)**: Gemini berperan sebagai mentor strategis untuk memecahkan masalah-masalah kompleks. Ketika saya menghadapi kebuntuan, Gemini tidak hanya memberikan solusi, tetapi juga penjelasan mendalam tentang "mengapa" solusi itu berhasil, yang sangat krusial untuk pembelajaran.

### Tantangan Teknis dan Solusi Bersama

*   **Tantangan: Koneksi Database ke Google Cloud SQL**
    *   **Masalah**: Awalnya, saya terus-menerus menghadapi error `password authentication failed` dan `The server does not support SSL connections` meskipun kredensial sudah benar.
    *   **Solusi**: Dengan bantuan Gemini Code Assist, masalah dipecahkan dengan beralih dari koneksi TCP standar ke metode yang direkomendasikan Google, yaitu menggunakan library `@google-cloud/cloud-sql-connector`. Library ini secara otomatis menangani otentikasi IAM dan koneksi aman (SSL/TLS) tanpa perlu konfigurasi manual yang rumit.

*   **Tantangan: Penggunaan API Whastapp untuk Notifikasi**
    *   **Masalah**: API resmi WhatsApp (Meta, Twilio, Vonage) memerlukan verifikasi bisnis yang tidak memungkinkan untuk proyek personal.
    *   **Solusi**: Sebagai alternatif untuk tujuan demonstrasi, saya mengimplementasikan `whatsapp-web.js`. Library ini mengotomatiskan WhatsApp Web dalam mode *headless*, memungkinkan pengiriman notifikasi OTP dan pesanan dari nomor pribadi. Ini adalah solusi kreatif untuk mengatasi batasan API resmi dalam konteks proyek pengembangan.

*   **Tantangan: Mendeploy web ke Google Cloud Platform**
    *   **Masalah**: Deployment ke platform *serverless* seperti App Engine dan Cloud Run gagal karena `whatsapp-web.js` memerlukan proses *long-running* dan sesi browser Puppeteer yang tidak cocok dengan lingkungan tersebut.
    *   **Solusi**: Migrasi ke **Google Compute Engine (GCE)**. Dengan GCE, saya memiliki kontrol penuh atas Virtual Machine, memungkinkan instalasi environment yang dibutuhkan (termasuk dependensi untuk Puppeteer) dan menjalankan aplikasi sebagai proses Node.js yang persisten. Masalah firewall port juga berhasil diatasi dengan mengkonfigurasi *firewall rules* di GCP.

## Instalasi dan Setup Lokal

1.  **Clone repositori ini:**
    ```bash
    git clone [https://github.com/rizalmanthovani/Project_IBMSkillsBuildslap.git]
    cd Project_IBMSkillsBuildslap
    ```

2.  **Install dependensi:**
    ```bash
    npm install
    ```

3.  **Konfigurasi Environment Variables:**
    *   Buat file `.env` di direktori root.
    *   Isi file `.env` dengan variabel berikut:
    ```dotenv
    # Konfigurasi Database (Google Cloud SQL)
    GOOGLE_APPLICATION_CREDENTIALS="./NAME_GOOGLE_CLOUD_CREDENTIAL_KAMU.json"
    INSTANCE_CONNECTION_NAME="project:region:instance"
    DB_USER="your-db-user"
    DB_PASSWORD="your-db-password"
    DB_NAME="your-db-name"
    
    # Path ke file kredensial Google Cloud (untuk otentikasi lokal)
    # Download file JSON ini dari IAM & Admin -> Service Accounts di GCP
    GOOGLE_APPLICATION_CREDENTIALS="C:/path/to/your/gcp-credentials.json"
    
    # Kunci Rahasia Sesi
    SESSION_SECRET="your-super-secret-session-key"
    
    # Kunci API
    GEMINI_API_KEY="your-gemini-api-key"
    MIDTRANS_SERVER_KEY="your-midtrans-server-key"
    MIDTRANS_CLIENT_KEY="your-midtrans-client-key"
    ```

4.  **Otentikasi Google Cloud (Lokal):**
    Pastikan Anda telah menginstal Google Cloud CLI dan menjalankan perintah berikut di terminal Anda:
    ```bash
    gcloud auth application-default login
    ```

5.  **Jalankan Migrasi Database:**
    Pastikan instance Cloud SQL Anda berjalan. Skrip ini akan membuat semua tabel yang diperlukan.
    ```bash
    npm run migrate
    ```

6.  **Jalankan Server:**
    ```bash
    npm run dev
    ```
    Aplikasi akan berjalan di `http://localhost:8080`. Anda akan diminta untuk memindai kode QR WhatsApp di terminal pada saat pertama kali menjalankan.

### Skrip Lainnya

*   **Reset Database**: Untuk menghapus semua tabel dan data (hati-hati!).
    ```bash
    npm run reset-db
    ```
### Jika memakai IP external maka pembayaran belum bisa integrasi dengan baik 








