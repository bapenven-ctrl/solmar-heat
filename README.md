[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/c/gta6-01)
[![rank](https://make.fun/badge/gta6-01/bapenven-ctrl/solmar-heat/rank.svg)](https://make.fun/c/gta6-01)
[![reward](https://make.fun/badge/gta6-01/bapenven-ctrl/solmar-heat/reward.svg)](https://make.fun/c/gta6-01)

# Solmar Heat

Game open-world 3D ala GTA di browser — kota pantai fiktif **Solmar** saat matahari terbenam. Kamu **Rex Marlowe**, sopir sewaan yang baru saja mengambil paket terakhirnya, dan paket itu milik orang yang salah.

## Yang ada di dalam game

- **Kota Solmar**: grid jalan, gedung prosedural dengan jendela menyala, Menara Solmar, pantai dan laut di timur, pohon palem dan lampu jalan.
- **Jalan kaki & mengemudi**: third-person, masuk/keluar mobil (E), tabrakan, lalu lintas AI yang berbelok di persimpangan, mobil parkir, dan pejalan kaki yang lari saat ada kejahatan.
- **Wanted level & polisi**: bintang 0–5 — naik saat mencuri mobil, menabrak pejalan kaki/polisi, atau menembak. Mobil polisi mengejar dengan sirene dan light bar berkedip, menabrak dengan damage kecil dan cooldown.
- **3 misi cerita berurutan**: *Paket Pelabuhan* (ambil & antar, $150), *Pelarian* (kabur dari kejaran wanted 2 ke tempat persembunyian, $200), *Curi dan Antar* (curi mobil target dari geng rival, $400) — dengan beacon emas, objektif di HUD, layar "MISI SELESAI" dan auto-save.
- **Combat**: pukulan (F) dan pistol (klik mouse) melawan anggota geng rival yang bernyawa.
- **HUD + minimap**: nyawa, uang, bintang wanted, kecepatan, jam dalam game, objektif misi, toast, dan minimap top-down (jalan, pemain, mobil, polisi, marker misi).
- **Layar & save**: layar judul, jeda, misi selesai, dan save otomatis ke localStorage (uang, misi, posisi) dengan indikator "TERSIMPAN".
- **Suara prosedural** (WebAudio, tanpa file audio): dengung mesin mengikuti kecepatan, sirene dua nada, tembakan, pukulan, bunyi ambil, klik UI, tombol mute (M).

Semua nama, cerita, kendaraan, dan seni orisinal — tidak ada aset dari game komersial mana pun. Semua file dimuat lokal (three.js 0.170.0 di-vendor di `game/vendor/`), tanpa request jaringan saat bermain. Simulasi deterministik: seed tetap, langkah 1/60 detik.

## Cara menjalankan

```sh
node serve.ts
# buka http://localhost:8080
```

Screenshot diambil dari gameplay nyata lewat `?shot=cover|start|chase|mission&seed=N` (lihat `shots.json` dan `tools/shoot.mjs`).

## Kontrol

| Tombol | Aksi |
| --- | --- |
| WASD / panah | Jalan / mengemudi |
| Shift | Lari |
| E | Masuk / keluar mobil |
| F | Pukul |
| Klik mouse | Tembak pistol |
| P / Esc | Jeda |
| M | Suara hidup/mati |
| Enter / Space | Mulai / lanjut |
