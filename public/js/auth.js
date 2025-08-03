document.addEventListener('DOMContentLoaded', () => {
    // Temukan semua elemen dengan kelas .toggle-password
    const togglePasswordIcons = document.querySelectorAll('.toggle-password');

    togglePasswordIcons.forEach(iconContainer => {
        iconContainer.addEventListener('click', function () {
            // Temukan input field di dalam grup yang sama
            const passwordInput = this.closest('.input-group').querySelector('input');
            
            // Ganti tipe atribut input
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            
            // Ganti ikon mata
            const eyeIcon = this.querySelector('i');
            eyeIcon.classList.toggle('bi-eye-slash-fill');
            eyeIcon.classList.toggle('bi-eye-fill');
        });
    });
});