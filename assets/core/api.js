import { db } from "./db.js";

const API_BASE_URL = "https://api.openf1.org/v1";

class RequestQueue {
  constructor(concurrency = 3) {
    // Dinaikkan ke 3 untuk paralelisme moderat
    this.concurrency = concurrency;
    this.running = 0;
    this.queue = [];
    this.lastRequestTime = 0;
    this.minInterval = 150; // Diturunkan ke 150ms agar jauh lebih cepat
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

    // Jeda dinamis yang lebih pendek
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

// Menggunakan concurrency 3 untuk mempercepat request paralel (misal download data per driver sekaligus)
const queue = new RequestQueue(3);
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

async function fetchWithRetry(url, options = {}, retries = 10, backoff = 3000) {
  const cached = await db.get(url);
  if (cached) {
    return cached;
  }

  // Menambahkan header kompresi agar ukuran data yang di-download mengecil drastis (mempercepat download data besar)
  const defaultOptions = {
    ...options,
    headers: {
      "Accept-Encoding": "gzip, deflate, br",
      ...(options.headers || {}),
    },
  };

  return queue.add(async () => {
    let currentRetries = retries;
    let currentBackoff = backoff;

    while (true) {
      try {
        const response = await fetch(url, defaultOptions);

        if (response.status === 429) {
          if (currentRetries > 0) {
            const retryAfter = response.headers.get("Retry-After");
            // Jika server ngasih tau harus nunggu berapa lama, ikuti. Jika tidak, gunakan backoff dinamis
            const waitTime = retryAfter
              ? parseInt(retryAfter) * 1000
              : currentBackoff;

            console.warn(
              `[429 Rate Limit] Menunggu ${waitTime}ms untuk: ${url}`
            );
            await delay(waitTime);

            currentRetries--;
            currentBackoff *= 2; // Eksponensial backoff diperlebar jika terkena hit limit
            continue;
          }
        }

        if (!response.ok)
          throw new Error(`HTTP error! status: ${response.status}`);

        const data = await response.json();
        await db.set(url, data);
        return data;
      } catch (error) {
        if (currentRetries > 0) {
          console.warn(
            `[Network Error] Gagal koneksi, coba lagi dalam ${currentBackoff}ms. Sisa retry: ${currentRetries}`
          );
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
  async fetchSession(sessionKey) {
    return fetchWithRetry(`${API_BASE_URL}/sessions?session_key=${sessionKey}`);
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
  async fetchCircuitInfo(circuitKey, year) {
    const url = `https://api.multiviewer.app/api/v1/circuits/${circuitKey}/${year}`;
    return fetchWithRetry(url);
  },
};
