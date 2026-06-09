import { store } from "../core/store.js";
import { eventBus } from "../core/event-bus.js";
import { telemetryService } from "../services/telemetry-service.js";

export class TrackMap {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext("2d");

    // Inisialisasi awal variabel bounding box & skala
    this.bounds = {
      minX: Infinity,
      maxX: -Infinity,
      minY: Infinity,
      maxY: -Infinity,
    };
    this.scaleX = 1;
    this.scaleY = 1;
    this.offsetX = 0;
    this.offsetY = 0;

    this.trackCanvas = null;
    this.resizeObserver = null;
    this.driverCache = new Map(); // Mengoptimalkan pencarian data pembalap secara instan

    // Bind methods agar aman saat dicopot pada fungsi destroy()
    this.handlePlaybackUpdate = this.handlePlaybackUpdate.bind(this);
    this.handleSessionReady = this.handleSessionReady.bind(this);
    this.handleDriverSelection = this.handleDriverSelection.bind(this);

    this.init();
  }

  init() {
    eventBus.on("playback:update", this.handlePlaybackUpdate);
    eventBus.on("session:ready", this.handleSessionReady);
    eventBus.on("driver:selected", this.handleDriverSelection);

    // FIX: Pasang ResizeObserver agar peta otomatis presisi saat ukuran layar berubah
    if (this.canvas.parentElement) {
      this.resizeObserver = new ResizeObserver(() => this.handleResize());
      this.resizeObserver.observe(this.canvas.parentElement);
    }
  }

  handlePlaybackUpdate(timestamp) {
    this.update(timestamp);
  }

  handleSessionReady() {
    this.buildDriverCache();
    this.calculateBounds();
    this.preRenderTrack();
    this.update(0);
  }

  handleDriverSelection(driverNumber) {
    // FIX BUG LOGIKA STATE: Sinkronisasi kedua target penulisan state demi keamanan UI
    if (store.ui) store.ui.selectedDriver = driverNumber;
    store.setState("selectedDriver", driverNumber);

    const currentTime = store.playback?.currentTime || 0;
    this.update(currentTime); // Re-render instan untuk memberikan highlight cyan
  }

  // Mempercepat pencarian warna tim dan akronim nama pembalap di dalam loop render utama
  buildDriverCache() {
    this.driverCache.clear();
    if (!store.drivers) return;
    store.drivers.forEach((d) => {
      this.driverCache.set(String(d.driver_number), {
        teamColor: d.team_colour ? `#${d.team_colour}` : "#ffffff",
        acronym: d.name_acronym || String(d.driver_number),
      });
    });
  }

  // FIX: Scan koordinat secara linear untuk menghindari Call Stack Overflow jika data sangat besar
  calculateBounds() {
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    let hasData = false;

    if (!store.driverData) return;

    for (const driverNumber in store.driverData) {
      const locations = store.driverData[driverNumber]?.locations;
      if (!locations) continue;

      for (let i = 0; i < locations.length; i++) {
        const loc = locations[i];
        if (loc.x < minX) minX = loc.x;
        if (loc.x > maxX) maxX = loc.x;
        if (loc.y < minY) minY = loc.y;
        if (loc.y > maxY) maxY = loc.y;
        hasData = true;
      }
    }

    if (!hasData) return;
    this.bounds = { minX, maxX, minY, maxY };

    this.resize();
    this.updateScaleFactors();
  }

  // OPTIMASI: Hitung matriks transformasi sekali saja, jangan diulang 60 kali per detik
  updateScaleFactors() {
    if (this.bounds.minX === Infinity) return;

    const dataWidth = this.bounds.maxX - this.bounds.minX;
    const dataHeight = this.bounds.maxY - this.bounds.minY;
    const dataAspectRatio = dataWidth / dataHeight;
    const canvasAspectRatio = this.canvas.width / this.canvas.height;

    let renderWidth, renderHeight;
    this.offsetX = 0;
    this.offsetY = 0;

    if (dataAspectRatio > canvasAspectRatio) {
      renderWidth = this.canvas.width;
      renderHeight = renderWidth / dataAspectRatio;
      this.offsetY = (this.canvas.height - renderHeight) / 2;
    } else {
      renderHeight = this.canvas.height;
      renderWidth = renderHeight * dataAspectRatio;
      this.offsetX = (this.canvas.width - renderWidth) / 2;
    }

    this.scaleX = renderWidth / dataWidth;
    this.scaleY = renderHeight / dataHeight;
  }

  // Fungsi helper transformasi koordinat sirkuit F1 ke pixel koordinat Canvas
  transformX(x) {
    return this.offsetX + (x - this.bounds.minX) * this.scaleX;
  }

  transformY(y) {
    // Balik sumbu Y karena koordinat Cartesian F1 berbanding terbalik dengan ordinat pixel HTML5 Canvas
    return this.offsetY + (this.bounds.maxY - y) * this.scaleY;
  }

  preRenderTrack() {
    if (this.bounds.minX === Infinity) return;

    this.trackCanvas = document.createElement("canvas");
    this.trackCanvas.width = this.canvas.width;
    this.trackCanvas.height = this.canvas.height;
    const tCtx = this.trackCanvas.getContext("2d");

    // Cari pembalap pertama mana saja yang datanya lengkap untuk ditarik sebagai basis garis sirkuit
    let trackPoints = null;
    if (store.drivers) {
      for (const driver of store.drivers) {
        const pts = store.driverData?.[driver.driver_number]?.locations;
        if (pts && pts.length > 0) {
          trackPoints = pts;
          break;
        }
      }
    }

    if (!trackPoints || trackPoints.length === 0) return;

    tCtx.beginPath();
    tCtx.strokeStyle = "#38383f"; // Warna abu aspal gelap lintasan
    tCtx.lineWidth = 10;
    tCtx.lineCap = "round";
    tCtx.lineJoin = "round";

    tCtx.moveTo(
      this.transformX(trackPoints[0].x),
      this.transformY(trackPoints[0].y)
    );
    for (let i = 1; i < trackPoints.length; i++) {
      tCtx.lineTo(
        this.transformX(trackPoints[i].x),
        this.transformY(trackPoints[i].y)
      );
    }
    tCtx.stroke();

    // Menggambar Garis Start / Finish (Silang Bendera)
    const startPoint = trackPoints[0];
    const sx = this.transformX(startPoint.x);
    const sy = this.transformY(startPoint.y);

    tCtx.beginPath();
    tCtx.strokeStyle = "#ffffff";
    tCtx.lineWidth = 3;
    tCtx.moveTo(sx - 10, sy - 10);
    tCtx.lineTo(sx + 10, sy + 10);
    tCtx.moveTo(sx + 10, sy - 10);
    tCtx.lineTo(sx - 10, sy + 10);
    tCtx.stroke();
  }

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    this.canvas.width = parent.clientWidth;
    this.canvas.height = parent.clientHeight;
  }

  handleResize() {
    this.resize();
    this.updateScaleFactors();
    this.preRenderTrack();
    const currentTime = store.playback?.currentTime || 0;
    this.update(currentTime);
  }

  update(timestamp) {
    if (!telemetryService) return;
    const currentLocations = telemetryService.getAllLocations(timestamp);
    if (currentLocations) {
      this.draw(currentLocations);
    }
  }

  draw(currentLocations) {
    if (!this.ctx || this.bounds.minX === Infinity) return;

    // Bersihkan area frame canvas utama
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Cetak background sirkuit statis dari offscreen canvas (Sangat Cepat!)
    if (this.trackCanvas) {
      this.ctx.drawImage(this.trackCanvas, 0, 0);
    }

    const activeSelectedDriver =
      store.ui?.selectedDriver || store.selectedDriver;

    // Render dot lingkaran kecil penanda posisi mobil masing-masing pembalap
    for (const [driverNumber, loc] of Object.entries(currentLocations)) {
      if (!loc || typeof loc.x !== "number" || typeof loc.y !== "number")
        continue;

      const cachedDriver = this.driverCache.get(String(driverNumber));
      const teamColor = cachedDriver ? cachedDriver.teamColor : "#ffffff";
      const acronym = cachedDriver ? cachedDriver.acronym : driverNumber;

      const x = this.transformX(loc.x);
      const y = this.transformY(loc.y);
      const isSelected = String(driverNumber) === String(activeSelectedDriver);

      this.ctx.beginPath();

      if (isSelected) {
        // Gambar cincin glow luar warna Cyan terang untuk mobil yang sedang dipilih user
        this.ctx.arc(x, y, 8, 0, Math.PI * 2);
        this.ctx.fillStyle = teamColor;
        this.ctx.strokeStyle = "#00f0ff";
        this.ctx.lineWidth = 3;
        this.ctx.fill();
        this.ctx.stroke();
      } else {
        // Gambar bulatan standar untuk pembalap lain
        this.ctx.arc(x, y, 5, 0, Math.PI * 2);
        this.ctx.fillStyle = teamColor;
        this.ctx.strokeStyle = "#ffffff";
        this.ctx.lineWidth = 1;
        this.ctx.fill();
        this.ctx.stroke();
      }

      // Tampilkan teks inisial pembalap (misal: VER, HAM, LEC) di samping titik koordinatnya
      this.ctx.fillStyle = isSelected ? "#00f0ff" : "#ffffff";
      this.ctx.font = isSelected ? "bold 11px sans-serif" : "10px sans-serif";
      this.ctx.fillText(acronym, x + 9, y + 4);
    }
  }

  // Fungsi pembersihan total untuk mencegah penumpukan alokasi memori
  destroy() {
    eventBus.off("playback:update", this.handlePlaybackUpdate);
    eventBus.off("session:ready", this.handleSessionReady);
    eventBus.off("driver:selected", this.handleDriverSelection);

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    this.driverCache.clear();
    this.trackCanvas = null;
    this.ctx = null;
  }
}
