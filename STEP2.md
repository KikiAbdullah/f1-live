Berikut lanjutan yang lebih mendalam, fokus ke implementasi production-grade agar tidak berakhir menjadi proyek yang lambat atau sulit dikembangkan.

# Arsitektur Data Yang Benar

Kesalahan terbesar banyak proyek OpenF1:

```text
API
 ↓
UI
```

Setiap komponen langsung memanggil API.

Akibatnya:

- Duplicate request
- Sulit debugging
- Replay tidak sinkron
- Sulit tambah fitur

Gunakan:

```text
API
 ↓
Data Loader
 ↓
Store
 ↓
Replay Engine
 ↓
Event Bus
 ↓
UI Components
```

---

# Core Store

`store.js`

```javascript
export const store = {
  session: null,

  drivers: [],

  positions: [],

  telemetry: [],

  locations: [],

  laps: [],

  weather: [],

  raceControl: [],

  teamRadio: [],

  overtake: [],

  currentTime: 0,

  playbackSpeed: 1,

  isPlaying: false,
};
```

Semua data hanya masuk ke sini.

---

# Event Bus

Tanpa framework.

`event-bus.js`

```javascript
const listeners = {};

export const eventBus = {
  on(event, callback) {
    if (!listeners[event]) {
      listeners[event] = [];
    }

    listeners[event].push(callback);
  },

  emit(event, data) {
    if (!listeners[event]) return;

    listeners[event].forEach((fn) => fn(data));
  },
};
```

---

Contoh:

```javascript
eventBus.emit("TIME_UPDATE", replayTime);
```

Leaderboard:

```javascript
eventBus.on("TIME_UPDATE", updateLeaderboard);
```

Trackmap:

```javascript
eventBus.on("TIME_UPDATE", updateTrackMap);
```

Telemetry:

```javascript
eventBus.on("TIME_UPDATE", updateTelemetry);
```

Semua sinkron.

---

# Replay Engine

File paling penting.

`replay-engine.js`

```javascript
import { store } from "./store.js";
import { eventBus } from "./event-bus.js";

let animationFrame;
let lastFrame = 0;

export function startReplay() {
  store.isPlaying = true;

  lastFrame = performance.now();

  loop(lastFrame);
}

export function pauseReplay() {
  store.isPlaying = false;

  cancelAnimationFrame(animationFrame);
}

function loop(now) {
  if (!store.isPlaying) return;

  const delta = now - lastFrame;

  lastFrame = now;

  store.currentTime += delta * store.playbackSpeed;

  eventBus.emit("TIME_UPDATE", store.currentTime);

  animationFrame = requestAnimationFrame(loop);
}
```

Jangan gunakan:

```javascript
setInterval();
```

karena replay akan patah-patah.

Gunakan:

```javascript
requestAnimationFrame();
```

---

# Timestamp Indexing

Masalah berikutnya:

Data OpenF1 bisa jutaan record.

Contoh:

```text
Location
≈ 1.000.000+
```

Kalau setiap frame:

```javascript
array.filter(...)
```

aplikasi akan mati.

---

Buat index.

```javascript
Map;
```

atau

```javascript
Binary Search
```

---

Contoh:

```javascript
timestampIndex = [1000, 1010, 1020, 1030];
```

Cari posisi terdekat:

```javascript
binarySearch(timestampIndex, currentTime);
```

Kompleksitas:

```text
O(log n)
```

bukan

```text
O(n)
```

---

# Session Loader

`session-service.js`

```javascript
const BASE_URL = "https://api.openf1.org/v1";
```

---

Load Session

```javascript
export async function getRace(year) {
  const response = await fetch(
    `${BASE_URL}/sessions?year=${year}&session_name=Race`
  );

  return response.json();
}
```

---

# Bulk Loader

Saat race dipilih:

```javascript
export async function loadSession(sessionKey) {
  const [drivers, position, location, telemetry, laps, weather, raceControl] =
    await Promise.all([
      loadDrivers(sessionKey),
      loadPosition(sessionKey),
      loadLocation(sessionKey),
      loadTelemetry(sessionKey),
      loadLaps(sessionKey),
      loadWeather(sessionKey),
      loadRaceControl(sessionKey),
    ]);

  return {
    drivers,
    position,
    location,
    telemetry,
    laps,
    weather,
    raceControl,
  };
}
```

Download sekali.

