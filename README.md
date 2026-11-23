# Presensi & Jurnal Guru — MAN 1 Pasuruan

Aplikasi web untuk presensi guru per jam pelajaran berbasis GPS per ruang, jurnal mengajar, izin, dan laporan untuk kepala madrasah.
Dibuka lewat browser HP, tanpa instal. Biaya Rp0: tampilan di **GitHub Pages**, data di **Supabase** (paket gratis).

## Isi folder

| Bagian | Isi |
|---|---|
| `index.html`, `css/`, `js/` | Aplikasi (tanpa proses build, langsung jalan) |
| `sw.js`, `manifest.webmanifest`, `icons/` | Bisa dipasang di layar utama HP + notifikasi browser |
| `supabase/schema.sql` | Seluruh database: tabel, keamanan, check-in & deteksi GPS palsu, izin, notifikasi, rekap |
| `supabase/functions/kelola-akun` | Membuat akun guru massal, akun admin/kepala, atur ulang sandi |
| `supabase/functions/kirim-push` | Mengirim notifikasi browser |
| `tools/buat-vapid.html` | Membuat kunci notifikasi (dibuka di browser) |
| `tools/parse_jadwal.py` | Mengubah PDF jadwal aSc Timetables menjadi CSV |

## Peran

- **Guru**: melihat jadwal hari ini, check-in GPS (dibaca 5 detik), mengisi jurnal, mengajukan izin, melihat riwayat.
- **Admin / Waka Kurikulum**: impor jadwal, jam pelajaran, perubahan harian (guru pengganti, batal, pindah ruang, libur), titik & radius ruang, menyetujui check-in di luar radius, menyetujui izin, membuat akun, pengaturan.
- **Kepala Madrasah**: dashboard, persetujuan izin, rekap bulanan, jurnal per kelas, ekspor Excel/PDF.

Izin bisa disetujui oleh waka kurikulum **atau** kepala madrasah. Keputusan pertama yang berlaku, dan keduanya mendapat notifikasi.

---

## Cara memasang (±1 jam, sekali saja)

Sebaiknya semua akun dibuat dengan **email resmi madrasah**, supaya tidak terikat ke satu orang.

### 1. Buat proyek Supabase
1. Daftar di <https://supabase.com>, lalu **New project**. Pilih region **Southeast Asia (Singapore)**.
2. Buka **Database → Extensions**, cari **pg_cron**, lalu aktifkan.
3. Buka **SQL Editor → New query**, tempel seluruh isi `supabase/schema.sql`, lalu tekan **Run**.

### 2. Tutup pendaftaran bebas
Buka **Authentication → Sign In / Providers**, lalu matikan **Allow new users to sign up**.
Akun hanya dibuat oleh admin dari dalam aplikasi.

### 3. Buat akun admin pertama
1. Buka **Authentication → Users → Add user → Create new user**.
   - Email: `waka@presensi.local` (bagian sebelum `@` menjadi username login)
   - Isi kata sandi dan centang **Auto Confirm User**.
2. Di **SQL Editor**, jalankan (ganti namanya):
   ```sql
   insert into pengguna (user_id, username, nama, peran)
   select id, 'waka', 'Nama Waka Kurikulum', 'admin' from auth.users where email = 'waka@presensi.local';
   ```

### 4. Buat kunci notifikasi
Buka `tools/buat-vapid.html` di browser (klik dua kali file-nya), lalu tekan **Buat kunci**. Simpan kedua kunci yang muncul.

### 5. Pasang dua Edge Function
Di **Edge Functions → Deploy a new function → Via Editor**:
1. Nama `kelola-akun`: tempel isi `supabase/functions/kelola-akun/index.ts`, lalu Deploy.
2. Nama `kirim-push`: tempel isi `supabase/functions/kirim-push/index.ts`, lalu Deploy. Setelah itu, buka pengaturan fungsi ini dan **matikan "Verify JWT"**.

Di **Edge Functions → Secrets**, tambahkan:

| Nama | Isi |
|---|---|
| `VAPID_PUBLIC_KEY` | kunci publik dari langkah 4 |
| `VAPID_PRIVATE_KEY` | kunci privat dari langkah 4 |
| `VAPID_SUBJECT` | `mailto:email-madrasah@...` |
| `WEBHOOK_SECRET` | teks acak buatan Anda sendiri, minimal 20 karakter |

(Bisa juga lewat Supabase CLI: `supabase functions deploy kelola-akun` dan `supabase functions deploy kirim-push --no-verify-jwt`.)

