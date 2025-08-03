document.addEventListener('DOMContentLoaded', function() {
    const orderTypeSelect = document.getElementById('order_type');
    const addressField = document.getElementById('address-field');
    const addressTextarea = document.getElementById('address');

    const dateInput = document.getElementById('order_date');
    const barberSelect = document.getElementById('barber_id');
    const timeSelect = document.getElementById('order_time');

    // Tampilkan/sembunyikan field alamat berdasarkan jenis pesanan
    orderTypeSelect.addEventListener('change', function() {
        if (this.value === 'home-service') {
            addressField.style.display = 'block';
            addressTextarea.required = true;
        } else {
            addressField.style.display = 'none';
            addressTextarea.required = false;
        }
    });

    // Fungsi untuk mengambil slot waktu yang tersedia
    async function fetchAvailableSlots() {
        const date = dateInput.value;
        const barberId = barberSelect.value;

        if (!date || !barberId) {
            timeSelect.innerHTML = '<option>Pilih tanggal dan tukang cukur dulu</option>';
            timeSelect.disabled = true;
            return;
        }

        timeSelect.disabled = true;
        timeSelect.innerHTML = '<option>Memuat slot waktu...</option>';

        try {
            const response = await fetch(`/api/available-slots?date=${date}&barberId=${barberId}`);
            if (!response.ok) {
                throw new Error('Gagal mengambil data slot.');
            }
            const slots = await response.json();

            timeSelect.innerHTML = ''; // Kosongkan pilihan
            if (slots.length > 0) {
                slots.forEach(slot => {
                    const option = document.createElement('option');
                    option.value = slot;
                    option.textContent = slot;
                    timeSelect.appendChild(option);
                });
                timeSelect.disabled = false;
            } else {
                timeSelect.innerHTML = '<option>Tidak ada slot tersedia</option>';
            }
        } catch (error) {
            console.error('Error fetching slots:', error);
            timeSelect.innerHTML = '<option>Gagal memuat slot</option>';
        }
    }

    // Tambahkan event listener ke input tanggal dan pilihan tukang cukur
    dateInput.addEventListener('change', fetchAvailableSlots);
    barberSelect.addEventListener('change', fetchAvailableSlots);
});

