Kalau targetmu adalah membuat **F1 Live Timing + Replay Race Viewer** yang mirip F1 TV Timing, OpenF1 sebenarnya sudah lebih dari cukup.

Yang perlu dipahami dulu:

## 1. OpenF1 Bukan Video Replay

OpenF1 hanya menyediakan data:

* Posisi mobil
* Telemetry
* Lap time
* Sector
* Pit stop
* Weather
* Race Control
* Team Radio
* Championship

Tidak ada video stream. ([OpenF1][1])

Jadi konsepnya:

```text
OpenF1 Data
      ↓
Race Engine
      ↓
Replay Timeline
      ↓
UI Visualization
```

Persis seperti:

* MultiViewer
* F1 Live Timing
* F1 Replay Timing
* BoxBox Replay

yang hanya memvisualisasikan data balapan. ([Reddit][2])

---

# Arsitektur Yang Saya Sarankan

Untuk GitHub Pages:

```text
f1-replay/
│
├── index.html
│
├── assets/
│   ├── css/
│   │   ├── main.css
│   │   ├── layout.css
│   │   ├── leaderboard.css
│   │   ├── telemetry.css
│   │   └── trackmap.css
│   │
│   ├── js/
│   │
│   ├── core/
│   │   ├── api.js
│   │   ├── replay-engine.js
│   │   ├── timeline.js
│   │   ├── event-bus.js
│   │   └── store.js
│   │
│   ├── services/
│   │   ├── session-service.js
│   │   ├── position-service.js
│   │   ├── telemetry-service.js
│   │   ├── weather-service.js
│   │   ├── racecontrol-service.js
│   │   └── pitstop-service.js
│   │
│   ├── ui/
│   │   ├── leaderboard.js
│   │   ├── trackmap.js
│   │   ├── telemetry.js
│   │   ├── weather.js
│   │   ├── controls.js
│   │   └── racecontrol.js
│   │
│   └── data/
│       └── circuits/
│
└── README.md
```

---

# Endpoint Yang Wajib Dipakai

## Sessions

Cari race yang ingin direplay

```javascript
https://api.openf1.org/v1/sessions
```

Contoh:

```javascript
https://api.openf1.org/v1/sessions?year=2025&session_name=Race
```

([OpenF1][3])

---

## Drivers

Daftar pembalap

```javascript
https://api.openf1.org/v1/drivers?session_key=XXXX
```

---

## Position

Posisi balapan

```javascript
https://api.openf1.org/v1/position?session_key=XXXX
```

Ini yang akan menggerakkan leaderboard.

([OpenF1][3])

---

## Location

GPS mobil.

```javascript
https://api.openf1.org/v1/location?session_key=XXXX
```

Ini yang dipakai untuk track map.

Sample:

```json
{
  "x": 489,
  "y": 3403,
  "z": 186
}
```

([OpenF1][3])

---

## Car Data

Telemetry.

```javascript
https://api.openf1.org/v1/car_data?session_key=XXXX
```

Berisi:

```json
{
  "speed": 315,
  "throttle": 100,
  "brake": 0,
  "rpm": 12000,
  "n_gear": 8
}
```

([OpenF1][3])

---

## Laps

Untuk sektor dan lap time.

```javascript
https://api.openf1.org/v1/laps
```

---

## Pit

```javascript
https://api.openf1.org/v1/pit
```

([OpenF1][3])

---

## Weather

```javascript
https://api.openf1.org/v1/weather
```

---

## Race Control

```javascript
https://api.openf1.org/v1/race_control
```

Untuk:

* Yellow Flag
* Red Flag
* Safety Car
* VSC

([OpenF1][3])

---

# Replay Engine

Ini bagian paling penting.

Jangan polling API terus.

Saat user memilih race:

```javascript
loadRace(sessionKey);
```

lalu download semua data:

```javascript
Promise.all([
    positions,
    locations,
    telemetry,
    laps,
    weather,
    raceControl
]);
```

simpan ke memory:

```javascript
store.raceData = {
    positions,
    locations,
    telemetry,
    laps,
    weather,
    raceControl
};
```

---

# Timeline System

Misalnya:

```javascript
replayTime = 0
```

Saat Play:

```javascript
setInterval(() => {
   replayTime += 1000;
},1000);
```

Cari semua event yang timestampnya <= replayTime

```javascript
currentEvents = allEvents.filter(
   e => e.timestamp <= replayTime
);
```

---

# Replay Speed

```javascript
1x
2x
4x
8x
16x
32x
```

Contoh:

```javascript
replayTime += delta * replaySpeed;
```

---

# Track Map

OpenF1 memberikan:

```javascript
x
y
z
```

yang dapat diplot langsung.

Contoh:

```javascript
ctx.arc(
   point.x,
   point.y,
   4,
   0,
   Math.PI * 2
);
```

([OpenF1][3])

---

# Leaderboard

Contoh:

```text
P1 VER
P2 NOR +2.3
P3 LEC +5.8
P4 HAM +6.1
```

Update setiap:

```javascript
position endpoint
```

([OpenF1][3])

---

# Telemetry Panel

Saat klik driver:

```javascript
VER
```

load:

```javascript
speed
throttle
brake
gear
rpm
drs
```

dan render:

```html
Chart.js
```

---

# Race Control Feed

Contoh:

```text
[12:10]
YELLOW FLAG

[12:18]
SAFETY CAR

[12:32]
GREEN FLAG
```

Sumber:

```javascript
race_control
```

([OpenF1][3])

---

# Optimisasi Untuk GitHub Pages

Karena GitHub Pages tidak punya backend:

## Jangan Query API Saat Replay

Saat user memilih race:

```javascript
Download sekali
```

Lalu:

```javascript
Cache API
```

Gunakan:

```javascript
localStorage
```

atau

```javascript
IndexedDB
```

---

Contoh:

```javascript
indexedDB
└── session_9876
      ├── telemetry
      ├── positions
      ├── laps
      ├── weather
      └── race_control
```

---

# Fitur V2 Yang Sangat Worth It

### Driver Tracker

Klik VER

kamera fokus ke Verstappen.

---

### Overtake Detector

Gunakan:

```javascript
position endpoint
```

Jika:

```javascript
P2 → P1
```

munculkan:

```text
OVERTAKE
VER > NOR
```

OpenF1 bahkan punya endpoint overtake khusus. ([OpenF1][3])

---

### Pit Prediction

Hitung:

```javascript
pit loss
```

dan estimasi posisi keluar pit.

---

### Tyre History

Gunakan:

```javascript
stints
```

Menampilkan:

```text
M
M
H
H
S
```

per driver. ([OpenF1][3])

---

# Roadmap Ideal

```text
V1
├─ Session Loader
├─ Replay Engine
├─ Leaderboard
├─ Track Map
└─ Replay Controls

V2
├─ Telemetry
├─ Weather
├─ Race Control
├─ Tyre Stints
└─ Pit Stops

V3
├─ Team Radio
├─ Overtake Feed
├─ Driver Focus Camera
├─ Sector Analysis
└─ Championship Live Update

V4
├─ Full Race Center
├─ Multi Driver Telemetry
├─ AI Commentary
└─ Broadcast Sync
```

Jika targetmu adalah aplikasi **Vanilla JS murni + GitHub Pages**, saya justru menyarankan arsitektur **event-driven replay engine** (mirip game engine kecil) dibanding SPA framework. Untuk replay telemetry F1, pendekatan itu jauh lebih ringan, performanya tinggi, dan sangat cocok untuk deployment statis di GitHub Pages.