Replay lokal.

---

# IndexedDB Cache

Untuk GitHub Pages wajib.

Karena:

```text
2025 Monaco Race
```

bisa puluhan MB.

---

Gunakan:

```javascript
idb;
```

atau native:

```javascript
indexedDB;
```

---

Struktur:

```text
database
│
├── sessions
│
├── positions
│
├── telemetry
│
├── locations
│
├── laps
│
└── weather
```

---

Flow:

```text
User pilih race
        ↓
Cek cache
        ↓
Ada ?
        ↓
Ya → Load local
Tidak
        ↓
Download API
        ↓
Simpan IndexedDB
```

---

# Leaderboard Engine

Jangan hitung ranking dari endpoint setiap frame.

Saat loading:

```javascript
buildPositionTimeline();
```

Buat:

```javascript
[
 {
   timestamp: 1000,
   positions: [...]
 },
 {
   timestamp: 2000,
   positions: [...]
 }
]
```

---

Saat replay:

```javascript
const state = getTimelineState(currentTime);
```

Leaderboard hanya render state itu.

---

# Track Map

OpenF1 memberi:

```text
x
y
z
```

Koordinat tidak cocok langsung dengan canvas.

Perlu normalisasi.

```javascript
normalizedX = ((x - minX) / (maxX - minX)) * canvas.width;
```

---

Sama untuk Y.

```javascript
normalizedY = ((y - minY) / (maxY - minY)) * canvas.height;
```

---

# Track Renderer

Render jalur sekali.

Jangan render ulang setiap frame.

```javascript
drawTrack();
```

sekali.

Lalu replay:

```javascript
drawCars();
```

setiap frame.

---

Ini menghemat GPU besar sekali.

---

# Driver Marker

Objek:

```javascript
{
   driver_number: 1,
   team: "Red Bull",
   x: 123,
   y: 456
}
```

Render:

```javascript
ctx.beginPath();

ctx.arc(x, y, 5, 0, Math.PI * 2);

ctx.fill();
```

---

# Telemetry Engine

Saat driver dipilih:

```javascript
selectedDriver = 1;
```

Ambil:

```javascript
telemetry;
```

driver itu saja.

---

Chart:

```javascript
Speed;
Throttle;
Brake;
RPM;
Gear;
DRS;
```

Saya sarankan:

- Chart.js untuk V1
- Lightweight Charts untuk V2

karena telemetry bisa sangat besar.

---

# Team Radio

Endpoint:

```text
/team_radio
```

Timeline:

```text
Lap 18

[PLAY]

VER:
"Tyres are gone."
```

Audio bisa diputar sesuai replay time.

---

# Overtake Detection Engine

Bandingkan posisi:

```javascript
lap 12

VER P2
NOR P1
```

menjadi:

```javascript
lap 13

VER P1
NOR P2
```

Trigger:

```javascript
eventBus.emit("OVERTAKE", {
  attacker: "VER",
  victim: "NOR",
});
```

---

# Folder Production Final

```text
src/
│
├── core/
│   ├── store.js
│   ├── event-bus.js
│   ├── replay-engine.js
│   ├── timeline-engine.js
│   ├── cache-engine.js
│   └── api.js
│
├── services/
│   ├── session-service.js
│   ├── position-service.js
│   ├── telemetry-service.js
│   ├── weather-service.js
│   ├── radio-service.js
│   ├── overtake-service.js
│   └── pit-service.js
│
├── renderers/
│   ├── leaderboard-renderer.js
│   ├── track-renderer.js
│   ├── telemetry-renderer.js
│   ├── weather-renderer.js
│   └── radio-renderer.js
│
├── components/
│   ├── leaderboard.js
│   ├── controls.js
│   ├── trackmap.js
│   ├── telemetry.js
│   └── timeline.js
│
├── assets/
│
├── data/
│
└── main.js
```

# Target Akhir

Jika dibangun dengan struktur ini, hasilnya akan menyerupai:

- MultiViewer F1
- F1 Live Timing
- Formula Timing Replay
- Race Control Center

tetapi tetap **100% Vanilla JS**, tanpa React/Vue, bisa langsung di-host di GitHub Pages, memiliki replay 60 FPS, caching lokal, telemetry, track map, leaderboard, team radio, weather, pit stop, overtake, dan race control yang tersinkronisasi oleh satu replay engine pusat.
