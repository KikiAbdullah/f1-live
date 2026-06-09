import { eventBus } from "../core/event-bus.js";
import { store } from "../core/store.js";
import { replayEngine } from "../core/replay-engine.js";

export class WeatherDisplay {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) return;

    // Tempat penyimpanan referensi elemen DOM untuk optimasi pembaruan data
    this.elements = {};

    // Bind metode agar referensi fungsi konsisten saat dilepas di eventBus
    this.handlePlaybackUpdate = this.handlePlaybackUpdate.bind(this);
    this.handleSessionReady = this.handleSessionReady.bind(this);

    this.init();
  }

  init() {
    eventBus.on("playback:update", this.handlePlaybackUpdate);
    eventBus.on("session:ready", this.handleSessionReady);

    // Jika data cuaca sudah termuat di dalam store sebelum inisialisasi kelas ini
    if (store.raceData?.weather?.length > 0) {
      this.renderBase();
    }
  }

  handlePlaybackUpdate(timestamp) {
    this.update(timestamp);
  }

  handleSessionReady() {
    this.renderBase();
  }

  renderBase() {
    if (!this.container) return;

    // Menggunakan nama ID spesifik 'weather-' untuk menghindari tabrakan selektor CSS/JS global
    this.container.innerHTML = `
            <div class="weather-info">
                <div class="weather-item">
                    <span class="weather-label">Air Temp:</span>
                    <span id="weather-air-temp" class="weather-value">--°C</span>
                </div>
                <div class="weather-item">
                    <span class="weather-label">Track Temp:</span>
                    <span id="weather-track-temp" class="weather-value">--°C</span>
                </div>
                <div class="weather-item">
                    <span class="weather-label">Wind Speed:</span>
                    <span id="weather-wind-speed" class="weather-value">-- km/h</span>
                </div>
                <div class="weather-item">
                    <span class="weather-label">Wind Dir:</span>
                    <span id="weather-wind-direction" class="weather-value">--</span>
                </div>
                <div class="weather-item">
                    <span class="weather-label">Humidity:</span>
                    <span id="weather-humidity" class="weather-value">--%</span>
                </div>
                <div class="weather-item">
                    <span class="weather-label">Pressure:</span>
                    <span id="weather-pressure" class="weather-value">-- hPa</span>
                </div>
            </div>
        `;

    // Ambil dan kunci referensi elemen DOM sekali saja ke dalam cache objek memori
    this.elements = {
      airTemp: document.getElementById("weather-air-temp"),
      trackTemp: document.getElementById("weather-track-temp"),
      windSpeed: document.getElementById("weather-wind-speed"),
      windDirection: document.getElementById("weather-wind-direction"),
      humidity: document.getElementById("weather-humidity"),
      pressure: document.getElementById("weather-pressure"),
    };
  }

  update(timestamp) {
    // Keamanan utama: Jika struktur markup dasar belum siap, batalkan operasi pembaruan teks
    if (!this.elements.airTemp) return;

    const weatherData = replayEngine.getCurrentData("weather", timestamp);

    if (weatherData) {
      // Memastikan nilai 0 tetap tercetak dengan benar dan tidak dianggap fallback falsy '--'
      this.elements.airTemp.textContent = `${
        weatherData.air_temp !== undefined ? weatherData.air_temp : "--"
      }°C`;
      this.elements.trackTemp.textContent = `${
        weatherData.track_temp !== undefined ? weatherData.track_temp : "--"
      }°C`;
      this.elements.windSpeed.textContent = `${
        weatherData.wind_speed !== undefined ? weatherData.wind_speed : "--"
      } km/h`;

      // Format arah angin, tambahkan simbol derajat jika berupa angka koordinat kompas
      const windDir = weatherData.wind_direction;
      this.elements.windDirection.textContent =
        windDir !== undefined ? `${windDir}°` : "--";

      this.elements.humidity.textContent = `${
        weatherData.humidity !== undefined ? weatherData.humidity : "--"
      }%`;
      this.elements.pressure.textContent = `${
        weatherData.pressure !== undefined ? weatherData.pressure : "--"
      } hPa`;
    } else {
      this.clearDisplay();
    }
  }

  // Mengosongkan data tampilan saat tidak ada event data cuaca terekam pada timeline tertentu
  clearDisplay() {
    if (!this.elements.airTemp) return;
    this.elements.airTemp.textContent = `--°C`;
    this.elements.trackTemp.textContent = `--°C`;
    this.elements.windSpeed.textContent = `-- km/h`;
    this.elements.windDirection.textContent = `--`;
    this.elements.humidity.textContent = `--%`;
    this.elements.pressure.textContent = `-- hPa`;
  }

  // Siklus pembersihan komponen total untuk mematikan kebocoran RAM browser
  destroy() {
    eventBus.off("playback:update", this.handlePlaybackUpdate);
    eventBus.off("session:ready", this.handleSessionReady);

    this.elements = {};
    if (this.container) {
      this.container.innerHTML = "";
    }
  }
}
