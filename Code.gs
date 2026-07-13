/**
 * =========================================================
 * APLIKASI ABSENSI KARYAWAN - GOOGLE APPS SCRIPT
 * =========================================================
 * Struktur data disimpan di Google Spreadsheet ini sendiri
 * (bukan spreadsheet terpisah), dengan sheet:
 *  - Karyawan   : master data karyawan
 *  - Absensi    : log absen masuk/pulang
 *  - Setting    : titik koordinat kantor, radius, password admin
 *
 * CARA SETUP (lihat juga README.md):
 * 1. Buat Google Spreadsheet baru.
 * 2. Extensions > Apps Script, hapus isi default.
 * 3. Buat file Code.gs, Absen.html, Admin.html, Login.html,
 *    lalu copy isi masing-masing dari paket ini.
 * 4. Jalankan fungsi setupSheets() sekali (pilih dari dropdown
 *    function lalu klik Run) untuk membuat sheet & header otomatis.
 * 5. Deploy > New deployment > Web app.
 *    - Execute as: Me
 *    - Who has access: Anyone (atau "Anyone within organization")
 * 6. Buka URL web app di HP karyawan.
 * =========================================================
 */

const SHEET_KARYAWAN = 'Karyawan';
const SHEET_ABSENSI = 'Absensi';
const SHEET_SETTING = 'Setting';
const SHEET_JABATAN = 'Jabatan';
const FOLDER_NAME_FOTO_ABSEN = 'Foto_Absen_Karyawan';
const FOLDER_NAME_FOTO_KTP = 'Foto_KTP_Karyawan';

// ================== ROUTING WEB APP ==================

function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Absensi Karyawan')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * API dispatcher. Halaman (Index.html) memanggil fungsi-fungsi Code.gs lewat
 * fetch() POST ke URL web app ini sendiri, dengan body JSON: { action: '...', ... }
 * Ini menggantikan google.script.run yang hanya bisa dipakai di dalam iframe HtmlService.
 */
function doPost(e) {
  let result;
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;

    switch (action) {
      case 'loginKaryawan':
        result = loginKaryawan(body.idKaryawan, body.pin);
        break;
      case 'prosesAbsen':
        result = prosesAbsen(body.payload);
        break;
      case 'loginAdmin':
        result = loginAdmin(body.password);
        break;
      case 'getAllKaryawan':
        result = getAllKaryawan();
        break;
      case 'tambahKaryawan':
        result = tambahKaryawan(body.payload);
        break;
      case 'ubahStatusKaryawan':
        result = ubahStatusKaryawan(body.idKaryawan, body.statusBaru);
        break;
      case 'getRekapAbsensi':
        result = getRekapAbsensi(body.filter);
        break;
      case 'getSettingKantor':
        result = getSettingKantor();
        break;
      case 'updateSettingKantor':
        result = updateSettingKantor(body.lat, body.lng, body.radius);
        break;
      case 'getSettingNotifikasi':
        result = getSettingNotifikasi();
        break;
      case 'updateSettingNotifikasi':
        result = updateSettingNotifikasi(body.webhookUrl, body.noWaAdmin, body.notifKeKaryawan, body.notifHanyaLuarArea);
        break;
      case 'tesNotifikasiWA':
        result = tesNotifikasiWA();
        break;
      case 'getBiodataKaryawan':
        result = getBiodataKaryawan(body.idKaryawan);
        break;
      case 'updateBiodataKaryawan':
        result = updateBiodataKaryawan(body.idKaryawan, body.payload);
        break;
      case 'bukaKunciBiodata':
        result = bukaKunciBiodata(body.idKaryawan);
        break;
      case 'getDaftarJabatan':
        result = getDaftarJabatan();
        break;
      case 'tambahJabatan':
        result = tambahJabatan(body.nama);
        break;
      case 'hapusJabatan':
        result = hapusJabatan(body.nama);
        break;
      default:
        result = { success: false, message: 'Aksi tidak dikenali: ' + action };
    }
  } catch (err) {
    result = { success: false, message: 'Server error: ' + err.message };
  }

  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * FUNGSI DEBUG SEMENTARA - jalankan ini dari Apps Script editor
 * (pilih dari dropdown function, klik Run) untuk cek apakah
 * file Admin.html bisa di-render tanpa error.
 * Setelah masalah selesai, fungsi ini boleh dihapus.
 */
