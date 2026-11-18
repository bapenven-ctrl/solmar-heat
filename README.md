[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/c/gta6-01)
[![rank](https://make.fun/badge/gta6-01/bapenven-ctrl/solmar-heat/rank.svg)](https://make.fun/c/gta6-01)
[![reward](https://make.fun/badge/gta6-01/bapenven-ctrl/solmar-heat/reward.svg)](https://make.fun/c/gta6-01)

Bounty: https://make.fun/bounty/gta6-01

# Solmar Heat

Game open-world 3D ala GTA di browser — kota pantai fiktif **Solmar** saat matahari terbenam. Kamu **Rex Marlowe**, sopir sewaan yang baru saja mengambil paket terakhirnya, dan paket itu milik orang yang salah.

## Yang ada di dalam game

- **Dua distrik**: *Solmar* — grid jalan, gedung prosedural dengan jendela menyala, Menara Solmar, pantai dan laut di timur, pelabuhan kontainer dengan derek, strip bandara di selatan; dan *Bukit Cemara* — kawasan vila di perbukitan terasering sisi barat dengan Menara Pandang sendiri, terhubung lewat jalan pesisir dan jembatan kecil di atas teluk.
- **Jalan kaki & mengemudi**: third-person, masuk/keluar mobil (E), tabrakan, lalu lintas AI yang berbelok di persimpangan dan memutari Bukit Cemara, mobil parkir, dan pejalan kaki yang lari saat ada kejahatan.
- **Wanted level & polisi**: bintang 0–5 — naik saat mencuri mobil, menabrak pejalan kaki/polisi, atau menembak. Mobil polisi mengejar dengan sirene dan light bar berkedip. **Wanted ≥3: roadblock** — dua mobil polisi dan barikade melintang di jalan depanmu. **Wanted ≥4: helikopter polisi** dengan rotor berputar dan kerucut sorot lampu yang mengikutimu; wanted tidak meluruh selama polisi atau helikopter melihatmu.
- **7 misi cerita berurutan**: *Paket Pelabuhan* ($150), *Pelarian* ($200), *Curi dan Antar* ($400), *Balapan Dermaga* — checkpoint race dua distrik ($300), *Utang Lama* — rebut 3 titik utang dari geng Karang ($450), *Konvoi* — kawal mobil kawan melintasi kota ($500), *Paket Terakhir* — antar di wanted 4 melewati roadblock ($750). Beacon emas, objektif di HUD, layar "MISI SELESAI" dan auto-save di tiap misi.
- **Combat**: pukulan (F) dan pistol (klik mouse) melawan anggota geng rival yang bernyawa dan melawan balik.
- **HUD + minimap**: nyawa, uang, bintang wanted, kecepatan, jam dalam game, objektif misi, toast, dan minimap top-down yang memuat kedua distrik (jalan, pemain, mobil, polisi, roadblock, marker misi).
- **Layar & save**: layar judul, jeda, misi selesai, dan save otomatis ke localStorage (uang, misi, posisi) dengan indikator "TERSIMPAN".
- **Suara prosedural** (WebAudio, tanpa file audio): dengung mesin mengikuti kecepatan, sirene dua nada, tembakan, pukulan, bunyi ambil, klik UI, tombol mute (M).

Semua nama, cerita, kendaraan, dan seni orisinal — tidak ada aset dari game komersial mana pun. Semua file dimuat lokal (three.js 0.170.0 di-vendor di `game/vendor/`), tanpa request jaringan saat bermain. Simulasi deterministik: seed tetap, langkah 1/60 detik.

## Cara menjalankan

```sh
node serve.ts
# buka http://localhost:8080
```

Screenshot diambil dari gameplay nyata lewat `?shot=cover|harbor|district2|finale&seed=N` (lihat `shots.json` dan `tools/shoot.mjs`) — keempatnya adegan multi-sistem yang sedang berjalan, bukan layar menu.

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
