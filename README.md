# KlipLink - Pemendek Tautan Cloudflare Workers & D1

KlipLink adalah aplikasi web pemendek tautan (URL shortener) modern, cepat, dan aman yang berjalan sepenuhnya di atas infrastruktur serverless **Cloudflare Workers** dengan database relasional terdistribusi **Cloudflare D1 (SQLite)**.

Dilengkapi dengan dasbor manajemen admin terlindungi kata sandi untuk melihat seluruh tautan yang sudah dibuat, memantau statistik klik, mengedit slug & target URL, serta menghapus tautan.

---

## Tombol One-Click Deploy ke Cloudflare

Klik tombol di bawah ini untuk langsung menerapkan KlipLink ke akun Cloudflare Anda secara otomatis:

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/dedealan/kliplink)

> **Catatan:** Ganti `dedealan/kliplink` dengan repository GitHub Anda sendiri jika Anda telah melakukan fork atau clone repository ini.

Saat Anda menekan tombol di atas, Cloudflare akan secara otomatis:
1. Menyalin (clone) repository ke akun GitHub Anda.
2. Membuat database Cloudflare D1 bernama `kliplink-db`.
3. Membangun aplikasi menggunakan Cloudflare Workers Builds.
4. Menerapkan Worker ke seluruh jaringan edge Cloudflare global.

---

## Fitur Utama

- **Ultra Cepat di Jaringan Edge:** Pengalihan (redirect) HTTP 302 berlangsung dengan latensi minim di ratusan data center Cloudflare seluruh dunia.
- **Pencatatan Klik Asinkron:** Penghitungan jumlah klik dan stempel waktu akses terakhir diperbarui di latar belakang menggunakan `ctx.waitUntil()` tanpa memperlambat kecepatan redirect pengunjung.
- **Dasbor Manajemen Admin:**
  - Masuk dengan kata sandi admin terlindungi enkripsi token HMAC-SHA256 (HTTP-only cookie).
  - Tinjau seluruh daftar tautan lengkap dengan total klik dan tanggal dibuat.
  - Kustomisasi tautan: Ubah slug kustom, perbarui URL tujuan, atau ganti judul catatan.
  - Hapus tautan dengan dialog konfirmasi aman.
- **Kustom Slug atau Otomatis:** Buat tautan dengan slug kustom (contoh: `/promo-hebat`) atau biarkan sistem membuat kode pendek acak secara otomatis.
- **Generator Kode QR Instan:** Setiap tautan pendek dilengkapi kode QR berformat SVG yang tajam dan dapat diunduh langsung untuk materi promosi cetak maupun digital.
- **Pencarian & Pengurutan Real-Time:** Filter tautan berdasarkan slug atau URL tujuan, serta urutkan berdasarkan tautan terbaru, terlama, klik terbanyak, atau klik tersedikit.
- **Desain Workbench Solid:** Antarmuka gelap bersih, konsisten, dan bebas elemen AI slop dengan waktu muat instan tanpa pelacak pihak ketiga.

---

## Konfigurasi Variabel Lingkungan & Rahasia

Anda dapat menyesuaikan konfigurasi pada file `wrangler.json` atau melalui menu **Settings > Variables and Secrets** di dashboard Cloudflare Workers:

| Variabel / Secret | Tipe | Default | Keterangan |
|---|---|---|---|
| `ADMIN_PASSWORD` | Secret | `admin123` | Kata sandi untuk masuk ke dasbor admin. Sangat disarankan untuk diubah pada produksi. |
| `SESSION_SECRET` | Secret | Otomatis | Kunci rahasia untuk menandatangani cookie sesi (HMAC-SHA256). |
| `ADMIN_USERNAME` | Variable | `admin` | Nama pengguna admin tampilan di dasbor. |
| `REQUIRE_AUTH_TO_CREATE` | Variable | `false` | Jika `true`, hanya admin yang bisa membuat tautan. Jika `false`, publik dapat membuat tautan di beranda. |
| `APP_NAME` | Variable | `KlipLink` | Nama aplikasi yang ditampilkan di header dan judul. |

