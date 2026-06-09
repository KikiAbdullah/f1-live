# F1 Live - Project Structure

## 📂 Directory Tree
```text
f1-live/
├── assets/
│   ├── core/                   # Core application logic and state management
│   │   ├── api.js              # API communication layer (OpenF1/External)
│   │   ├── db.js               # Local data storage/caching logic
│   │   ├── event-bus.js        # Internal messaging system for components
│   │   ├── replay-engine.js    # Logic for handling historical race data replays
│   │   ├── store.js            # Global state management
│   │   └── timeline.js         # Race session timeline management
│   ├── css/
│   │   └── main.css            # Global styles and UI themes
│   ├── data/
│   │   └── circuits/           # Circuit-specific data (coordinates, track maps)
│   ├── services/               # Data processing and specialized services
│   │   ├── position-service.js # Driver position and interval calculations
│   │   └── telemetry-service.js# Telemetry data stream processing
│   └── ui/                     # UI Components and visual modules
│       ├── controls.js         # Playback, session, and view controls
│       ├── leaderboard.js      # Live timing and leaderboard component
│       ├── pit-stops.js        # Pit stop monitoring and history
│       ├── race-feed.js        # Official race commentary/event feed
│       ├── session-selector.js # Interface for choosing race sessions
│       ├── telemetry.js        # Real-time telemetry charts and data
│       ├── trackmap.js         # Interactive GPS track visualization
│       └── weather.js          # Track and ambient weather information
├── index.html                  # Main entry point
├── STEP1.md                    # Documentation - Phase 1
└── STEP2.md                    # Documentation - Phase 2
```

## 🛠️ Key Components Description

### **Core (`/assets/core`)**
The brain of the application. It handles data fetching, state synchronization, and the "Event Bus" which allows different UI components to talk to each other without being tightly coupled.

### **Services (`/assets/services`)**
Specialized modules that take raw data from the Core and transform it into usable information for the UI (e.g., calculating gaps between drivers or interpolating GPS positions).

### **UI Components (`/assets/ui`)**
Self-contained modules responsible for rendering specific parts of the dashboard. Each component subscribes to the Event Bus to receive updates.

### **Data (`/assets/data`)**
Static assets and configuration files, such as circuit layouts or driver information that doesn't change during a session.
