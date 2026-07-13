# Panduan Setup Notifikasi WhatsApp (n8n + Fonnte)

Alur singkatnya: **Aplikasi Absensi → n8n → Fonnte → WhatsApp kamu**

Kamu akan setup 2 layanan gratis (n8n dan Fonnte), sambungkan keduanya, lalu tempel 1 URL ke aplikasi absensi. Total waktu kira-kira 20-30 menit untuk pertama kali.

---

## BAGIAN 1 — Daftar & Setup Fonnte (yang benar-benar kirim WA-nya)

Fonnte itu layanan yang menghubungkan nomor WhatsApp kamu (pakai HP biasa) supaya bisa dikirimi pesan otomatis lewat program/API.

1. Buka **https://fonnte.com** → klik **Daftar/Register**
2. Isi data pendaftaran (email, password) → verifikasi
3. Setelah login, masuk ke menu **Device** → klik **Tambah/Add Device**
4. Akan muncul **QR Code** → buka WhatsApp di HP yang mau dipakai kirim notifikasi (bisa HP admin/toko) → **WhatsApp > Perangkat Tertaut (Linked Devices) > Tautkan Perangkat** → scan QR itu
5. Setelah konek, device kamu akan berstatus **Connected**
6. Masih di menu Device, cari & **copy Token API** (biasanya ada tombol "salin token" di kartu device kamu) — **simpan token ini**, nanti dipakai di n8n

> Token ini seperti password, jangan disebar ke orang lain.

---

## BAGIAN 2 — Setup n8n

Kalau belum pernah pakai n8n, cara paling gampang (tidak perlu install/server) adalah pakai **n8n Cloud**:

1. Buka **https://n8n.io** → klik **Start free trial** / **Get started**
2. Daftar pakai email → ikuti proses setup awal (n8n akan bikinkan workspace otomatis)
3. Setelah masuk, kamu akan lihat halaman kosong untuk bikin **Workflow** baru

> Kalau kamu lebih suka self-host (server sendiri, gratis selamanya tapi perlu maintenance sendiri), itu juga bisa — tapi untuk pemula, n8n Cloud jauh lebih simpel karena tidak perlu urus server.

---

## BAGIAN 3 — Import Workflow & Sambungkan ke Fonnte

1. Di n8n, klik **Workflows** → **Import from File** (atau ikon **...** di pojok kanan atas → Import)
2. Pilih file `n8n-workflow-whatsapp.json` yang saya kasih
3. Workflow akan muncul dengan beberapa kotak (node): **Webhook Absensi**, **Ada No WA Admin?**, **Kirim WA ke Admin**, **Ada No WA Karyawan?**, **Kirim WA ke Karyawan**, **Respond OK**

### Setting node "Kirim WA ke Admin"
1. Klik dua kali kotak **Kirim WA ke Admin**
2. Ganti **URL** jadi: `https://api.fonnte.com/send`
3. Method: pastikan **POST**
4. Di bagian **Headers**, tambah:
   - Name: `Authorization`
   - Value: *(paste token Fonnte kamu dari Bagian 1)*
5. Di bagian **Body**, pastikan tipe **Form-Urlencoded** (bukan JSON), lalu isi 2 parameter:
   - `target` → isi dengan: `{{ $json.body.noWaAdmin }}`
   - `message` → isi dengan: `{{ $json.body.pesanAdmin }}`
6. Klik **Save**

### Setting node "Kirim WA ke Karyawan"
Ulangi persis sama seperti di atas, tapi:
   - `target` → `{{ $json.body.noWaKaryawan }}`
   - `message` → `{{ $json.body.pesanKaryawan }}`

---

## BAGIAN 4 — Aktifkan & Ambil URL Webhook

1. Klik dua kali node **Webhook Absensi** → copy **Production URL**-nya (bukan Test URL)
2. Di kanan atas halaman workflow, geser toggle **Active** jadi ON
3. Simpan workflow (Ctrl+S)

---

## BAGIAN 5 — Sambungkan ke Aplikasi Absensi

1. Buka aplikasi absensi kamu → Login Admin → tab **Notifikasi WhatsApp**
2. Tempel Production URL dari Bagian 4 ke kolom **Webhook URL n8n**
3. Isi **No. WhatsApp Admin** (nomor kamu yang mau terima notifikasi), format `628xxxxxxxxxx` (tanpa tanda + atau spasi)
4. Centang opsi sesuai kebutuhan (kirim ke karyawan juga / cuma saat luar area)
5. Klik **Simpan**
6. Klik **Tes Kirim Notifikasi** — cek WhatsApp nomor admin kamu, harusnya masuk pesan tes dalam beberapa detik

---

## Kalau Tes Gagal — Cara Cek

- **Tidak ada pesan masuk sama sekali** → buka n8n, ke workflow-nya, tab **Executions** (riwayat eksekusi) → lihat apakah ada eksekusi baru masuk waktu kamu klik "Tes Kirim Notifikasi". Kalau tidak ada sama sekali → berarti URL webhook di aplikasi absensi salah/belum ke-save.
- **Ada eksekusi tapi merah/gagal** → klik eksekusi itu, lihat node mana yang error → biasanya di node "Kirim WA ke Admin", errornya akan kasih tahu apa yang salah (token salah, nomor salah, dll)
- **Device Fonnte disconnect** → buka dashboard Fonnte, cek status device, kalau "Disconnected" perlu scan ulang QR (biasanya karena HP dimatikan lama atau logout WhatsApp Web)

---

## Ringkasan Alur Datanya

```
Karyawan absen di aplikasi
        ↓
Code.gs (prosesAbsen) kirim data ke Webhook URL n8n
        ↓
n8n cek: perlu kirim ke admin? / ke karyawan?
        ↓
n8n panggil Fonnte API (https://api.fonnte.com/send)
        ↓
Fonnte kirim pesan lewat WhatsApp yang sudah kamu hubungkan
        ↓
Masuk ke HP admin/karyawan
```
