import { eventBus } from "../core/event-bus.js";
import { replayEngine } from "../core/replay-engine.js";
import { store } from "../core/store.js";

export class WeatherDisplay {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.elements = {};

    this.handlePlaybackUpdate = this.handlePlaybackUpdate.bind(this);
    this.handleSessionReady = this.handleSessionReady.bind(this);

    this.init();
  }

  init() {
    if (!this.container) return;
    eventBus.on("playback:update", this.handlePlaybackUpdate);
    eventBus.on("session:ready", this.handleSessionReady);
    this.renderBase();
  }

  handlePlaybackUpdate(timestamp) {
    this.update(timestamp);
  }

  handleSessionReady() {
    this.renderBase();
    this.update(store.playback?.currentTime || 0);
  }

  renderBase() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="w-cond-header">WEATHER CONDITIONS</div>
      <div class="w-cond-main-sec">
        <div class="w-cond-bg-art"></div>
        <div class="w-cond-status" id="weather-status-text">DRY</div>
        <div class="w-cond-temp">
          <span id="weather-air-temp" class="w-temp-c">--°C</span>
          <span id="weather-air-temp-f" class="w-temp-f">--°F</span>
        </div>
      </div>
      
      <div class="w-cond-details">
        <div class="w-cond-row">
          <div class="w-row-label">TRACK TEMP</div>
          <div class="w-row-content">
            <div class="w-icon-therm"></div>
            <div class="w-data-wrap">
              <div class="w-data-main">
                <span id="weather-track-temp">--°C</span>
                <span id="weather-track-temp-f" class="w-sub-val">--°F</span>
              </div>
              <div class="w-data-desc" id="weather-track-desc">NORMAL</div>
            </div>
          </div>
        </div>

        <div class="w-cond-row">
          <div class="w-row-label">HUMIDITY</div>
          <div class="w-row-content">
            <div class="w-icon-drop"></div>
            <div class="w-data-wrap">
              <div class="w-data-main" id="weather-humidity">--%</div>
              <div class="w-data-desc" id="weather-humidity-desc">OPTIMAL</div>
            </div>
          </div>
        </div>

        <div class="w-cond-row">
          <div class="w-row-label">WIND</div>
          <div class="w-row-content">
            <div class="w-icon-wind"></div>
            <div class="w-data-wrap">
              <div class="w-data-main">
                <span id="weather-wind-speed">--</span>
                <span class="w-unit-sm">KM/H</span>
              </div>
              <div class="w-data-desc" id="weather-wind-direction">NORTH</div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.elements = {
      status: document.getElementById("weather-status-text"),
      airTemp: document.getElementById("weather-air-temp"),
      airTempF: document.getElementById("weather-air-temp-f"),
      trackTemp: document.getElementById("weather-track-temp"),
      trackTempF: document.getElementById("weather-track-temp-f"),
      trackDesc: document.getElementById("weather-track-desc"),
      windSpeed: document.getElementById("weather-wind-speed"),
      windDirection: document.getElementById("weather-wind-direction"),
      humidity: document.getElementById("weather-humidity"),
      humidityDesc: document.getElementById("weather-humidity-desc"),
    };
  }

  update(timestamp) {
    if (!this.elements.airTemp) return;
    const weatherData = replayEngine.getCurrentData("weather", timestamp);
    if (!weatherData) {
      this.clearDisplay();
      return;
    }

    const airC = Math.round(weatherData.air_temp || 0);
    const airF = Math.round((airC * 9) / 5 + 32);
    const trackC = Math.round(weatherData.track_temp || 0);
    const trackF = Math.round((trackC * 9) / 5 + 32);
    const rain = Number(weatherData.rainfall) > 0;

    this.elements.status.textContent = rain ? "RAIN" : "DRY";
    this.elements.status.className = `w-cond-status ${rain ? "status-rain" : "status-dry"}`;
    
    this.elements.airTemp.textContent = `${airC}°C`;
    this.elements.airTempF.textContent = `${airF}°F`;
    this.elements.trackTemp.textContent = `${trackC}°C`;
    this.elements.trackTempF.textContent = `${trackF}°F`;
    
    this.elements.trackDesc.textContent = trackC > 40 ? "HIGH" : trackC < 20 ? "LOW" : "NORMAL";
    this.elements.humidity.textContent = `${Math.round(weatherData.humidity)}%`;
    this.elements.humidityDesc.textContent = weatherData.humidity > 70 ? "HIGH" : "OPTIMAL";
    
    this.elements.windSpeed.textContent = weatherData.wind_speed || "0.0";
    this.elements.windDirection.textContent = this.getWindDirectionName(weatherData.wind_direction);
  }

  getWindDirectionName(degree) {
    if (degree === undefined || degree === null) return "NORTH";
    const sectors = ["NORTH", "NORTH EAST", "EAST", "SOUTH EAST", "SOUTH", "SOUTH WEST", "WEST", "NORTH WEST"];
    return sectors[Math.round(degree / 45) % 8];
  }

  valueOrDash(value) {
    return value !== undefined && value !== null ? value : "--";
  }

  clearDisplay() {
    this.elements.airTemp.textContent = "--°C";
    this.elements.trackTemp.textContent = "--°C";
    this.elements.windSpeed.textContent = "-- km/h";
    this.elements.windDirection.textContent = "--";
    this.elements.humidity.textContent = "--%";
    this.elements.pressure.textContent = "-- hPa";
  }

  destroy() {
    eventBus.off("playback:update", this.handlePlaybackUpdate);
    eventBus.off("session:ready", this.handleSessionReady);
    this.elements = {};
    if (this.container) this.container.innerHTML = "";
  }
}
