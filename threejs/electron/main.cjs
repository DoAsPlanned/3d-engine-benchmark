const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');
const si = require('systeminformation');

const rootDir = path.resolve(__dirname, '..');
let staticSystemInfoCache = null;
let liveMetricsCache = {
  cpuPercent: null,
  ramPercent: null,
  ramUsedMb: null,
  ramTotalMb: null,
  gpuPercent: null,
  gpuMemoryPercent: null,
  vramPercent: null,
  vramUsedMb: null,
  vramTotalMb: null,
  gpuTemperature: null,
  cpuTemperature: null,
  gpuName: null,
  updatedAt: 0,
};
let metricsTimersStarted = false;

function createWindow() {
  const window = new BrowserWindow({
    width: 1580,
    height: 980,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: '#ececec',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (app.isPackaged) {
    window.loadFile(path.join(rootDir, 'dist', 'index.html'));
  } else {
    window.loadURL('http://localhost:5173');
  }
}

async function getStaticSystemInfo() {
  if (staticSystemInfoCache) {
    return staticSystemInfoCache;
  }

  const [cpu, memLayout, graphics] = await Promise.all([
    si.cpu(),
    si.memLayout().catch(() => []),
    si.graphics().catch(() => ({ controllers: [] })),
  ]);

  const primaryGpu = graphics.controllers && graphics.controllers[0] ? graphics.controllers[0] : null;
  const ramTotal = memLayout.reduce((sum, item) => sum + (item.size || 0), 0);

  staticSystemInfoCache = {
    cpu: {
      manufacturer: cpu.manufacturer,
      brand: cpu.brand,
      cores: cpu.cores,
      physicalCores: cpu.physicalCores,
      speed: cpu.speed,
    },
    gpu: primaryGpu
      ? {
          model: primaryGpu.model || 'Unknown GPU',
          vram: primaryGpu.vram || 0,
          vendor: primaryGpu.vendor || '',
        }
      : null,
    ramTotal,
  };

  return staticSystemInfoCache;
}

async function updateFastMetrics() {
  const [load, memory, cpuTemp] = await Promise.all([
    si.currentLoad().catch(() => null),
    si.mem().catch(() => null),
    si.cpuTemperature().catch(() => null),
  ]);

  const usedMemory = memory ? memory.total - memory.available : 0;
  const ramPercent = memory && memory.total ? (usedMemory / memory.total) * 100 : null;

  liveMetricsCache = {
    ...liveMetricsCache,
    cpuPercent: load ? load.currentLoad : liveMetricsCache.cpuPercent,
    ramPercent,
    ramUsedMb: usedMemory ? usedMemory / 1024 / 1024 : null,
    ramTotalMb: memory && memory.total ? memory.total / 1024 / 1024 : null,
    cpuTemperature: cpuTemp ? cpuTemp.main ?? null : null,
    updatedAt: Date.now(),
  };
}

async function updateSlowGpuMetrics() {
  const graphics = await si.graphics().catch(() => ({ controllers: [] }));

  const controllers = graphics && graphics.controllers ? graphics.controllers : [];
  const gpu =
    controllers.find(
      (item) =>
        item.utilizationGpu !== undefined ||
        item.memoryUsed !== undefined ||
        item.memoryTotal !== undefined ||
        item.vram !== undefined,
    ) || controllers[0];

  const vramTotalMb = gpu ? gpu.memoryTotal || gpu.vram || null : null;
  const vramUsedMb = gpu && gpu.memoryUsed !== undefined ? gpu.memoryUsed : null;
  const vramPercent =
    vramTotalMb && vramUsedMb !== null ? (vramUsedMb / vramTotalMb) * 100 : null;

  liveMetricsCache = {
    ...liveMetricsCache,
    gpuPercent: gpu ? gpu.utilizationGpu ?? null : null,
    gpuMemoryPercent: gpu ? gpu.utilizationMemory ?? null : null,
    vramPercent,
    vramUsedMb,
    vramTotalMb,
    gpuTemperature: gpu ? gpu.temperatureGpu ?? null : null,
    gpuName: gpu ? gpu.model || null : liveMetricsCache.gpuName,
    updatedAt: Date.now(),
  };
}

function ensureMetricsPolling() {
  if (metricsTimersStarted) {
    return;
  }

  metricsTimersStarted = true;
  updateFastMetrics();
  updateSlowGpuMetrics();
  setInterval(() => {
    updateFastMetrics();
  }, 1000);
  setInterval(() => {
    updateSlowGpuMetrics();
  }, 5000);
}

async function getLiveSystemMetrics() {
  ensureMetricsPolling();
  return liveMetricsCache;
}

app.whenReady().then(() => {
  ensureMetricsPolling();
  ipcMain.handle('system:static', getStaticSystemInfo);
  ipcMain.handle('system:metrics', getLiveSystemMetrics);

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
