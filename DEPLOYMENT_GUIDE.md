# IoTBridge Deployment Guide

Panduan ini untuk deploy IoTBridge ke Vercel dan menghubungkan ESP32 ke endpoint telemetry ingestion.

## Backend Storage

Backend ini bisa berjalan dengan tiga mode:

- Local development: membaca dan menulis ke folder `data/`.
- PostgreSQL production: gunakan `DATABASE_URL` atau `POSTGRES_URL`.
- Redis fallback: gunakan Upstash Redis kalau PostgreSQL belum dipakai.

Vercel Functions punya filesystem read-only dan hanya `/tmp` yang writable sementara, jadi file JSON di `data/` tidak cocok untuk telemetry production. Kode sekarang otomatis memakai PostgreSQL kalau salah satu env berikut tersedia:

```env
DATABASE_URL=postgresql://user:password@host:5432/database
```

Atau:

```env
POSTGRES_URL=postgresql://user:password@host:5432/database
```

Opsional untuk provider yang membutuhkan SSL eksplisit:

```env
IOTBRIDGE_POSTGRES_SSL=true
```

Tabel PostgreSQL akan dibuat otomatis saat request backend pertama kali berjalan. Schema manual juga tersedia di `database/schema.sql`.
Untuk flow yang lebih rapi, jalankan migration tool sebelum app dipakai:

```bash
pnpm db:migrate
```

Migration files ada di folder `database/migrations/` dan statusnya dicatat di tabel `schema_migrations`.

Kalau PostgreSQL belum dikonfigurasi, kode masih mendukung Redis. Env Redis:

```env
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

Kalau integration Vercel memakai prefix custom `UPSTASH_REDIS`, env yang dibuat bisa berbentuk:

```env
UPSTASH_REDIS_KV_REST_API_URL=...
UPSTASH_REDIS_KV_REST_API_TOKEN=...
```

Kode juga mendukung nama env lama:

```env
KV_REST_API_URL=...
KV_REST_API_TOKEN=...
```

Opsional, untuk membedakan namespace data:

```env
IOTBRIDGE_REDIS_PREFIX=iotbridge
```

## Deploy ke Vercel

1. Push repo ini ke GitHub.
2. Buka Vercel, pilih New Project, lalu import repository.
3. Pastikan root directory mengarah ke folder project ini kalau repo kamu punya subfolder.
4. Framework preset: Next.js.
5. Install command: `pnpm install`.
6. Build command: `pnpm build`.
7. Tambahkan PostgreSQL provider, misalnya Vercel Postgres, Supabase, Neon, atau Railway.
8. Set `DATABASE_URL` atau `POSTGRES_URL` di Environment Variables untuk Production dan Preview.
9. Jalankan `pnpm db:migrate` dengan env PostgreSQL yang sama.
10. Redeploy project setelah env PostgreSQL tersedia.

Setelah deploy, base URL akan seperti:

```txt
https://nama-project.vercel.app
```

## Auth dan Admin

User dan session juga disimpan di PostgreSQL saat `DATABASE_URL` atau `POSTGRES_URL` tersedia. Password disimpan sebagai hash, bukan plaintext.

Admin tidak dibuat lewat halaman register. Backend akan membuat akun admin bootstrap secara otomatis saat auth endpoint pertama kali dipanggil.

Untuk local development, login admin default:

```txt
Email: admin@iotbridge.local
Password: Admin12345!
```

Untuk Vercel production, set env ini sebelum redeploy:

```env
IOTBRIDGE_ADMIN_EMAIL=admin@campus.edu
IOTBRIDGE_ADMIN_PASSWORD=pakai-password-kuat
IOTBRIDGE_ADMIN_NAME=Admin Campus
```

Setelah deploy, admin login lewat `/login`. Halaman `/register` hanya untuk `Device Owner` dan `Developer`.

Selama seed demo belum dimatikan, backend akan seed akun demo dari data mock utama agar relasi `ownerId`, access request, dan access grant tetap tersambung:

```txt
Device Owner: ahmad.fauzi@campus.edu
Developer: siti.rahayu@campus.edu
Developer: budi.santoso@campus.edu
Admin Demo: admin@campus.edu
Password: Demo12345!
```

Ubah password demo dengan env `IOTBRIDGE_DEMO_USER_PASSWORD`, atau matikan seed demo dengan `IOTBRIDGE_SEED_DEMO_USERS=false`.

## Endpoint ESP32

ESP32 mengirim data ke:

```http
POST https://nama-project.vercel.app/api/v1/ingestion/telemetry
```

Headers:

```http
Content-Type: application/json
X-Device-Id: dev-001
X-Device-Key: <your_device_api_key>
```

Body:

```json
{
  "metrics": {
    "temperature": 26.4,
    "humidity": 68,
    "pressure": 1013.25
  }
}
```

Response sukses:

```json
{
  "id": "tel_...",
  "deviceId": "dev-001",
  "timestamp": "2026-06-02T07:41:16.005Z",
  "data": {
    "temperature": 26.4,
    "humidity": 68,
    "pressure": 1013.25
  }
}
```

## Test dengan curl

```bash
curl -X POST "https://nama-project.vercel.app/api/v1/ingestion/telemetry" \
  -H "Content-Type: application/json" \
  -H "X-Device-Id: dev-001" \
  -H "X-Device-Key: <your_device_api_key>" \
  -d "{\"metrics\":{\"temperature\":26.4,\"humidity\":68,\"pressure\":1013.25}}"
```

Cek data terbaru:

```bash
curl "https://nama-project.vercel.app/api/v1/data/devices/dev-001/latest" \
  -H "Authorization: Bearer token_access_grant_dari_dashboard"
```

Endpoint baca data ini diproteksi. Di browser dashboard, cookie login dipakai otomatis. Dari aplikasi eksternal, pakai bearer token dari access grant.

## Contoh ESP32 Arduino

```cpp
#include <WiFi.h>
#include <HTTPClient.h>

const char* WIFI_SSID = "YOUR_WIFI";
const char* WIFI_PASSWORD = "YOUR_PASSWORD";

const char* API_URL = "https://nama-project.vercel.app/api/v1/ingestion/telemetry";
const char* DEVICE_ID = "dev-001";
const char* DEVICE_KEY = "<your_device_api_key>";

void setup() {
  Serial.begin(115200);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWiFi connected");
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(API_URL);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-Device-Id", DEVICE_ID);
    http.addHeader("X-Device-Key", DEVICE_KEY);

    float temperature = 26.4;
    float humidity = 68.0;

    String body = "{";
    body += "\"metrics\":{";
    body += "\"temperature\":" + String(temperature, 1) + ",";
    body += "\"humidity\":" + String(humidity, 1);
    body += "}}";

    int statusCode = http.POST(body);
    String response = http.getString();

    Serial.print("Status: ");
    Serial.println(statusCode);
    Serial.println(response);

    http.end();
  }

  delay(60000);
}
```

## Catatan Penting

- Ambil `Device ID` dan `API Key` dari halaman device di dashboard.
- Kalau key salah, backend mengembalikan `401 Invalid device key`.
- Kalau device `suspended` atau `archived`, backend mengembalikan `403`.
- Jangan deploy production hanya dengan file JSON lokal; gunakan PostgreSQL agar telemetry tetap tersimpan.