function debugAdminPage() {
  try {
    const html = HtmlService.createTemplateFromFile('Index').evaluate().getContent();
    Logger.log('BERHASIL. Panjang HTML: ' + html.length + ' karakter.');
  } catch (err) {
    Logger.log('GAGAL: ' + err.message);
  }
}

/**
 * Tes doPost secara manual dari editor (opsional, untuk debug).
 */
function debugDoPost() {
  const fakeEvent = {
    postData: { contents: JSON.stringify({ action: 'getSettingKantor' }) }
  };
  const res = doPost(fakeEvent);
  Logger.log(res.getContent());
}

/**
 * Jalankan ini dari Apps Script editor untuk cek kenapa dropdown Jabatan kosong.
 */
function debugJabatan() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const semuaSheet = ss.getSheets().map(s => s.getName());
    Logger.log('Daftar semua sheet yang ada: ' + JSON.stringify(semuaSheet));

    const sh = ss.getSheetByName(SHEET_JABATAN);
    if (!sh) {
      Logger.log('GAGAL: sheet "' + SHEET_JABATAN + '" TIDAK DITEMUKAN. Cek nama sheet kamu persis sama (huruf besar/kecil, tanpa spasi tambahan).');
      return;
    }

    const data = sh.getDataRange().getValues();
    Logger.log('Sheet Jabatan ditemukan. Isi datanya: ' + JSON.stringify(data));

    const daftar = getDaftarJabatan();
    Logger.log('Hasil getDaftarJabatan(): ' + JSON.stringify(daftar));
  } catch (err) {
    Logger.log('ERROR: ' + err.message);
  }
}

// ================== SETUP AWAL (jalankan manual sekali) ==================

function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Sheet Karyawan
  let shK = ss.getSheetByName(SHEET_KARYAWAN);
  if (!shK) shK = ss.insertSheet(SHEET_KARYAWAN);
  shK.clear();
  shK.appendRow([
    'ID_Karyawan', 'Nama', 'NIK_KTP', 'Foto_KTP_URL', 'Alamat',
    'No_HP', 'Jabatan', 'Tanggal_Bergabung', 'Status_Aktif', 'PIN', 'Biodata_Terkunci'
  ]);
  shK.setFrozenRows(1);

  // Sheet Absensi
  let shA = ss.getSheetByName(SHEET_ABSENSI);
  if (!shA) shA = ss.insertSheet(SHEET_ABSENSI);
  shA.clear();
  shA.appendRow([
    'Timestamp', 'ID_Karyawan', 'Nama', 'Jenis', 'Latitude', 'Longitude',
    'Jarak_meter', 'Status_Lokasi', 'Foto_Absen_URL'
  ]);
  shA.setFrozenRows(1);

  // Sheet Setting
  let shS = ss.getSheetByName(SHEET_SETTING);
  if (!shS) shS = ss.insertSheet(SHEET_SETTING);
  shS.clear();
  shS.appendRow(['Key', 'Value']);
  shS.appendRow(['Latitude_Kantor', '-6.200000']);
  shS.appendRow(['Longitude_Kantor', '106.816666']);
  shS.appendRow(['Radius_Meter', '150']);
  shS.appendRow(['Admin_Password', 'ubahpassword123']);
  shS.appendRow(['N8N_Webhook_URL', 'https://your-n8n-domain/webhook/absensi-notif']);
  shS.appendRow(['No_WA_Admin', '628xxxxxxxxxx']);
  shS.appendRow(['Notifikasi_Ke_Karyawan', 'YA']);
  shS.appendRow(['Notifikasi_Hanya_Luar_Area', 'TIDAK']);
  shS.setFrozenRows(1);

  // Sheet Jabatan (master data pilihan jabatan)
  let shJ = ss.getSheetByName(SHEET_JABATAN);
  if (!shJ) shJ = ss.insertSheet(SHEET_JABATAN);
  shJ.clear();
  shJ.appendRow(['Nama_Jabatan']);
  shJ.appendRow(['Kasir']);
  shJ.appendRow(['Pramuniaga']);
  shJ.appendRow(['Supervisor']);
  shJ.appendRow(['Admin Toko']);
  shJ.appendRow(['Kepala Toko']);
  shJ.setFrozenRows(1);

  SpreadsheetApp.getUi().alert('Setup selesai. Sheet Karyawan, Absensi, dan Setting sudah dibuat. Silakan isi data di sheet Setting sesuai lokasi kantor.');
}

// ================== HELPER ==================

