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
    this.zoom = 1;

    this.trackCanvas = null;
    this.resizeObserver = null;
    this.driverCache = new Map();
    this.driverMarkers = new Map(); // Store screen coordinates for hit testing
    this.hoveredDriver = null;
    this.isDragging = false;
    this.lastMousePos = { x: 0, y: 0 };
    this.panOffset = { x: 0, y: 0 };

    // Bind methods
    this.handlePlaybackUpdate = this.handlePlaybackUpdate.bind(this);
    this.handleSessionReady = this.handleSessionReady.bind(this);
    this.handleDriverSelection = this.handleDriverSelection.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
    this.handleWheel = this.handleWheel.bind(this);

    this.init();
  }

  init() {
    eventBus.on("playback:update", this.handlePlaybackUpdate);
    eventBus.on("session:ready", this.handleSessionReady);
    eventBus.on("driver:selected", this.handleDriverSelection);

    this.canvas.addEventListener("click", this.handleClick);
    this.canvas.addEventListener("mousedown", this.handleMouseDown);
    this.canvas.addEventListener("mousemove", this.handleMouseMove);
    this.canvas.addEventListener("mouseup", this.handleMouseUp);
    this.canvas.addEventListener("mouseleave", this.handleMouseUp);
    this.canvas.addEventListener("wheel", this.handleWheel, { passive: false });

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
    
    // Gunakan uniform scaling (rasio aspek yang sama untuk X dan Y agar tidak gepeng)
    const scale = Math.min(
      (this.canvas.width * 0.9) / dataWidth,
      (this.canvas.height * 0.9) / dataHeight
    );

    this.scaleX = scale;
    this.scaleY = scale;

    // Hitung offset agar sirkuit berada di tengah canvas
    this.offsetX = (this.canvas.width - dataWidth * scale) / 2;
    this.offsetY = (this.canvas.height - dataHeight * scale) / 2;
  }

  // Fungsi helper transformasi koordinat sirkuit F1 ke pixel koordinat Canvas
  transformX(x) {
    const baseX = this.offsetX + (x - this.bounds.minX) * this.scaleX;
    return this.canvas.width / 2 + (baseX - this.canvas.width / 2) * this.zoom + this.panOffset.x;
  }

  transformY(y) {
    // Balik sumbu Y karena koordinat Cartesian F1 berbanding terbalik dengan ordinat pixel HTML5 Canvas
    const baseY = this.offsetY + (this.bounds.maxY - y) * this.scaleY;
    return this.canvas.height / 2 + (baseY - this.canvas.height / 2) * this.zoom + this.panOffset.y;
  }

  handleMouseDown(e) {
    this.isDragging = true;
    this.lastMousePos = { x: e.clientX, y: e.clientY };
    this.canvas.style.cursor = "grabbing";
  }

  handleMouseUp() {
    this.isDragging = false;
    this.canvas.style.cursor = "crosshair";
  }

  handleMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (this.isDragging) {
      const dx = e.clientX - this.lastMousePos.x;
      const dy = e.clientY - this.lastMousePos.y;
      this.panOffset.x += dx;
      this.panOffset.y += dy;
      this.lastMousePos = { x: e.clientX, y: e.clientY };
      this.update(store.playback?.currentTime || 0);
      return;
    }

    // Hover Detection
    let foundHover = null;
    for (const [driverNumber, pos] of this.driverMarkers.entries()) {
      const dist = Math.sqrt((mouseX - pos.x) ** 2 + (mouseY - pos.y) ** 2);
      if (dist < 15) {
        foundHover = driverNumber;
        break;
      }
    }

    if (this.hoveredDriver !== foundHover) {
      this.hoveredDriver = foundHover;
      this.canvas.style.cursor = foundHover ? "pointer" : "crosshair";
      this.update(store.playback?.currentTime || 0);
    }
  }

  handleWheel(e) {
    e.preventDefault();
    const zoomSpeed = 0.001;
    const delta = -e.deltaY;
    const oldZoom = this.zoom;
    this.zoom = Math.max(0.4, Math.min(this.zoom + delta * zoomSpeed, 5));
    
    // Zoom focus ke arah mouse (opsional, sederhana saja dulu)
    this.update(store.playback?.currentTime || 0);
  }

  handleClick(event) {
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    let clickedDriver = null;
    let minDistance = 20; // Radius toleransi klik dalam pixel

    for (const [driverNumber, pos] of this.driverMarkers.entries()) {
      const dx = mouseX - pos.x;
      const dy = mouseY - pos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < minDistance) {
        minDistance = distance;
        clickedDriver = driverNumber;
      }
    }

    if (clickedDriver) {
      const currentSelected = store.ui?.selectedDriver || store.selectedDriver;
      const newSelected = String(currentSelected) === String(clickedDriver) ? null : clickedDriver;
      eventBus.emit("driver:selected", newSelected);
    } else {
      // Jika klik di area kosong, unselect juga
      eventBus.emit("driver:selected", null);
    }
  }

  preRenderTrack() {
    if (this.bounds.minX === Infinity) return;

    // Simpan state zoom & pan saat ini
    const currentZoom = this.zoom;
    const currentPan = { ...this.panOffset };

    // Paksa render pada skala dasar (Zoom 1, Pan 0) agar buffer bersih
    this.zoom = 1;
    this.panOffset = { x: 0, y: 0 };

    const bufferScale = 3;
    this.trackCanvas = document.createElement("canvas");
    this.trackCanvas.width = this.canvas.width * bufferScale;
    this.trackCanvas.height = this.canvas.height * bufferScale;
    const tCtx = this.trackCanvas.getContext("2d");
    
    tCtx.translate(
        (this.trackCanvas.width - this.canvas.width) / 2,
        (this.trackCanvas.height - this.canvas.height) / 2
    );

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

    if (trackPoints && trackPoints.length > 0) {
      this.drawTrackSegments(tCtx, trackPoints);
      this.renderCircuitMetadata(tCtx);

      // Menggambar Garis Start / Finish (Checkered Pattern)
      const startPoint = trackPoints[0];
      const sx = this.transformX(startPoint.x);
      const sy = this.transformY(startPoint.y);

      const nextPt = trackPoints[1] || trackPoints[0];
      const dx = this.transformX(nextPt.x) - sx;
      const dy = this.transformY(nextPt.y) - sy;
      const angle = Math.atan2(dy, dx) + Math.PI / 2;

      tCtx.save();
      tCtx.translate(sx, sy);
      tCtx.rotate(angle);

      const boxSize = 4;
      for (let row = -1; row <= 1; row++) {
        for (let col = -2; col <= 2; col++) {
          tCtx.fillStyle = (row + col) % 2 === 0 ? "#ffffff" : "#000000";
          tCtx.fillRect(col * boxSize, row * boxSize, boxSize, boxSize);
        }
      }
      
      tCtx.rotate(-angle);
      tCtx.fillStyle = "#ffffff";
      tCtx.font = "bold 10px sans-serif";
      tCtx.textAlign = "center";
      tCtx.fillText("START / FINISH", 0, -15);
      tCtx.restore();
    }

    // Kembalikan state zoom & pan ke aslinya
    this.zoom = currentZoom;
    this.panOffset = currentPan;
  }

  drawTrackSegments(tCtx, trackPoints) {
    const sectorCount = 3;
    const totalSegments = Math.max(trackPoints.length - 1, 1);

    this.strokePath(tCtx, trackPoints, 0, totalSegments, 18, "#0a0a0d");
    this.strokePath(tCtx, trackPoints, 0, totalSegments, 12, "#37373e");
    this.strokePath(tCtx, trackPoints, 0, totalSegments, 6, "#f5e100");

    for (let segmentIndex = 0; segmentIndex < sectorCount; segmentIndex++) {
      const startIndex = Math.floor((segmentIndex * totalSegments) / sectorCount);
      const endIndex = Math.floor(((segmentIndex + 1) * totalSegments) / sectorCount);
      this.strokePath(tCtx, trackPoints, startIndex, endIndex, 2, "rgba(255, 255, 255, 0.16)");
    }

    this.drawPitLane(tCtx);
  }

  strokePath(tCtx, points, startIndex, endIndex, width, color) {
    if (!points || points.length < 2) return;
    const start = Math.max(0, Math.min(startIndex, points.length - 1));
    const end = Math.max(start + 1, Math.min(endIndex + 1, points.length));

    tCtx.beginPath();
    tCtx.strokeStyle = color;
    tCtx.lineWidth = width;
    tCtx.lineCap = "round";
    tCtx.lineJoin = "round";
    tCtx.moveTo(this.transformX(points[start].x), this.transformY(points[start].y));
    for (let i = start + 1; i < end; i++) {
      tCtx.lineTo(this.transformX(points[i].x), this.transformY(points[i].y));
    }
    tCtx.stroke();
  }

  drawPitLane(tCtx) {
    const info = store.raceData?.circuitInfo;
    if (!info) return;

    const pitLaneCandidates = [
      info.pitLane,
      info.pit_lane,
      info.pitLanePoints,
      info.pitLaneCoordinates,
      info.pitEntry,
      info.pitExit,
    ].filter(Boolean);

    if (pitLaneCandidates.length === 0) return;

    const candidate = pitLaneCandidates[0];
    const points = Array.isArray(candidate) ? candidate : candidate.points || candidate.coordinates || [];
    if (!points || points.length < 2) return;

    tCtx.save();
    tCtx.beginPath();
    tCtx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    tCtx.lineWidth = 6;
    tCtx.setLineDash([8, 8]);
    tCtx.lineCap = "round";
    tCtx.lineJoin = "round";
    tCtx.moveTo(this.transformX(points[0].x), this.transformY(points[0].y));
    for (let i = 1; i < points.length; i++) {
      tCtx.lineTo(this.transformX(points[i].x), this.transformY(points[i].y));
    }
    tCtx.stroke();
    tCtx.restore();
  }

  renderCircuitMetadata(tCtx) {
    const info = store.raceData?.circuitInfo;
    if (!info) return;

    // 1. Render Sectors (S1, S2, S3)
    // Sectors are usually at specific marshal sectors
    const sectorLabels = { 1: "SECTOR 1", 2: "SECTOR 2", 3: "SECTOR 3" };
    const sectorsDrawn = new Set();

    if (info.marshalSectors) {
      info.marshalSectors.forEach((ms) => {
        const x = this.transformX(ms.trackPosition.x);
        const y = this.transformY(ms.trackPosition.y);

        // Simple heuristic: Draw sector label at the start of each sector if possible
        // or just draw the sector boundary line

        // Let's draw sector numbers if they exist in the metadata
        if (ms.sector && !sectorsDrawn.has(ms.sector)) {
          tCtx.fillStyle = "rgba(255, 255, 255, 0.8)";
          tCtx.font = "bold 12px sans-serif";
          tCtx.textAlign = "center";

          // Add Background for sector label
          const label = sectorLabels[ms.sector] || `S${ms.sector}`;
          const metrics = tCtx.measureText(label);
          const padding = 4;

          tCtx.fillStyle = "rgba(0, 0, 0, 0.6)";
          tCtx.fillRect(
            x - metrics.width / 2 - padding,
            y + 15 - padding,
            metrics.width + padding * 2,
            12 + padding * 2
          );

          tCtx.fillStyle = "#ffffff";
          tCtx.fillText(label, x, y + 27);
          sectorsDrawn.add(ms.sector);

          // Draw a line across the track at sector boundary
          tCtx.beginPath();
          tCtx.strokeStyle = "rgba(255, 255, 255, 0.5)";
          tCtx.lineWidth = 2;
          tCtx.setLineDash([5, 5]);
          tCtx.moveTo(x - 15, y - 15);
          tCtx.lineTo(x + 15, y + 15);
          tCtx.stroke();
          tCtx.setLineDash([]); // Reset dash
        }
      });
    }

    if (info.pitLane || info.pit_lane || info.pitLanePoints || info.pitEntry || info.pitExit) {
      const pitLabelX = this.canvas.width - 140;
      const pitLabelY = this.canvas.height - 24;
      tCtx.fillStyle = "rgba(0, 0, 0, 0.55)";
      tCtx.fillRect(pitLabelX - 8, pitLabelY - 16, 130, 22);
      tCtx.fillStyle = "#ffffff";
      tCtx.font = "bold 10px sans-serif";
      tCtx.textAlign = "left";
      tCtx.fillText("PIT LANE HIGHLIGHTED", pitLabelX, pitLabelY);
    }

    // 2. Render Corners
    if (info.corners) {
      info.corners.forEach((corner) => {
        const x = this.transformX(corner.trackPosition.x);
        const y = this.transformY(corner.trackPosition.y);

        // Draw Corner Circle
        tCtx.beginPath();
        tCtx.arc(x, y, 6, 0, Math.PI * 2);
        tCtx.fillStyle = "#22222b";
        tCtx.strokeStyle = "#ffffff";
        tCtx.lineWidth = 1;
        tCtx.fill();
        tCtx.stroke();

        // Draw Corner Number
        tCtx.fillStyle = "#ffffff";
        tCtx.font = "bold 9px sans-serif";
        tCtx.textAlign = "center";
        tCtx.textBaseline = "middle";
        tCtx.fillText(corner.number, x, y);
      });
    }

    // Render DRS Zones
    if (info.marshalSectors) {
      info.marshalSectors.forEach((ms) => {
        const x = this.transformX(ms.trackPosition.x);
        const y = this.transformY(ms.trackPosition.y);

        if (ms.drsDetection) {
          tCtx.fillStyle = "#ffffff";
          tCtx.font = "bold 8px sans-serif";
          tCtx.textAlign = "left";
          tCtx.fillText("DRS DETECTION", x + 10, y);
          
          tCtx.beginPath();
          tCtx.arc(x, y, 4, 0, Math.PI * 2);
          tCtx.fillStyle = "#ffffff";
          tCtx.fill();
        }

        if (ms.drsActivation) {
          tCtx.fillStyle = "#00f0ff";
          tCtx.font = "bold 8px sans-serif";
          tCtx.textAlign = "left";
          tCtx.fillText("DRS ACTIVATION", x + 10, y);
          
          tCtx.beginPath();
          tCtx.arc(x, y, 4, 0, Math.PI * 2);
          tCtx.fillStyle = "#00f0ff";
          tCtx.fill();
        }
      });
    }
  }

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    this.canvas.width = parent.clientWidth;
    this.canvas.height = parent.clientHeight;
  }

  setZoom(multiplier) {
    this.zoom = Math.max(0.65, Math.min(this.zoom * multiplier, 2.4));
    this.preRenderTrack();
    this.update(store.playback?.currentTime || 0);
  }

  resetView() {
    this.zoom = 1;
    this.panOffset = { x: 0, y: 0 };
    this.updateScaleFactors();
    this.preRenderTrack();
    this.update(store.playback?.currentTime || 0);
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

    // Render Background Lintasan dengan Sinkronisasi Zoom & Pan
    if (this.trackCanvas) {
      this.ctx.save();
      
      // Pindah ke titik pusat canvas
      this.ctx.translate(this.canvas.width / 2 + this.panOffset.x, this.canvas.height / 2 + this.panOffset.y);
      
      // Lakukan scaling (zoom) dari titik pusat
      this.ctx.scale(this.zoom, this.zoom);
      
      // Gambar buffer trackCanvas tepat di tengah
      const drawX = -this.trackCanvas.width / 2;
      const drawY = -this.trackCanvas.height / 2;
      this.ctx.drawImage(this.trackCanvas, drawX, drawY);
      
      this.ctx.restore();
    }

    const activeSelectedDriver = String(
      store.ui?.selectedDriver ?? store.selectedDriver ?? ""
    );

    this.driverMarkers.clear();

    // Render dot lingkaran kecil penanda posisi mobil masing-masing pembalap
    for (const [driverNumber, loc] of Object.entries(currentLocations)) {
      if (!loc || typeof loc.x !== "number" || typeof loc.y !== "number")
        continue;

      const cachedDriver = this.driverCache.get(String(driverNumber));
      const teamColor = cachedDriver ? cachedDriver.teamColor : "#ffffff";
      const acronym = cachedDriver ? cachedDriver.acronym : driverNumber;

      const x = this.transformX(loc.x);
      const y = this.transformY(loc.y);
      const isSelected = String(driverNumber) === activeSelectedDriver;
      const isHovered = String(driverNumber) === this.hoveredDriver;

      this.driverMarkers.set(String(driverNumber), { x, y });
      this.drawDriverMarker(x, y, teamColor, acronym, isSelected || isHovered);
    }
  }

  drawDriverMarker(x, y, teamColor, acronym, isSelected) {
    if (!this.ctx) return;

    this.ctx.save();
    if (isSelected) {
      this.ctx.shadowColor = teamColor;
      this.ctx.shadowBlur = 24;
      this.ctx.beginPath();
      this.ctx.fillStyle = teamColor;
      this.ctx.strokeStyle = "#ffffff";
      this.ctx.lineWidth = 3;
      this.ctx.arc(x, y, 14, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();

      this.ctx.fillStyle = "#ffffff";
      this.ctx.font = "bold 11px sans-serif";
      this.ctx.textAlign = "left";
      this.ctx.textBaseline = "middle";
      this.drawLabelChip(x + 18, y - 2, acronym, teamColor, true);
    } else {
      this.ctx.globalAlpha = 0.55;
      this.ctx.beginPath();
      this.ctx.fillStyle = teamColor;
      this.ctx.strokeStyle = "#26262d";
      this.ctx.lineWidth = 1.5;
      this.ctx.arc(x, y, 6, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();
      
      this.drawLabelChip(x + 10, y - 1, acronym, teamColor, false);
    }
    this.ctx.restore();
  }

  drawLabelChip(x, y, text, accentColor, isSelected = true) {
    if (!this.ctx) return;
    
    if (isSelected) {
      const paddingX = 12;
      this.ctx.font = "bold 12px Titillium Web, sans-serif";
      const textWidth = this.ctx.measureText(text).width;
      const width = textWidth + paddingX * 2;
      const height = 26;

      this.ctx.beginPath();
      this.ctx.fillStyle = "rgba(12, 12, 16, 0.92)";
      this.ctx.strokeStyle = accentColor;
      this.ctx.lineWidth = 2;
      this.roundRect(x, y - height / 2, width, height, 999);
      this.ctx.fill();
      this.ctx.stroke();

      this.ctx.fillStyle = "#ffffff";
      this.ctx.textAlign = "left";
      this.ctx.textBaseline = "middle";
      this.ctx.fillText(text, x + paddingX, y + 1);
    } else {
      this.ctx.font = "bold 8px Titillium Web, sans-serif";
      const textWidth = this.ctx.measureText(text).width;
      const paddingX = 4;
      const width = textWidth + paddingX * 2;
      const height = 14;

      this.ctx.beginPath();
      this.ctx.fillStyle = "rgba(12, 12, 16, 0.4)";
      this.ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
      this.ctx.lineWidth = 1;
      this.roundRect(x, y - height / 2, width, height, 3);
      this.ctx.fill();
      this.ctx.stroke();

      this.ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
      this.ctx.textAlign = "left";
      this.ctx.textBaseline = "middle";
      this.ctx.fillText(text, x + paddingX, y);
    }
  }

  roundRect(x, y, width, height, radius) {
    const ctx = this.ctx;
    if (!ctx) return;
    const r = Math.min(radius, width / 2, height / 2);
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  // Fungsi pembersihan total untuk mencegah penumpukan alokasi memori
  destroy() {
    eventBus.off("playback:update", this.handlePlaybackUpdate);
    eventBus.off("session:ready", this.handleSessionReady);
    eventBus.off("driver:selected", this.handleDriverSelection);

    this.canvas.removeEventListener("click", this.handleClick);

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    this.driverCache.clear();
    this.trackCanvas = null;
    this.ctx = null;
  }
}
