import { eventBus } from "../core/event-bus.js";
import { store } from "../core/store.js";
import { telemetryService } from "../services/telemetry-service.js";

// Memuat pustaka Chart.js secara dinamis via CDN terpercaya
const loadChartJs = () => {
  return new Promise((resolve) => {
    if (typeof Chart !== "undefined") {
      resolve(Chart);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/chart.js";
    script.async = true;
    script.onload = () => resolve(Chart);
    document.head.appendChild(script);
  });
};

export class TelemetryChart {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext("2d");
    this.chart = null;
    this.currentDriver = null;
    this.lastPointId = null;
    this.lastTimestamp = 0;

    // Bind metode agar aman dilepas dari eventBus saat destroy() dipanggil
    this.handleDriverSelection = this.handleDriverSelection.bind(this);
    this.handlePlaybackUpdate = this.handlePlaybackUpdate.bind(this);
    this.handleSeek = this.handleSeek.bind(this);

    this.init();
  }

  async init() {
    // Daftarkan event secepat mungkin untuk mencegah hilangnya sinyal data awal
    eventBus.on("driver:selected", this.handleDriverSelection);
    eventBus.on("playback:update", this.handlePlaybackUpdate);
    eventBus.on("playback:seek", this.handleSeek);

    // Tunggu hingga library Chart.js selesai diunduh
    await loadChartJs();

    // Jika user sudah terlanjur memilih driver sebelum Chart.js termuat, langsung render ulang
    if (this.currentDriver && !this.chart) {
      this.renderChart();
    }
  }

  handleDriverSelection(driverNumber) {
    if (!driverNumber) {
        this.currentDriver = null;
        if (this.chart) {
            this.chart.destroy();
            this.chart = null;
        }
        // Pastikan info panel utama disembunyikan
        const infoPanel = document.getElementById("driver-info-panel");
        if (infoPanel) infoPanel.classList.remove("visible");
        return;
    }
    this.currentDriver = driverNumber;
    
    const infoPanel = document.getElementById("driver-info-panel");
    if (infoPanel) infoPanel.classList.add("visible");

    this.renderChart();

    if (store.playback && typeof store.playback.currentTime === "number") {
      this.update(store.playback.currentTime);
    }
  }

  handlePlaybackUpdate(timestamp) {
    this.update(timestamp);
  }

  // FIX LOGIKA TIMELINE: Jika user melompat waktu atau memutar ulang, bersihkan buffer data lama
  handleSeek() {
    this.lastPointId = null;
    if (this.chart) {
      this.chart.data.labels = [];
      this.chart.data.datasets.forEach((dataset) => (dataset.data = []));
      this.chart.update("none"); // Update instan tanpa animasi render sisa data
    }
  }

  renderChart() {
    if (!this.ctx || !this.currentDriver || typeof Chart === "undefined")
      return;

    // Hancurkan objek chart lama untuk menghindari tumpang tindih memori canvas
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }

    const driver = store.drivers
      ? store.drivers.find(
          (d) => String(d.driver_number) === String(this.currentDriver)
        )
      : null;
    const teamColor = driver?.team_colour
      ? `#${driver.team_colour}`
      : "#ffffff";

    this.chart = new Chart(this.ctx, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "Speed (km/h)",
            data: [],
            borderColor: teamColor,
            backgroundColor: "transparent",
            tension: 0.1,
            pointRadius: 0, // Matikan dot lingkaran kecil agar performa render 60fps mulus
            yAxisID: "y",
          },
          {
            label: "Throttle (%)",
            data: [],
            borderColor: "#f1c40f", // Kuning terang khas throttle F1
            backgroundColor: "transparent",
            tension: 0.1,
            pointRadius: 0,
            yAxisID: "y1",
          },
          {
            label: "Brake",
            data: [],
            borderColor: "#e74c3c", // Merah tegas khas rem F1
            backgroundColor: "transparent",
            tension: 0.1,
            pointRadius: 0,
            yAxisID: "y1",
          },
          {
            label: "RPM",
            data: [],
            borderColor: "#3498db",
            backgroundColor: "transparent",
            tension: 0.1,
            pointRadius: 0,
            hidden: true,
            yAxisID: "y2",
          },
          {
            label: "Gear",
            data: [],
            borderColor: "#2ecc71",
            backgroundColor: "transparent",
            tension: 0.1,
            pointRadius: 0,
            hidden: true,
            yAxisID: "y3",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 0, // Wajib 0 untuk visualisasi data real-time kecepatan tinggi
        },
        scales: {
          x: {
            type: "linear",
            title: {
              display: true,
              text: "Time (seconds)",
              color: "#ffffff",
            },
            ticks: { color: "#ffffff" },
            grid: { color: "rgba(255,255,255,0.05)" },
          },
          y: {
            type: "linear",
            position: "left",
            min: 0,
            max: 360, // Batas atas kecepatan aman mobil F1 terkini
            title: {
              display: true,
              text: "Speed (km/h)",
              color: teamColor,
            },
            ticks: { color: teamColor },
            grid: { color: "rgba(255,255,255,0.05)" },
          },
          y1: {
            type: "linear",
            position: "right",
            min: 0,
            max: 100,
            title: {
              display: true,
              text: "Throttle/Brake (%)",
              color: "#f1c40f",
            },
            ticks: { color: "#f1c40f" },
            grid: { drawOnChartArea: false },
          },
          y2: {
            type: "linear",
            position: "right",
            min: 0,
            max: 15000, // Batas maksimal putaran mesin F1 V6 Turbo Hybrid
            display: false,
          },
          y3: {
            type: "linear",
            position: "right",
            min: 0,
            max: 8, // Gigi 1 sampai 8
            display: false,
          },
        },
        plugins: {
          legend: {
            labels: { color: "#ffffff" },
          },
        },
      },
    });
  }

  update(timestamp) {
    if (!this.chart || !this.currentDriver || !telemetryService) return;

    // PROTEKSI TAMBAHAN: Jika ada lompatan waktu mundur mendadak tanpa lewat event seek
    if (
      timestamp < this.lastTimestamp ||
      Math.abs(timestamp - this.lastTimestamp) > 3000
    ) {
      this.handleSeek();
    }
    this.lastTimestamp = timestamp;

    const telemetry = telemetryService.getDriverTelemetry(
      this.currentDriver,
      timestamp
    );
    if (!telemetry) return;

    const timeInSeconds = timestamp / 1000;
    const maxDataPoints = 120; // 120 titik data sudah cukup mewakili ~10-15 detik pergerakan sirkuit

    // Hindari duplikasi titik data yang sama pada milidetik yang berdekatan
    const pointId = Math.round(timeInSeconds * 10) / 10;
    if (this.lastPointId === pointId) return;
    this.lastPointId = pointId;

    // Dorong data baru ke ekor grafik
    this.chart.data.labels.push(pointId);
    this.chart.data.datasets[0].data.push(telemetry.speed || 0);
    this.chart.data.datasets[1].data.push(telemetry.throttle || 0);
    this.chart.data.datasets[2].data.push((telemetry.brake || 0) * 100);
    this.chart.data.datasets[3].data.push(telemetry.rpm || 0);
    this.chart.data.datasets[4].data.push(telemetry.n_gear || 0);

    // Jika melebihi batas geser (sliding window), buang data terlama dari kepala array
    if (this.chart.data.labels.length > maxDataPoints) {
      this.chart.data.labels.shift();
      this.chart.data.datasets.forEach((dataset) => dataset.data.shift());
    }

    // Jalankan perintah update instan tanpa animasi untuk penghematan daya GPU/CPU browser
    this.chart.update("none");
  }

  // Pembersihan total untuk menghindari Memory Leak saat berganti halaman/tab aplikasi
  destroy() {
    eventBus.off("driver:selected", this.handleDriverSelection);
    eventBus.off("playback:update", this.handlePlaybackUpdate);
    eventBus.off("playback:seek", this.handleSeek);

    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
    this.currentDriver = null;
    this.lastPointId = null;
  }
}