function getSheet_(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function getSettingMap_() {
  const sh = getSheet_(SHEET_SETTING);
  const data = sh.getDataRange().getValues();
  const map = {};
  for (let i = 1; i < data.length; i++) {
    map[data[i][0]] = data[i][1];
  }
  return map;
}

// Haversine formula - jarak dalam meter
function hitungJarak_(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getOrCreateFolder_(name) {
  const folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(name);
}

function getKaryawanById_(idKaryawan) {
  const sh = getSheet_(SHEET_KARYAWAN);
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(idKaryawan).trim()) {
      const tglGabung = data[i][7];
      return {
        idKaryawan: data[i][0],
        nama: data[i][1],
        nikKtp: data[i][2],
        fotoKtpUrl: data[i][3],
        alamat: data[i][4],
        noHp: data[i][5],
        jabatan: data[i][6],
        tanggalGabung: tglGabung ? Utilities.formatDate(new Date(tglGabung), Session.getScriptTimeZone(), 'yyyy-MM-dd') : '',
        statusAktif: data[i][8],
        biodataTerkunci: String(data[i][10]).toUpperCase() === 'YA'
      };
    }
  }
  return null;
}

// ================== MASTER DATA JABATAN ==================

function getDaftarJabatan() {
  const sh = getSheet_(SHEET_JABATAN);
  const data = sh.getDataRange().getValues();
  const result = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) result.push(String(data[i][0]));
  }
  return result;
}

function tambahJabatan(nama) {
  if (!nama || !nama.trim()) return { success: false, message: 'Nama jabatan wajib diisi.' };
  const sh = getSheet_(SHEET_JABATAN);
  const daftar = getDaftarJabatan();
  if (daftar.some(j => j.toLowerCase() === nama.trim().toLowerCase())) {
    return { success: false, message: 'Jabatan itu sudah ada di daftar.' };
  }
  sh.appendRow([nama.trim()]);
  return { success: true, message: 'Jabatan berhasil ditambahkan.' };
}

function hapusJabatan(nama) {
  const sh = getSheet_(SHEET_JABATAN);
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(nama).trim()) {
      sh.deleteRow(i + 1);
      return { success: true, message: 'Jabatan dihapus.' };
    }
  }
  return { success: false, message: 'Jabatan tidak ditemukan.' };
}

/**
 * Kirim data absen ke webhook n8n. n8n yang akan meneruskan pesan
 * ke WhatsApp (lewat bridge whatsapp-web.js kamu atau WhatsApp Cloud API).
 * Dibungkus try/catch supaya kalau n8n sedang down, absen tetap tersimpan
 * dan karyawan tidak terblokir.
 */
function kirimNotifikasiN8n_(data) {
  try {
    const setting = getSettingMap_();
    const webhookUrl = setting['N8N_Webhook_URL'];
    if (!webhookUrl || webhookUrl.indexOf('your-n8n-domain') !== -1) {
      return; // belum dikonfigurasi, lewati diam-diam
    }

    const hanyaLuarArea = String(setting['Notifikasi_Hanya_Luar_Area']).toUpperCase() === 'YA';
    if (hanyaLuarArea && data.statusLokasi !== 'Luar Area') {
      return;
    }

    const notifKeKaryawan = String(setting['Notifikasi_Ke_Karyawan']).toUpperCase() === 'YA';

    const options = {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      payload: JSON.stringify({
        idKaryawan: data.idKaryawan,
        nama: data.nama,
        jenis: data.jenis,
        waktu: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd-MM-yyyy HH:mm:ss'),
        statusLokasi: data.statusLokasi,
        jarak: data.jarak,
        fotoUrl: data.fotoUrl,
        noWaAdmin: setting['No_WA_Admin'],
        noWaKaryawan: notifKeKaryawan ? data.noHp : '',
        pesanAdmin: `📋 *Notifikasi Absensi*\nNama: ${data.nama} (${data.idKaryawan})\nJenis: ${data.jenis}\nWaktu: ${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd-MM-yyyy HH:mm:ss')}\nStatus Lokasi: ${data.statusLokasi} (${data.jarak}m dari kantor)`,
        pesanKaryawan: `Halo ${data.nama}, absen *${data.jenis}* kamu pukul ${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'HH:mm:ss')} sudah tercatat. Status lokasi: ${data.statusLokasi}.`
      })
    };

    UrlFetchApp.fetch(webhookUrl, options);
  } catch (err) {
    // Gagal kirim notifikasi tidak boleh menggagalkan proses absen
    console.error('Gagal kirim notifikasi n8n: ' + err.message);
  }
}

