import { db } from "./db.js";

const API_BASE_URL = "https://api.openf1.org/v1";

class RequestQueue {
  constructor(concurrency = 1) {
    this.concurrency = concurrency;
    this.running = 0;
    this.queue = [];
    this.lastRequestTime = 0;
    this.minInterval = 500;
  }

  async add(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.next();
    });
  }

  async next() {
    if (this.running >= this.concurrency || this.queue.length === 0) return;

    const now = Date.now();
    const timeSinceLast = now - this.lastRequestTime;

    if (timeSinceLast < this.minInterval) {
      setTimeout(() => this.next(), this.minInterval - timeSinceLast);
      return;
    }

    this.running++;
    this.lastRequestTime = Date.now();
    const { fn, resolve, reject } = this.queue.shift();

    try {
      const result = await fn();
      resolve(result);
    } catch (err) {
      reject(err);
    } finally {
      this.running--;
      this.next();
    }
  }
}

const queue = new RequestQueue(1);
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

async function fetchWithRetry(url, options = {}, retries = 10, backoff = 5000) {
  const cached = await db.get(url);
  if (cached) {
    return cached;
  }

  return queue.add(async () => {
    let currentRetries = retries;
    let currentBackoff = backoff;

    // Menggunakan loop untuk retry agar tidak menyebabkan queue deadlock
    while (true) {
      try {
        const response = await fetch(url, options);

        if (response.status === 429) {
          if (currentRetries > 0) {
            const retryAfter = response.headers.get("Retry-After");
            const waitTime = retryAfter
              ? parseInt(retryAfter) * 1000
              : currentBackoff;
            console.warn(`429 error, waiting ${waitTime}ms for ${url}`);
            await delay(waitTime);
            currentRetries--;
            currentBackoff *= 1.5;
            continue; // Coba lagi di loop yang sama
          }
        }

        if (!response.ok)
          throw new Error(`HTTP error! status: ${response.status}`);

        const data = await response.json();
        await db.set(url, data);
        return data;
      } catch (error) {
        // Menangani error jaringan
        if (currentRetries > 0) {
          await delay(currentBackoff);
          currentRetries--;
          currentBackoff *= 2;
          continue;
        }
        throw error;
      }
    }
  });
}

export const F1Api = {
  async fetchSessions(year, sessionName) {
    let url = `${API_BASE_URL}/sessions?year=${year}`;
    if (sessionName && sessionName !== "%") {
      url += `&session_name=${sessionName}`;
    }
    return fetchWithRetry(url);
  },
  async fetchDrivers(sessionKey) {
    return fetchWithRetry(`${API_BASE_URL}/drivers?session_key=${sessionKey}`);
  },
  async fetchPositions(sessionKey, driverNumber) {
    let url = `${API_BASE_URL}/position?session_key=${sessionKey}`;
    if (driverNumber) url += `&driver_number=${driverNumber}`;
    return fetchWithRetry(url);
  },
  async fetchLocations(sessionKey, driverNumber) {
    let url = `${API_BASE_URL}/location?session_key=${sessionKey}`;
    if (driverNumber) url += `&driver_number=${driverNumber}`;
    return fetchWithRetry(url);
  },
  async fetchCarData(sessionKey, driverNumber) {
    let url = `${API_BASE_URL}/car_data?session_key=${sessionKey}`;
    if (driverNumber) url += `&driver_number=${driverNumber}`;
    return fetchWithRetry(url);
  },
  async fetchLaps(sessionKey) {
    return fetchWithRetry(`${API_BASE_URL}/laps?session_key=${sessionKey}`);
  },
  async fetchWeather(sessionKey) {
    return fetchWithRetry(`${API_BASE_URL}/weather?session_key=${sessionKey}`);
  },
  async fetchRaceControl(sessionKey) {
    return fetchWithRetry(
      `${API_BASE_URL}/race_control?session_key=${sessionKey}`
    );
  },
  async fetchPit(sessionKey) {
    return fetchWithRetry(`${API_BASE_URL}/pit?session_key=${sessionKey}`);
  },
  async fetchStints(sessionKey) {
    return fetchWithRetry(`${API_BASE_URL}/stints?session_key=${sessionKey}`);
  },
};
