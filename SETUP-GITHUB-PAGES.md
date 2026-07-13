# Setup GitHub Pages (Frontend) + Apps Script (Backend API)

Tujuan: halaman absensi dibuka dari domain GitHub Pages (bukan script.google.com), supaya kamera & GPS tidak lagi diblokir iframe milik Apps Script. Apps Script sekarang HANYA berfungsi sebagai API (nyimpen data ke Sheet), bukan lagi yang menyajikan halamannya.

## Bagian 1 — Pastikan Apps Script (backend) sudah siap

1. Buka Apps Script editor project kamu (yang sudah ada dari sebelumnya)
2. Pastikan `Code.gs` sudah versi terbaru (ada fungsi `doPost` yang jadi API dispatcher)
3. **Deploy ulang seperti biasa** (Deploy > Manage deployments > pensil > New version > Deploy)
4. Copy URL Web App-nya (format: `https://script.google.com/macros/s/XXXXXXXXXXXX/exec`) — ini akan dipakai di Bagian 2

> Catatan: doGet (untuk buka lewat browser langsung) masih tetap ada dan tetap berfungsi seperti biasa sebagai cadangan/akses admin darurat. Yang berubah cuma: sekarang ada juga `doPost` yang berfungsi sebagai API murni, dipanggil dari halaman GitHub Pages.

## Bagian 2 — Setup GitHub Pages (frontend)

### Kalau belum punya akun GitHub
1. Daftar gratis di https://github.com/signup

### Buat repository baru
1. Klik ikon **+** di kanan atas → **New repository**
2. Nama repo bebas, misal `absensi-karyawan`
3. Set **Public** (wajib untuk GitHub Pages gratis)
4. Centang **Add a README file**
5. Klik **Create repository**

### Upload file index.html
1. Di halaman repo, klik **Add file > Upload files**
2. Upload file `index.html` dari folder `github-pages/` yang saya kasih
3. **Sebelum upload**, buka dulu file itu dengan text editor, cari baris ini di bagian `<script>`:
   ```js
   const SCRIPT_URL = 'GANTI_DENGAN_URL_WEB_APP_APPS_SCRIPT_KAMU';
   ```
   Ganti jadi URL deployment Apps Script kamu dari Bagian 1, misal:
   ```js
   const SCRIPT_URL = 'https://script.google.com/macros/s/XXXXXXXXXXXX/exec';
   ```
4. Commit langsung ke branch `main`

### Aktifkan GitHub Pages
1. Di repo, buka tab **Settings**
2. Menu kiri, klik **Pages**
3. Di bagian **Build and deployment > Source**, pilih **Deploy from a branch**
4. Branch: pilih **main**, folder: **/ (root)** → **Save**
5. Tunggu 1-2 menit, refresh halaman itu — akan muncul URL publik seperti:
   ```
   https://namakamu.github.io/absensi-karyawan/
   ```

### Tes
1. Buka URL GitHub Pages itu di iPhone
2. Login karyawan → coba GPS dan kamera
3. Seharusnya sekarang browser minta izin kamera/lokasi seperti website biasa (tanpa error "Origin does not have permission")

## Kalau ada perubahan kode di masa depan

- **Ubah tampilan/logika frontend** (form, tombol, dll) → edit `index.html` di GitHub, commit — GitHub Pages otomatis update dalam 1-2 menit, tidak perlu redeploy apapun
- **Ubah logika backend** (Code.gs, misal tambah fitur baru) → edit di Apps Script editor seperti biasa, lalu **Deploy > Manage deployments > New version > Deploy**. URL-nya (SCRIPT_URL) tidak berubah, jadi tidak perlu update index.html lagi kecuali kamu memang bikin deployment baru dari nol

## Kalau nanti mau custom domain (opsional)
GitHub Pages support custom domain gratis (misal absensi.tokokamu.com) lewat menu Settings > Pages > Custom domain — tapi ini opsional, URL `github.io` bawaan sudah cukup untuk internal tool.