function simpanFotoBase64_(base64Data, folderName, fileNamePrefix) {
  const contentType = base64Data.match(/^data:(.*);base64,/)[1];
  const rawBase64 = base64Data.substring(base64Data.indexOf(',') + 1);
  const bytes = Utilities.base64Decode(rawBase64);
  const ext = contentType.split('/')[1] || 'jpg';
  const blob = Utilities.newBlob(bytes, contentType, `${fileNamePrefix}_${new Date().getTime()}.${ext}`);
  const folder = getOrCreateFolder_(folderName);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

// ================== LOGIN KARYAWAN ==================

/**
 * Login sederhana pakai ID Karyawan + PIN (bukan password kompleks,
 * cukup untuk internal tool). PIN disimpan di kolom PIN sheet Karyawan.
 */
function loginKaryawan(idKaryawan, pin) {
  const sh = getSheet_(SHEET_KARYAWAN);
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[0]).trim() === String(idKaryawan).trim()) {
      if (String(row[8]).toUpperCase() !== 'AKTIF') {
        return { success: false, message: 'Akun karyawan tidak aktif. Hubungi admin.' };
      }
      if (String(row[9]).trim() !== String(pin).trim()) {
        return { success: false, message: 'PIN salah.' };
      }
      return {
        success: true,
        data: {
          idKaryawan: row[0],
          nama: row[1],
          jabatan: row[6]
        }
      };
    }
  }
  return { success: false, message: 'ID Karyawan tidak ditemukan.' };
}

// ================== BIODATA KARYAWAN (edit sekali, lalu terkunci) ==================

function getBiodataKaryawan(idKaryawan) {
  const k = getKaryawanById_(idKaryawan);
  if (!k) return { success: false, message: 'Karyawan tidak ditemukan.' };
  return { success: true, data: k };
}

/**
 * payload = { nama, nikKtp, alamat, noHp, jabatan, statusAktif, tanggalBergabung, fotoKtpBase64 (opsional) }
 * ID Karyawan tidak bisa diubah lewat sini (dikunci di sisi form).
 * Menolak kalau biodata sudah terkunci (sudah pernah di-update sebelumnya).
 * Setelah berhasil, otomatis mengunci supaya tidak bisa diedit lagi
 * sampai admin membuka kuncinya.
 */
function updateBiodataKaryawan(idKaryawan, payload) {
  try {
    const sh = getSheet_(SHEET_KARYAWAN);
    const data = sh.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === String(idKaryawan).trim()) {
        const terkunci = String(data[i][10]).toUpperCase() === 'YA';
        if (terkunci) {
          return { success: false, message: 'Biodata sudah dikonfirmasi dan terkunci. Hubungi admin kalau perlu diubah lagi.' };
        }

        const row = i + 1;
        if (payload.nama) sh.getRange(row, 2).setValue(payload.nama);
        if (payload.nikKtp) sh.getRange(row, 3).setValue(payload.nikKtp);
        if (payload.fotoKtpBase64) {
          const url = simpanFotoBase64_(payload.fotoKtpBase64, FOLDER_NAME_FOTO_KTP, idKaryawan);
          sh.getRange(row, 4).setValue(url);
        }
        if (payload.alamat) sh.getRange(row, 5).setValue(payload.alamat);
        if (payload.noHp) sh.getRange(row, 6).setValue(payload.noHp);
        if (payload.jabatan) sh.getRange(row, 7).setValue(payload.jabatan);
        if (payload.tanggalBergabung) sh.getRange(row, 8).setValue(new Date(payload.tanggalBergabung));
        if (payload.statusAktif) sh.getRange(row, 9).setValue(payload.statusAktif);
        sh.getRange(row, 11).setValue('YA'); // kunci otomatis setelah disimpan

        return { success: true, message: 'Biodata berhasil disimpan. Data sekarang terkunci, hubungi admin kalau perlu diubah lagi.' };
      }
    }
    return { success: false, message: 'Karyawan tidak ditemukan.' };
  } catch (err) {
    return { success: false, message: 'Gagal menyimpan biodata: ' + err.message };
  }
}

/**
 * Dipanggil dari panel Admin untuk membuka kunci biodata karyawan tertentu,
 * supaya karyawan itu bisa update biodatanya lagi.
 */
function bukaKunciBiodata(idKaryawan) {
  const sh = getSheet_(SHEET_KARYAWAN);
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(idKaryawan).trim()) {
      sh.getRange(i + 1, 11).setValue('TIDAK');
      return { success: true, message: 'Kunci biodata dibuka. Karyawan bisa update lagi.' };
    }
  }
  return { success: false, message: 'Karyawan tidak ditemukan.' };
}