---

## Panduan Pengembangan Lokal

### 1. Prasyarat
- Node.js versi 20+ (Direkomendasikan Node.js 22 atau 24)
- npm atau pnpm

### 2. Instalasi Dependensi
```bash
git clone https://github.com/dedealan/kliplink.git
cd kliplink
npm install
```

### 3. Konfigurasi Variabel Dev
Salin file `.dev.vars.example` menjadi `.dev.vars`:
```bash
cp .dev.vars.example .dev.vars
```

### 4. Menjalankan Server Lokal
```bash
npm run dev
```
Buka peramban Anda di `http://127.0.0.1:8787`. Worker dan database D1 akan disimulasikan secara lokal di mesin Anda tanpa memerlukan koneksi internet.

### 5. Menjalankan Pengujian Otomatis
```bash
npm test
```
Seluruh skenario pengujian unit dan integrasi akan dijalankan menggunakan runner pengujian Node.js.

### 6. Pengecekan Tipe TypeScript
```bash
npm run typecheck
```

---

## Panduan Menerapkan Manual Melalui Wrangler CLI

Jika Anda ingin menerapkan langsung dari terminal lokal ke akun Cloudflare Anda:

### 1. Login ke Cloudflare CLI
```bash
npx wrangler login
```

### 2. Buat Database D1
```bash
npx wrangler d1 create kliplink-db
```
Salin `database_id` yang dihasilkan dari terminal, lalu perbarui nilai `database_id` pada file `wrangler.json`:
```json
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "kliplink-db",
    "database_id": "<MASUKKAN_DATABASE_ID_ANDA_DI_SINI>"
  }
]
```

### 3. Terapkan Skema Database (Opsional)
Skema tabel akan dibuat otomatis saat permintaan pertama masuk. Namun jika ingin mengeksekusi skema awal secara manual:
```bash
npm run db:init -- --remote
```

### 4. Simpan Password Admin Rahasia
```bash
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put SESSION_SECRET
```

### 5. Deploy ke Cloudflare
```bash
npm run deploy
```

Worker Anda akan langsung aktif dengan URL bawaan `https://kliplink.<subdomain>.workers.dev` atau domain kustom yang Anda hubungkan.

---

## Struktur Proyek

```
kliplink/
├── public/                 # Aset frontend statis (HTML, CSS, JS, Favicon)
│   ├── app.js              # Logika interaktif dasbor, auth, dan salin tautan
│   ├── favicon.svg         # Ikon vektor aplikasi
│   ├── index.html          # Halaman antarmuka beranda dan manajemen admin
│   └── style.css           # Desain sistem responsif, token warna, dan animasi
├── src/                    # Kode serverless Cloudflare Worker
│   ├── auth.ts             # Otentikasi Web Crypto HMAC-SHA256 dan manajemen cookie
│   ├── db.ts               # Kueri database Cloudflare D1 (CRUD tautan & analitik)
│   ├── index.ts            # Router utama HTTP, pengalihan 302, dan penanganan API
│   ├── qr.ts               # Generator kode QR berbasis vektor SVG
│   └── types.ts            # Definisi antarmuka TypeScript
├── tests/                  # Pengujian otomatis integrasi & unit
│   ├── mock-d1.ts          # Mock D1 Database in-memory SQLite untuk pengujian
│   └── worker.test.ts      # Pengujian API, autentikasi, pengalihan, dan mutasi
├── .dev.vars.example       # Contoh variabel lingkungan lokal
├── package.json            # Konfigurasi dependensi dan skrip proyek
├── schema.sql              # Skema database SQLite untuk D1
├── tsconfig.json           # Konfigurasi kompilator TypeScript
└── wrangler.json           # Konfigurasi deployment Cloudflare Worker & D1
```

---

## Lisensi

Proyek ini dirilis di bawah lisensi [MIT](LICENSE). Bebas digunakan, dimodifikasi, dan didistribusikan untuk keperluan pribadi maupun komersial.
