# Dapur Altrilia — prototipe 0.1

Restoran Indonesia di Altrilia Lyra Legacy Hospital. Masak bersama, kumpulkan koin KA, dan bangun pulau sendiri. Semua model dibuat oleh kode. Tidak memerlukan gambar, musik, rekaman suara, atau pustaka dari CDN.

## Mulai di komputer

1. Ekstrak ZIP ini.
2. Pasang Node.js versi 22 atau lebih baru jika belum tersedia.
3. Buka Terminal di folder yang berisi `package.json`.
4. Jalankan `npm start`.
5. Buka `http://localhost:3000` di browser.

Jangan membuka `public/index.html` dengan klik dua kali. Versi multipemain memerlukan server yang disertakan. Tidak ada paket tambahan yang harus diunduh untuk menjalankan game.

## Pasang di Render

1. Buat repositori GitHub baru, misalnya `dapur-altrilia`.
2. Unggah isi folder proyek. Pastikan `package.json`, `server.js`, `game-config.json`, serta folder `public` berada di tingkat utama repositori. Sertakan README dan folder test juga.
3. Di Render, pilih **New → Web Service** dan hubungkan repositori baru tersebut. Buat layanan baru; jangan ubah layanan cryptoloop.
4. Pilih runtime **Node**, Build Command `npm install`, Start Command `npm start`. Pilih paket **Free** jika tersedia di akunmu. Root Directory dikosongkan jika berkas berada di tingkat utama repositori.
5. Isi Health Check Path dengan `/healthz` jika pengaturan itu tersedia. PORT ditangani otomatis; tidak perlu database atau kunci rahasia.
6. Deploy, tunggu layanan aktif, lalu buka alamat HTTPS yang diberikan Render di keempat perangkat.

Server gratis dapat tidur saat tidak aktif; kunjungan pertama mungkin perlu menunggu. Restart server mengakhiri sesi memasak, tetapi koin dan barang yang sudah tersimpan di browser tetap dapat dimuat saat bergabung kembali. Gunakan satu instance server untuk versi ini.

## Cara bermain

- Masukkan nama panggilan yang berbeda untuk tiap pemain. Maksimum empat pemain per sesi; pemain berikutnya otomatis masuk sesi lain.
- Komputer: WASD untuk berjalan, seret mouse untuk melihat, E untuk berinteraksi. Tombol panah juga tersedia; Shift untuk berjalan lebih cepat.
- iPhone: gunakan joystick kiri untuk berjalan, geser bagian pemandangan untuk melihat, ketuk tombol Interaksi. Posisi layar mendatar lebih nyaman.
- Masuk melalui pintu utama. Dekati meja pasien dan ambil pesanannya.
- Dekati wajan kosong. Pilih pesanan, baca resep, ketuk bahan yang diperlukan, lalu mulai memasak.
- Tunggu hingga siap, ambil piring, lalu antarkan ke meja yang benar untuk memperoleh KA.
- Maksimum dua pesanan aktif, satu wajan dan satu piring per pemain. Bahan gratis tanpa batas.
- Selesaikan pesanan sebelum bepergian. Portal di halaman depan membawa pemain ke pulau sendiri atau pulau tetangga.
- Di pulau sendiri, buka Toko. Pilih barang, ketuk posisi pada denah, lalu konfirmasi pembelian. Barangku dapat digunakan untuk memindahkan barang tanpa biaya.
- Portal atau tombol Kembali ke Rumah Sakit mengantar ke halaman depan, bukan langsung ke dapur.
- Rumah pohon memiliki tangga untuk naik dan ruangan untuk dimasuki. Dekati sapi untuk memberi makan atau mengambil susu saat waktunya tiba.

## Ekonomi awal

Saldo awal: 300 KA. Satu petak bunga diberikan gratis.

| Hidangan | Waktu masak | Upah |
| --- | --- | --- |
| Nasi Goreng | 15 detik | 60 KA |
| Mie Goreng | 20 detik | 75 KA |
| Capcay | 20 detik | 80 KA |
| Bihun Goreng | 25 detik | 90 KA |
| Ayam Kecap | 30 detik | 110 KA |

| Barang | Harga |
| --- | --- |
| Bunga | 30 KA |
| Lampu taman | 60 KA |
| Bangku | 100 KA |
| Pohon peneduh | 120 KA |
| Pohon apel | 250 KA |
| Sapi | 700 KA |
| Rumah pohon | 1.500 KA |

Apel: 20 KA setiap 15 menit. Susu: 30 KA setiap 20 menit. Panen manual, maksimal satu pembayaran yang siap dipanen; tidak menumpuk terus selama offline. Maksimum 60 barang di satu pulau. Nama dan angka sebenarnya dapat diubah di `game-config.json`.

## Simpanan dan cadangan

Koin, jumlah hidangan yang selesai, barang dan penempatannya disimpan otomatis dalam localStorage berdasarkan nama panggilan. Pesanan dan masakan yang sedang berlangsung hanya tersimpan di sesi server.

Ingat nama panggilanmu dan gunakan perangkat, browser serta alamat situs yang sama. Nama saja tidak memulihkan data pada perangkat baru. Jangan hapus data situs dan hindari mode privat. Pulau pemain hanya muncul selama pemilik terhubung; lokasinya dapat berubah di sesi berikutnya.

Menu → Ekspor simpanan mengunduh cadangan JSON. Pada halaman masuk, gunakan Impor simpanan untuk memindahkannya ke perangkat atau alamat situs baru. Ekspor sebelum pindah dari localhost ke Render.

Versi ini untuk uji pribadi: nama panggilan bukan akun terlindungi, dan server memercayai saldo awal dari simpanan perangkat. Jangan gunakan uang sungguhan. Untuk peluncuran publik, diperlukan akun dan penyimpanan server yang tepercaya.

## Mengubah kode

- `public/index.html`: tampilan, dunia 3D, kontrol, suara sintetis singkat, UI dan penyimpanan browser.
- `game-config.json`: harga, resep, waktu memasak, hadiah, posisi meja dan pulau.
- `server.js`: sesi bersama, pasien, pesanan, pembayaran, perjalanan dan validasi.
- `test/server.test.js`: uji integrasi server, dapat dijalankan dengan `npm test`.

Ya, cukup ubah bagian terkait; tidak perlu menulis ulang seluruh game. Setelah mengubah kode lokal, restart server. Untuk Render, commit perubahan di GitHub lalu deploy ulang. Format simpanan yang berubah memerlukan migrasi agar progres lama tetap terbaca.

## Cakupan dan hasil pemeriksaan

Prototipe ini berisi alur memasak lengkap, empat pemain per sesi, pulau terlihat bersama, toko, penempatan barang, sapi, pohon apel, rumah pohon, simpanan lokal dan cadangan. Hewan lain, dinosaurus dan bunker belum disertakan.

Uji server lulus untuk pembagian sesi, perebutan pesanan, resep salah, pembayaran sekali saja, pembelian, perpindahan barang, pemulihan profil dan pemain keluar. Sintaks klien serta kompilasi shader dan render adegan telah diperiksa. Pengujian interaksi browser penuh dan empat iPhone fisik belum dilakukan; lakukan uji perangkat setelah deploy.