// ================== PROSES ABSEN ==================

/**
 * payload = {
 *   idKaryawan, nama, jenis ('Masuk'/'Pulang'),
 *   lat, lng, fotoBase64
 * }
 */
function prosesAbsen(payload) {
  try {
    const setting = getSettingMap_();
    const latKantor = parseFloat(setting['Latitude_Kantor']);
    const lngKantor = parseFloat(setting['Longitude_Kantor']);
    const radius = parseFloat(setting['Radius_Meter']);

    const adaLokasi = payload.lat !== '' && payload.lat !== null && payload.lat !== undefined &&
                       payload.lng !== '' && payload.lng !== null && payload.lng !== undefined;

    let jarak = null;
    let statusLokasi = 'GPS Tidak Tersedia';
    if (adaLokasi) {
      jarak = hitungJarak_(latKantor, lngKantor, parseFloat(payload.lat), parseFloat(payload.lng));
      statusLokasi = jarak <= radius ? 'Dalam Area' : 'Luar Area';
    }

    let fotoUrl = '';
    if (payload.fotoBase64) {
      fotoUrl = simpanFotoBase64_(payload.fotoBase64, FOLDER_NAME_FOTO_ABSEN, payload.idKaryawan);
    }

    const sh = getSheet_(SHEET_ABSENSI);
    sh.appendRow([
      new Date(),
      payload.idKaryawan,
      payload.nama,
      payload.jenis,
      adaLokasi ? payload.lat : '',
      adaLokasi ? payload.lng : '',
      adaLokasi ? Math.round(jarak) : '',
      statusLokasi,
      fotoUrl
    ]);

    const karyawan = getKaryawanById_(payload.idKaryawan);
    kirimNotifikasiN8n_({
      idKaryawan: payload.idKaryawan,
      nama: payload.nama,
      jenis: payload.jenis,
      statusLokasi: statusLokasi,
      jarak: adaLokasi ? Math.round(jarak) : '-',
      fotoUrl: fotoUrl,
      noHp: karyawan ? karyawan.noHp : ''
    });

    return {
      success: true,
      jarak: adaLokasi ? Math.round(jarak) : null,
      statusLokasi: statusLokasi,
      pesan: !adaLokasi
        ? `Absen ${payload.jenis} tercatat TANPA lokasi GPS (perangkat/browser gagal ambil lokasi). Akan direview manual oleh admin.`
        : (statusLokasi === 'Dalam Area'
          ? `Absen ${payload.jenis} berhasil. Jarak ${Math.round(jarak)}m dari kantor.`
          : `Absen ${payload.jenis} tercatat, TAPI kamu berada ${Math.round(jarak)}m dari kantor (di luar radius ${radius}m).`)
    };
  } catch (err) {
    return { success: false, message: 'Gagal menyimpan absen: ' + err.message };
  }
}

// ================== ADMIN: LOGIN & KELOLA KARYAWAN ==================

function loginAdmin(password) {
  const setting = getSettingMap_();
  if (String(password) === String(setting['Admin_Password'])) {
    return { success: true };
  }
  return { success: false, message: 'Password admin salah.' };
}

function getAllKaryawan() {
  const sh = getSheet_(SHEET_KARYAWAN);
  const data = sh.getDataRange().getValues();
  const result = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    result.push({
      idKaryawan: row[0],
      nama: row[1],
      nikKtp: row[2],
      fotoKtpUrl: row[3],
      alamat: row[4],
      noHp: row[5],
      jabatan: row[6],
      tanggalGabung: row[7],
      statusAktif: row[8],
      biodataTerkunci: String(row[10]).toUpperCase() === 'YA'
    });
  }
  return result;
}

/**
 * payload = {
 *   idKaryawan, nama, nikKtp, alamat, noHp, jabatan, pin, fotoKtpBase64
 * }
 */
function tambahKaryawan(payload) {
  try {
    const sh = getSheet_(SHEET_KARYAWAN);
    const data = sh.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === String(payload.idKaryawan).trim()) {
        return { success: false, message: 'ID Karyawan sudah dipakai.' };
      }
    }

    let fotoKtpUrl = '';
    if (payload.fotoKtpBase64) {
      fotoKtpUrl = simpanFotoBase64_(payload.fotoKtpBase64, FOLDER_NAME_FOTO_KTP, payload.idKaryawan);
    }

    sh.appendRow([
      payload.idKaryawan,
      payload.nama,
      payload.nikKtp,
      fotoKtpUrl,
      payload.alamat,
      payload.noHp,
      payload.jabatan,
      payload.tanggalBergabung ? new Date(payload.tanggalBergabung) : new Date(),
      payload.statusAktif || 'AKTIF',
      payload.pin,
      'TIDAK'
    ]);

    return { success: true, message: 'Karyawan berhasil ditambahkan.' };
  } catch (err) {
    return { success: false, message: 'Gagal menambah karyawan: ' + err.message };
  }
}