### 6. Sambungkan notifikasi
Buka **Database → Webhooks → Create a new hook**:
- Table: `notifikasi`, Events: **Insert**
- Type: **HTTP Request**, Method **POST**
- URL: `https://<ID-PROYEK>.supabase.co/functions/v1/kirim-push`
- HTTP Headers: `x-webhook-secret` = isi `WEBHOOK_SECRET` tadi

### 7. Isi `js/config.js`
Ambil dari **Project Settings → API**:
- `SUPABASE_URL` = Project URL
- `SUPABASE_ANON_KEY` = kunci `anon` / `publishable` (memang aman dipublikasikan, karena data tetap dilindungi aturan keamanan database)
- `VAPID_PUBLIC_KEY` = kunci publik dari langkah 4

⚠️ **Jangan pernah** menaruh `service_role key` atau kunci privat VAPID di file mana pun di GitHub.

### 8. Terbitkan di GitHub Pages
1. Di GitHub, buat repository baru (mis. `presensi-guru`), **Public**.
2. **Add file → Upload files**, lalu seret semua isi folder ini dan Commit.
3. Buka **Settings → Pages → Build and deployment**: Source **Deploy from a branch**, branch `main`, folder `/ (root)`.
4. Beberapa menit kemudian aplikasi bisa dibuka di `https://<username-github>.github.io/presensi-guru/`.

### 9. Pengisian awal (login sebagai admin)
1. **Jadwal & jam**: impor file CSV jadwal (`jadwal-ganjil-2026-2027.csv`), lalu isi *berlaku mulai*. Periksa juga jam pelajarannya.
2. **Pengaturan**: isi *tanggal mulai aplikasi dipakai*.
3. **Titik ruang**: keliling ke setiap kelas, Lapangan, dan lab, lalu tekan **Ambil titik** di tengah ruangan.
4. **Akun pengguna**: tekan **Buat akun untuk … guru**, lalu **unduh daftar** username & kata sandi awal untuk dibagikan. Tambahkan juga akun kepala madrasah.
5. Minta setiap pengguna membuka **Profil → Aktifkan notifikasi**. Pengguna iPhone perlu **Tambahkan ke Layar Utama** dulu lewat Safari.

---

## Cara kerja penting

**Jadwal final hari ini** = versi jadwal yang berlaku + perubahan harian + izin yang disetujui. Ganti jadwal permanen cukup dengan impor versi baru beserta tanggal berlakunya. Laporan bulan-bulan sebelumnya tetap memakai versi lama.

**Check-in**: dibuka 10 menit sebelum jam mulai, dan dihitung terlambat setelah lewat 10 menit (bisa diubah di Pengaturan). GPS dibaca 5 detik sejak halaman dibuka. Server lalu menghitung jarak ke titik ruang dan memeriksa pola GPS palsu:
- koordinat diam sempurna
- akurasi tidak wajar
- lokasi melompat jauh dari check-in sebelumnya
- titik sama persis dengan hari lain
- di luar radius

Check-in yang mencurigakan **tidak ditolak**, tetapi masuk ke **Persetujuan** untuk diperiksa admin.

**Otomatis tiap 5 menit** (pg_cron): sesi yang lewat 10 menit tanpa check-in dikirim sebagai peringatan **kelas kosong** ke admin & kepala. Sesi yang sudah selesai tanpa check-in dicatat **tidak hadir**.

**Libur nasional / kegiatan madrasah**: masukkan lewat **Perubahan harian → Libur** (bisa sehari penuh atau jam tertentu) supaya tidak dihitung tidak hadir.

## Catatan

- **Jeda Supabase gratis**: proyek dijeda kalau tidak dipakai selama 1 minggu (misalnya libur semester). Data tidak hilang. Cukup admin login sekali selama libur, atau buka dashboard Supabase saat ada email peringatan.
- **GPS tidak bisa membedakan lantai**, dan aplikasi Fake GPS tidak bisa dicegah 100%. Deteksi pola di atas membuat kecurangan mudah ketahuan.
- **Halaman "MAN 1 PASURUAN"** di PDF (Upacara, KJS, Matrikulasi) tidak diimpor sebagai jadwal guru.
- **Jam ke-10** di PDF aSc tertulis 17.00–17.45, sedangkan di tabel KBM tertulis 14.30–15.10. Aplikasi memakai tabel KBM. Ubah di **Jadwal & jam** bila perlu.
- **Jadwal baru dari aSc**: jalankan `python3 tools/parse_jadwal.py JADWAL.pdf jadwal.csv` (perlu `pip install pdfplumber`), lalu impor CSV-nya.