function ubahStatusKaryawan(idKaryawan, statusBaru) {
  const sh = getSheet_(SHEET_KARYAWAN);
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(idKaryawan).trim()) {
      sh.getRange(i + 1, 9).setValue(statusBaru);
      return { success: true };
    }
  }
  return { success: false, message: 'Karyawan tidak ditemukan.' };
}

// ================== ADMIN: REKAP ABSENSI ==================

/**
 * filter = { tanggalMulai, tanggalSelesai, idKaryawan (opsional) }
 * tanggal dalam format 'yyyy-MM-dd'
 */
function getRekapAbsensi(filter) {
  const sh = getSheet_(SHEET_ABSENSI);
  const data = sh.getDataRange().getValues();
  const result = [];

  const mulai = filter.tanggalMulai ? new Date(filter.tanggalMulai + 'T00:00:00') : null;
  const selesai = filter.tanggalSelesai ? new Date(filter.tanggalSelesai + 'T23:59:59') : null;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const ts = new Date(row[0]);
    if (mulai && ts < mulai) continue;
    if (selesai && ts > selesai) continue;
    if (filter.idKaryawan && String(row[1]).trim() !== String(filter.idKaryawan).trim()) continue;

    result.push({
      timestamp: Utilities.formatDate(ts, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'),
      idKaryawan: row[1],
      nama: row[2],
      jenis: row[3],
      latitude: row[4],
      longitude: row[5],
      jarak: row[6],
      statusLokasi: row[7],
      fotoUrl: row[8]
    });
  }
  return result.reverse();
}

function getSettingKantor() {
  const setting = getSettingMap_();
  return {
    latitude: setting['Latitude_Kantor'],
    longitude: setting['Longitude_Kantor'],
    radius: setting['Radius_Meter']
  };
}

function updateSettingKantor(lat, lng, radius) {
  const sh = getSheet_(SHEET_SETTING);
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === 'Latitude_Kantor') sh.getRange(i + 1, 2).setValue(lat);
    if (data[i][0] === 'Longitude_Kantor') sh.getRange(i + 1, 2).setValue(lng);
    if (data[i][0] === 'Radius_Meter') sh.getRange(i + 1, 2).setValue(radius);
  }
  return { success: true };
}

// ================== SETTING NOTIFIKASI WHATSAPP (n8n) ==================

function getSettingNotifikasi() {
  const setting = getSettingMap_();
  return {
    webhookUrl: setting['N8N_Webhook_URL'],
    noWaAdmin: setting['No_WA_Admin'],
    notifKeKaryawan: setting['Notifikasi_Ke_Karyawan'],
    notifHanyaLuarArea: setting['Notifikasi_Hanya_Luar_Area']
  };
}

function updateSettingNotifikasi(webhookUrl, noWaAdmin, notifKeKaryawan, notifHanyaLuarArea) {
  const sh = getSheet_(SHEET_SETTING);
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === 'N8N_Webhook_URL') sh.getRange(i + 1, 2).setValue(webhookUrl);
    if (data[i][0] === 'No_WA_Admin') sh.getRange(i + 1, 2).setValue(noWaAdmin);
    if (data[i][0] === 'Notifikasi_Ke_Karyawan') sh.getRange(i + 1, 2).setValue(notifKeKaryawan);
    if (data[i][0] === 'Notifikasi_Hanya_Luar_Area') sh.getRange(i + 1, 2).setValue(notifHanyaLuarArea);
  }
  return { success: true };
}

/**
 * Untuk tombol "Tes Kirim Notifikasi" di panel Admin.
 */
function tesNotifikasiWA() {
  kirimNotifikasiN8n_({
    idKaryawan: 'TEST001',
    nama: 'Tes Notifikasi',
    jenis: 'Masuk',
    statusLokasi: 'Dalam Area',
    jarak: 12,
    fotoUrl: '',
    noHp: ''
  });
  return { success: true, message: 'Permintaan tes terkirim ke n8n (cek WhatsApp admin & log n8n).' };
}
