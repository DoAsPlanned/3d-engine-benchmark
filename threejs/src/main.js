import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

document.querySelector('#app').innerHTML = `
  <div class="app">
    <div class="bar">
      <input id="file" type="file" accept=".step,.stp,model/step" />
      <button id="rotate" type="button">Пауза</button>
      <button id="fit" type="button">Подогнать</button>
      <button id="benchmark" type="button">Тест 3 мин</button>
      <span id="status" class="status">Ожидание файла</span>
    </div>

    <div class="layout">
      <div class="viewer">
        <canvas id="canvas"></canvas>
        <div id="benchmark-timer" class="benchmark-timer" style="display: none;">
          <div class="timer-label">Тест производительности</div>
          <div class="timer-value">03:00</div>
          <div class="timer-progress">
            <div class="timer-progress-bar"></div>
          </div>
        </div>
      </div>

      <aside class="panel">
        <div class="meta">
          <div class="row"><span>Режим</span><strong id="metrics-mode">-</strong></div>
          <div class="row"><span>Файл</span><strong id="file-name">-</strong></div>
          <div class="row"><span>Размер</span><strong id="file-size">-</strong></div>
          <div class="row"><span>Mesh</span><strong id="mesh-count">-</strong></div>
          <div class="row"><span>Треугольники</span><strong id="triangle-count">-</strong></div>
          <div class="row"><span>CPU</span><strong id="cpu-name">-</strong></div>
          <div class="row"><span>GPU</span><strong id="gpu-name">-</strong></div>
          <div class="row"><span>RAM</span><strong id="ram-total">-</strong></div>
          <div class="row"><span>VRAM</span><strong id="vram-total">-</strong></div>
          <div class="row"><span>CPU сейчас</span><strong id="cpu-now">-</strong></div>
          <div class="row"><span>RAM сейчас</span><strong id="ram-now">-</strong></div>
          <div class="row"><span>GPU сейчас</span><strong id="gpu-now">-</strong></div>
          <div class="row"><span>VRAM сейчас</span><strong id="vram-now">-</strong></div>
        </div>

        <div id="charts" class="charts"></div>
        <div id="small-note" class="small-note">Проверка подключения системных метрик...</div>
      </aside>
    </div>
  </div>
`;

const chartDefs = [
  { key: 'cpu', label: 'CPU', color: '#2e7d32', unit: '%', decimals: 0, max: 100 },
  { key: 'ram', label: 'RAM', color: '#1565c0', unit: '%', decimals: 0, max: 100 },
  { key: 'gpu', label: 'GPU', color: '#ef6c00', unit: '%', decimals: 0, max: 100 },
  { key: 'vram', label: 'VRAM', color: '#7b1fa2', unit: '%', decimals: 0, max: 100 },
  { key: 'fps', label: 'FPS', color: '#00897b', unit: '', decimals: 0, max: 120 },
  { key: 'draws', label: 'Draw calls', color: '#c62828', unit: '', decimals: 0, max: 500 },
  { key: 'triangles', label: 'Triangles', color: '#5d4037', unit: '', decimals: 0, max: 1000000 },
  { key: 'cpuTemp', label: 'CPU temp', color: '#ad1457', unit: '°C', decimals: 0, max: 100 },
  { key: 'gpuTemp', label: 'GPU temp', color: '#6d4c41', unit: '°C', decimals: 0, max: 100 },
];

const historySize = 90;
const histories = Object.fromEntries(chartDefs.map((item) => [item.key, []]));
const chartCanvases = new Map();
const chartValues = new Map();

const fileInput = document.querySelector('#file');
const rotateButton = document.querySelector('#rotate');
const fitButton = document.querySelector('#fit');
const benchmarkButton = document.querySelector('#benchmark');
const statusNode = document.querySelector('#status');
const canvas = document.querySelector('#canvas');
const chartsNode = document.querySelector('#charts');
const benchmarkTimerDiv = document.querySelector('#benchmark-timer');
const timerValueDiv = document.querySelector('.timer-value');
const timerProgressBar = document.querySelector('.timer-progress-bar');

const fileNameNode = document.querySelector('#file-name');
const fileSizeNode = document.querySelector('#file-size');
const meshCountNode = document.querySelector('#mesh-count');
const triangleCountNode = document.querySelector('#triangle-count');
const metricsModeNode = document.querySelector('#metrics-mode');
const cpuNameNode = document.querySelector('#cpu-name');
const gpuNameNode = document.querySelector('#gpu-name');
const ramTotalNode = document.querySelector('#ram-total');
const vramTotalNode = document.querySelector('#vram-total');
const cpuNowNode = document.querySelector('#cpu-now');
const ramNowNode = document.querySelector('#ram-now');
const gpuNowNode = document.querySelector('#gpu-now');
const vramNowNode = document.querySelector('#vram-now');
const smallNoteNode = document.querySelector('#small-note');

chartsNode.innerHTML = chartDefs
  .map(
    (item) => `
      <div class="chart-box">
        <div class="chart-head">
          <span>${item.label}</span>
          <strong id="value-${item.key}">-</strong>
        </div>
        <canvas id="chart-${item.key}" class="chart" width="280" height="80"></canvas>
      </div>
    `,
  )
  .join('');

for (const item of chartDefs) {
  chartCanvases.set(item.key, document.querySelector(`#chart-${item.key}`));
  chartValues.set(item.key, document.querySelector(`#value-${item.key}`));
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f0f0f);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2500);
camera.position.set(90, 90, 90);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
  powerPreference: 'high-performance',
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.autoRotate = true;
controls.autoRotateSpeed = 5;
controls.autoRotateDelay = 0;
controls.enableZoom = true;
controls.zoomSpeed = 1.0;
controls.enablePan = true;
controls.panSpeed = 0.8;
controls.rotateSpeed = 1.0;
controls.minDistance = 1;
controls.maxDistance = 1800;
controls.target.set(0, 0, 0);

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x94a3b8, 0.3);
scene.add(hemiLight);

const mainLight = new THREE.DirectionalLight(0xffffff, 1.2);
mainLight.position.set(5, 10, 5);
mainLight.target.position.set(0, 0, 0);
scene.add(mainLight);
scene.add(mainLight.target);

const fillLight = new THREE.DirectionalLight(0xa8c6ff, 0.2);
fillLight.position.set(-3, 2, -4);
scene.add(fillLight);

const stage = new THREE.Group();
scene.add(stage);

let occtModulePromise = null;
let currentModel = null;
let currentBounds = null;
let fps = 0;
let lastFrameAt = performance.now();
let frameAccumulator = 0;
let frameCounter = 0;
let metricsRefreshInFlight = false;

// Переменные для бенчмарка
let benchmarkActive = false;
let benchmarkStartTime = 0;
let benchmarkTimerInterval = null;
let benchmarkData = {
  cpu: [],
  ram: [],
  gpu: [],
  vram: [],
  fps: [],
  draws: [],
  triangles: [],
  cpuTemp: [],
  gpuTemp: [],
  timestamps: []
};
let originalAutoRotate = true;

function setStatus(text) {
  statusNode.textContent = text;
}

function formatMb(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '-';
  }
  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} GB`;
  }
  return `${value.toFixed(0)} MB`;
}

function formatBytes(value) {
  if (!value) {
    return '-';
  }
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '-';
  }
  return `${value.toFixed(0)} %`;
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function getOcctModule() {
  if (!occtModulePromise) {
    occtModulePromise = Promise.all([
      import('occt-import-js'),
      import('occt-import-js/dist/occt-import-js.wasm?url'),
    ]).then(([occtModule, wasmModule]) =>
      occtModule.default({
        locateFile: (path) => (path.endsWith('.wasm') ? wasmModule.default : path),
      }),
    );
  }

  return occtModulePromise;
}

function fitCameraToModel(bounds) {
  if (!bounds) {
    return;
  }

  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const maxSize = Math.max(size.x, size.y, size.z, 1);
  const distance = maxSize * 1.55;
  
  const alpha = Math.PI / 4;
  const beta = Math.PI / 6;
  
  const x = center.x + distance * Math.sin(alpha) * Math.cos(beta);
  const y = center.y + distance * Math.sin(beta);
  const z = center.z + distance * Math.cos(alpha) * Math.cos(beta);
  
  controls.target.copy(center);
  camera.position.set(x, y, z);
  camera.near = Math.max(maxSize / 1000, 0.01);
  camera.far = Math.max(maxSize * 30, 1000);
  camera.updateProjectionMatrix();
  controls.update();
}

function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) {
      child.geometry.dispose();
    }
    if (Array.isArray(child.material)) {
      child.material.forEach((material) => material.dispose());
    } else if (child.material) {
      child.material.dispose();
    }
  });
}

function createMeshFromOcct(geometryMesh) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(geometryMesh.attributes.position.array, 3),
  );

  if (geometryMesh.attributes.normal) {
    geometry.setAttribute(
      'normal',
      new THREE.Float32BufferAttribute(geometryMesh.attributes.normal.array, 3),
    );
  } else {
    geometry.computeVertexNormals();
  }

  geometry.setIndex(Array.from(geometryMesh.index.array));

  const color = geometryMesh.color
    ? new THREE.Color(geometryMesh.color[0], geometryMesh.color[1], geometryMesh.color[2])
    : new THREE.Color('#a7bacc');

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color,
      metalness: 0.05,
      roughness: 0.45,
      flatShading: false,
    }),
  );

  return mesh;
}

function buildModelGroup(result) {
  const group = new THREE.Group();
  let totalTriangles = 0;

  for (const geometryMesh of result.meshes) {
    const mesh = createMeshFromOcct(geometryMesh);
    group.add(mesh);
    totalTriangles += geometryMesh.index.array.length / 3;
  }

  group.userData.totalTriangles = Math.round(totalTriangles);
  group.userData.meshCount = result.meshes.length;
  return group;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function pushHistory(key, value) {
  const arr = histories[key];
  arr.push(value);
  if (arr.length > historySize) {
    arr.shift();
  }
}

function drawChart(key, def) {
  const canvasNode = chartCanvases.get(key);
  const valueNode = chartValues.get(key);
  if (!canvasNode || !valueNode) return;
  
  const ctx = canvasNode.getContext('2d');
  const values = histories[key];
  const width = canvasNode.width;
  const height = canvasNode.height;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#f4f6f8';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = '#d7dde3';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i += 1) {
    const y = (height / 4) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  if (!values.length) {
    valueNode.textContent = '-';
    return;
  }

  const localMax = Math.max(def.max, ...values, 1);
  ctx.strokeStyle = def.color;
  ctx.lineWidth = 2;
  ctx.beginPath();

  values.forEach((value, index) => {
    const x = (index / Math.max(values.length - 1, 1)) * width;
    const safeValue = clamp(value ?? 0, 0, localMax);
    const y = height - (safeValue / localMax) * (height - 4) - 2;
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });

  ctx.stroke();

  const currentValue = values[values.length - 1];
  valueNode.textContent =
    currentValue === null || currentValue === undefined
      ? '-'
      : `${currentValue.toFixed(def.decimals)}${def.unit}`;
}

async function refreshSystemCharts() {
  if (!window.desktopAPI?.getLiveSystemMetrics) {
    return;
  }

  try {
    const metrics = await window.desktopAPI.getLiveSystemMetrics();
    pushHistory('cpu', metrics.cpuPercent);
    pushHistory('ram', metrics.ramPercent);
    pushHistory('gpu', metrics.gpuPercent);
    pushHistory('vram', metrics.vramPercent);
    pushHistory('cpuTemp', metrics.cpuTemperature);
    pushHistory('gpuTemp', metrics.gpuTemperature);

    cpuNowNode.textContent = formatPercent(metrics.cpuPercent);
    ramNowNode.textContent =
      metrics.ramPercent === null || metrics.ramPercent === undefined
        ? '-'
        : `${metrics.ramPercent.toFixed(0)} % (${formatMb(metrics.ramUsedMb)} / ${formatMb(metrics.ramTotalMb)})`;
    gpuNowNode.textContent = formatPercent(metrics.gpuPercent);
    vramNowNode.textContent =
      metrics.vramPercent === null || metrics.vramPercent === undefined
        ? '-'
        : `${metrics.vramPercent.toFixed(0)} % (${formatMb(metrics.vramUsedMb)} / ${formatMb(metrics.vramTotalMb)})`;
    
    // Собираем данные для бенчмарка
    if (benchmarkActive) {
      const timestamp = (performance.now() - benchmarkStartTime) / 1000;
      benchmarkData.timestamps.push(timestamp);
      benchmarkData.cpu.push(metrics.cpuPercent);
      benchmarkData.ram.push(metrics.ramPercent);
      benchmarkData.gpu.push(metrics.gpuPercent);
      benchmarkData.vram.push(metrics.vramPercent);
      benchmarkData.cpuTemp.push(metrics.cpuTemperature);
      benchmarkData.gpuTemp.push(metrics.gpuTemperature);
      
      const renderInfo = renderer.info.render;
      benchmarkData.fps.push(fps);
      benchmarkData.draws.push(renderInfo.calls);
      benchmarkData.triangles.push(renderInfo.triangles);
    }
  } catch (error) {
    console.error('Failed to get system metrics', error);
    smallNoteNode.textContent = 'Не удалось получить системные метрики из Electron/systeminformation.';
  }
}

function refreshViewerCharts() {
  const renderInfo = renderer.info.render;
  pushHistory('fps', fps);
  pushHistory('draws', renderInfo.calls);
  pushHistory('triangles', renderInfo.triangles);
}

function drawAllCharts() {
  for (const def of chartDefs) {
    drawChart(def.key, def);
  }
}

async function loadStaticSystemInfo() {
  if (!window.desktopAPI?.getStaticSystemInfo) {
    metricsModeNode.textContent = 'Браузер';
    cpuNameNode.textContent = 'Browser mode';
    gpuNameNode.textContent = 'Browser mode';
    smallNoteNode.textContent =
      'Сейчас запущен браузерный режим. Для реальных графиков CPU/RAM/GPU/VRAM запускай: npm run desktop';
    return;
  }

  try {
    const info = await window.desktopAPI.getStaticSystemInfo();
    metricsModeNode.textContent = 'Electron';
    cpuNameNode.textContent = info.cpu?.brand || '-';
    gpuNameNode.textContent = info.gpu?.model || '-';
    ramTotalNode.textContent = formatBytes(info.ramTotal);
    vramTotalNode.textContent = info.gpu?.vram ? `${info.gpu.vram} MB` : '-';
    smallNoteNode.textContent =
      'Desktop режим Electron: системные графики приходят из Windows через systeminformation.';
  } catch (error) {
    console.error('Failed to get static system info', error);
    metricsModeNode.textContent = 'Ошибка';
    smallNoteNode.textContent = 'Electron запущен, но статические системные данные не прочитались.';
  }
}

async function loadStepFile(file) {
  if (!file) {
    return;
  }

  setStatus('Инициализация');

  try {
    const occt = await getOcctModule();
    const start = performance.now();
    const fileBuffer = new Uint8Array(await file.arrayBuffer());

    setStatus('Чтение STEP');
    const result = occt.ReadStepFile(fileBuffer, {
      linearUnit: 'millimeter',
      linearDeflectionType: 'bounding_box_ratio',
      linearDeflection: 0.0025,
      angularDeflection: 0.35,
    });

    if (!result.success || !result.meshes?.length) {
      throw new Error('Файл не удалось прочитать.');
    }

    if (currentModel) {
      stage.remove(currentModel);
      disposeObject(currentModel);
    }

    currentModel = buildModelGroup(result);
    stage.add(currentModel);
    currentBounds = new THREE.Box3().setFromObject(currentModel);
    fitCameraToModel(currentBounds);

    const loadMs = performance.now() - start;
    fileNameNode.textContent = file.name;
    fileSizeNode.textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB`;
    meshCountNode.textContent = `${currentModel.userData.meshCount}`;
    triangleCountNode.textContent = `${currentModel.userData.totalTriangles.toLocaleString('ru-RU')}`;
    setStatus(`Готово ${loadMs.toFixed(0)} ms`);
  } catch (error) {
    console.error(error);
    setStatus(error instanceof Error ? error.message : 'Ошибка');
  }
}

function resizeRenderer() {
  const parent = canvas.parentElement;
  if (!parent) return;
  
  const width = parent.clientWidth;
  const height = parent.clientHeight;

  if (canvas.width !== width || canvas.height !== height) {
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
}

async function refreshMetrics() {
  if (metricsRefreshInFlight) {
    return;
  }

  metricsRefreshInFlight = true;
  try {
    await refreshSystemCharts();
    refreshViewerCharts();
    drawAllCharts();
  } finally {
    metricsRefreshInFlight = false;
  }
}

function updateBenchmarkTimer() {
  const elapsed = (performance.now() - benchmarkStartTime) / 1000;
  const remaining = Math.max(0, 180 - elapsed);
  const minutes = Math.floor(remaining / 60);
  const seconds = Math.floor(remaining % 60);
  
  timerValueDiv.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  
  const progress = (elapsed / 180) * 100;
  timerProgressBar.style.width = `${Math.min(100, progress)}%`;
  
  if (remaining <= 30) {
    timerValueDiv.style.color = '#ff4444';
    timerValueDiv.style.animation = 'pulse 1s infinite';
  } else if (remaining <= 60) {
    timerValueDiv.style.color = '#ffaa44';
  } else {
    timerValueDiv.style.color = '#ffffff';
  }
  
  if (remaining <= 0 && benchmarkTimerInterval) {
    clearInterval(benchmarkTimerInterval);
    benchmarkTimerInterval = null;
  }
}

function calculateAverage(arr) {
  if (arr.length === 0) return 0;
  const sum = arr.reduce((a, b) => a + b, 0);
  return sum / arr.length;
}

function calculateMax(arr) {
  if (arr.length === 0) return 0;
  return Math.max(...arr);
}

function calculateMin(arr) {
  if (arr.length === 0) return 0;
  return Math.min(...arr);
}

function calculatePercentile(arr, percentile) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

function generateBenchmarkReport() {
  const duration = (performance.now() - benchmarkStartTime) / 1000;
  const modelInfo = currentModel ? {
    fileName: fileNameNode.textContent,
    fileSize: fileSizeNode.textContent,
    meshCount: meshCountNode.textContent,
    triangleCount: triangleCountNode.textContent
  } : null;
  
  const systemInfo = {
    mode: metricsModeNode.textContent,
    cpu: cpuNameNode.textContent,
    gpu: gpuNameNode.textContent,
    ramTotal: ramTotalNode.textContent,
    vramTotal: vramTotalNode.textContent
  };
  
  const stats = {
    cpu: {
      avg: calculateAverage(benchmarkData.cpu),
      max: calculateMax(benchmarkData.cpu),
      min: calculateMin(benchmarkData.cpu),
      p95: calculatePercentile(benchmarkData.cpu, 95)
    },
    ram: {
      avg: calculateAverage(benchmarkData.ram),
      max: calculateMax(benchmarkData.ram),
      min: calculateMin(benchmarkData.ram),
      p95: calculatePercentile(benchmarkData.ram, 95)
    },
    gpu: {
      avg: calculateAverage(benchmarkData.gpu),
      max: calculateMax(benchmarkData.gpu),
      min: calculateMin(benchmarkData.gpu),
      p95: calculatePercentile(benchmarkData.gpu, 95)
    },
    vram: {
      avg: calculateAverage(benchmarkData.vram),
      max: calculateMax(benchmarkData.vram),
      min: calculateMin(benchmarkData.vram),
      p95: calculatePercentile(benchmarkData.vram, 95)
    },
    fps: {
      avg: calculateAverage(benchmarkData.fps),
      max: calculateMax(benchmarkData.fps),
      min: calculateMin(benchmarkData.fps),
      p95: calculatePercentile(benchmarkData.fps, 95)
    },
    draws: {
      avg: calculateAverage(benchmarkData.draws),
      max: calculateMax(benchmarkData.draws),
      min: calculateMin(benchmarkData.draws),
      p95: calculatePercentile(benchmarkData.draws, 95)
    },
    triangles: {
      avg: calculateAverage(benchmarkData.triangles),
      max: calculateMax(benchmarkData.triangles),
      min: calculateMin(benchmarkData.triangles),
      p95: calculatePercentile(benchmarkData.triangles, 95)
    },
    cpuTemp: benchmarkData.cpuTemp.length > 0 ? {
      avg: calculateAverage(benchmarkData.cpuTemp),
      max: calculateMax(benchmarkData.cpuTemp),
      min: calculateMin(benchmarkData.cpuTemp),
      p95: calculatePercentile(benchmarkData.cpuTemp, 95)
    } : null,
    gpuTemp: benchmarkData.gpuTemp.length > 0 ? {
      avg: calculateAverage(benchmarkData.gpuTemp),
      max: calculateMax(benchmarkData.gpuTemp),
      min: calculateMin(benchmarkData.gpuTemp),
      p95: calculatePercentile(benchmarkData.gpuTemp, 95)
    } : null
  };
  
  const report = {
    timestamp: new Date().toISOString(),
    duration_seconds: duration,
    model_info: modelInfo,
    system_info: systemInfo,
    statistics: stats,
    raw_data: benchmarkData
  };
  
  return report;
}

function generateSimpleHTMLReport(report) {
  const formatDate = (date) => {
    const d = new Date(date);
    return `${d.toLocaleDateString('ru-RU')} ${d.toLocaleTimeString('ru-RU')}`;
  };

  const formatNumber = (num, decimals = 1) => {
    return num.toFixed(decimals);
  };

  const generateAsciiChart = (data, width = 40, height = 10, label = '') => {
    if (!data.length) return '<pre>Нет данных</pre>';
    
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min;
    
    let chart = `<pre style="font-family: monospace; font-size: 11px; margin: 5px 0;">`;
    if (label) chart += `${label}\n`;
    chart += `Макс: ${max.toFixed(1)}  Мин: ${min.toFixed(1)}\n`;
    chart += `┌${'─'.repeat(width)}┐\n`;
    
    for (let h = height; h >= 0; h--) {
      const threshold = min + (range * h / height);
      let line = '│';
      for (let i = 0; i < Math.min(data.length, width); i++) {
        const idx = Math.floor(i * data.length / width);
        line += data[idx] >= threshold ? '█' : ' ';
      }
      line += '│\n';
      chart += line;
    }
    chart += `└${'─'.repeat(width)}┘\n`;
    chart += `0${' '.repeat(width-5)}${data.length}с\n`;
    chart += `</pre>`;
    return chart;
  };

  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Отчет о производительности (Three.js)</title>
    <style>
        body {
            font-family: 'Courier New', monospace;
            background: #ffffff;
            margin: 20px;
            color: #000000;
        }
        .report {
            max-width: 1000px;
            margin: 0 auto;
            background: #ffffff;
            border: 1px solid #cccccc;
            padding: 20px;
        }
        h1 {
            font-size: 20px;
            border-bottom: 2px solid #000000;
            padding-bottom: 5px;
            margin-top: 20px;
        }
        h2 {
            font-size: 16px;
            margin-top: 20px;
            margin-bottom: 10px;
            background: #f0f0f0;
            padding: 5px;
            border-left: 3px solid #000000;
        }
        h3 {
            font-size: 14px;
            margin-top: 15px;
            margin-bottom: 5px;
            color: #333333;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 10px 0;
            font-size: 12px;
        }
        td, th {
            border: 1px solid #cccccc;
            padding: 6px 8px;
            text-align: left;
        }
        th {
            background: #f5f5f5;
            font-weight: bold;
        }
        hr {
            border: none;
            border-top: 1px dashed #cccccc;
            margin: 20px 0;
        }
        .footer {
            font-size: 10px;
            color: #666666;
            margin-top: 30px;
            text-align: center;
            border-top: 1px solid #cccccc;
            padding-top: 10px;
        }
        pre {
            background: #f9f9f9;
            border: 1px solid #e0e0e0;
            padding: 8px;
            overflow-x: auto;
            font-size: 10px;
        }
        .summary {
            background: #f9f9f9;
            padding: 10px;
            margin: 10px 0;
            border-left: 3px solid #000000;
        }
        .badge {
            display: inline-block;
            background: #4caf50;
            color: white;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 10px;
            margin-left: 8px;
        }
    </style>
</head>
<body>
<div class="report">
    <h1>📊 ОТЧЕТ ТЕСТА ПРОИЗВОДИТЕЛЬНОСТИ <span class="badge">Three.js</span></h1>
    
    <div class="summary">
        <strong>Дата теста:</strong> ${formatDate(report.timestamp)}<br>
        <strong>Длительность:</strong> ${report.duration_seconds.toFixed(1)} секунд (${(report.duration_seconds / 60).toFixed(1)} минут)<br>
        <strong>Количество замеров:</strong> ${report.raw_data.timestamps.length}
    </div>
    
    <h2>1. ИНФОРМАЦИЯ О СИСТЕМЕ</h2>
    <table>
        <tr><th>Параметр</th><th>Значение</th></tr>
        <tr><td>Режим работы</td><td>${report.system_info.mode}</td></tr>
        <tr><td>Процессор</td><td>${report.system_info.cpu}</td></tr>
        <tr><td>Видеокарта</td><td>${report.system_info.gpu}</td></tr>
        <tr><td>ОЗУ (всего)</td><td>${report.system_info.ramTotal}</td></tr>
        <tr><td>Видеопамять (всего)</td><td>${report.system_info.vramTotal}</td></tr>
    </table>
    
    ${report.model_info ? `
    <h2>2. ИНФОРМАЦИЯ О МОДЕЛИ</h2>
    <table>
        <tr><th>Параметр</th><th>Значение</th></tr>
        <tr><td>Имя файла</td><td>${report.model_info.fileName}</td></tr>
        <tr><td>Размер файла</td><td>${report.model_info.fileSize}</td></tr>
        <tr><td>Количество mesh</td><td>${report.model_info.meshCount}</td></tr>
        <tr><td>Количество полигонов</td><td>${report.model_info.triangleCount}</td></tr>
    </table>
    ` : ''}
    
    <h2>3. РЕЗУЛЬТАТЫ ТЕСТА</h2>
    
    <h3>3.1 Процессор (CPU)</h3>
    <table>
        <tr><th>Показатель</th><th>Значение</th><th>Ед.изм.</th></tr>
        <tr><td>Средняя загрузка</td><td>${formatNumber(report.statistics.cpu.avg)}</td><td>%</td></tr>
        <tr><td>Максимальная загрузка</td><td>${formatNumber(report.statistics.cpu.max)}</td><td>%</td></tr>
        <tr><td>Минимальная загрузка</td><td>${formatNumber(report.statistics.cpu.min)}</td><td>%</td></tr>
        <tr><td>95-й перцентиль</td><td>${formatNumber(report.statistics.cpu.p95)}</td><td>%</td></tr>
    </table>
    ${generateAsciiChart(report.raw_data.cpu, 50, 8, 'Загрузка CPU')}
    
    <h3>3.2 Видеокарта (GPU)</h3>
    <table>
        <tr><th>Показатель</th><th>Значение</th><th>Ед.изм.</th></tr>
        <tr><td>Средняя загрузка</td><td>${formatNumber(report.statistics.gpu.avg)}</td><td>%</td></tr>
        <tr><td>Максимальная загрузка</td><td>${formatNumber(report.statistics.gpu.max)}</td><td>%</td></tr>
        <tr><td>Минимальная загрузка</td><td>${formatNumber(report.statistics.gpu.min)}</td><td>%</td></tr>
        <tr><td>95-й перцентиль</td><td>${formatNumber(report.statistics.gpu.p95)}</td><td>%</td></tr>
    </table>
    ${generateAsciiChart(report.raw_data.gpu, 50, 8, 'Загрузка GPU')}
    
    <h3>3.3 Оперативная память (RAM)</h3>
    <table>
        <tr><th>Показатель</th><th>Значение</th><th>Ед.изм.</th></tr>
        <tr><td>Средняя загрузка</td><td>${formatNumber(report.statistics.ram.avg)}</td><td>%</td></tr>
        <tr><td>Максимальная загрузка</td><td>${formatNumber(report.statistics.ram.max)}</td><td>%</td></tr>
        <tr><td>Минимальная загрузка</td><td>${formatNumber(report.statistics.ram.min)}</td><td>%</td></tr>
        <tr><td>95-й перцентиль</td><td>${formatNumber(report.statistics.ram.p95)}</td><td>%</td></tr>
    </table>
    ${generateAsciiChart(report.raw_data.ram, 50, 8, 'Загрузка RAM')}
    
    <h3>3.4 Видеопамять (VRAM)</h3>
    <table>
        <tr><th>Показатель</th><th>Значение</th><th>Ед.изм.</th></tr>
        <tr><td>Средняя загрузка</td><td>${formatNumber(report.statistics.vram.avg)}</td><td>%</td></tr>
        <tr><td>Максимальная загрузка</td><td>${formatNumber(report.statistics.vram.max)}</td><td>%</td></tr>
        <tr><td>Минимальная загрузка</td><td>${formatNumber(report.statistics.vram.min)}</td><td>%</td></tr>
        <tr><td>95-й перцентиль</td><td>${formatNumber(report.statistics.vram.p95)}</td><td>%</td></tr>
    </table>
    ${generateAsciiChart(report.raw_data.vram, 50, 8, 'Загрузка VRAM')}
    
    <h3>3.5 Частота кадров (FPS)</h3>
    <table>
        <tr><th>Показатель</th><th>Значение</th><th>Ед.изм.</th></tr>
        <tr><td>Средний FPS</td><td>${formatNumber(report.statistics.fps.avg)}</td><td>fps</td></tr>
        <tr><td>Максимальный FPS</td><td>${formatNumber(report.statistics.fps.max)}</td><td>fps</td></tr>
        <tr><td>Минимальный FPS</td><td>${formatNumber(report.statistics.fps.min)}</td><td>fps</td></tr>
        <tr><td>95-й перцентиль</td><td>${formatNumber(report.statistics.fps.p95)}</td><td>fps<tr></tr>
    </table>
    ${generateAsciiChart(report.raw_data.fps, 50, 8, 'Частота кадров')}
    
    <h3>3.6 Draw Calls</h3>
    <table>
        <tr><th>Показатель</th><th>Значение</th><th>Ед.изм.</th></tr>
        <tr><td>Среднее</td><td>${Math.round(report.statistics.draws.avg)}</td><td>calls</td></tr>
        <tr><td>Максимум</td><td>${Math.round(report.statistics.draws.max)}</td><td>calls</td></tr>
        <tr><td>Минимум</td><td>${Math.round(report.statistics.draws.min)}</td><td>calls</td></tr>
        <tr><td>95-й перцентиль</td><td>${Math.round(report.statistics.draws.p95)}</td><td>calls</td></tr>
    </table>
    ${generateAsciiChart(report.raw_data.draws, 50, 8, 'Draw Calls')}
    
    ${report.statistics.cpuTemp ? `
    <h3>3.7 Температуры</h3>
    
    <h4>Температура CPU</h4>
    <table>
        <tr><th>Показатель</th><th>Значение</th><th>Ед.изм.</th></tr>
        <tr><td>Средняя</td><td>${formatNumber(report.statistics.cpuTemp.avg)}</td><td>°C</td></tr>
                <tr><td>Максимальная</td><td>${formatNumber(report.statistics.cpuTemp.max)}</td><td>°C</td>
        </tr>
        <tr><td>Минимальная</td><td>${formatNumber(report.statistics.cpuTemp.min)}</td><td>°C</td>
        </tr>
    </table>
    ${generateAsciiChart(report.raw_data.cpuTemp, 50, 8, 'Температура CPU')}
    
    <h4>Температура GPU</h4>
    <table>
        <tr><th>Показатель</th><th>Значение</th><th>Ед.изм.</th></tr>
        <tr><td>Средняя</td><td>${formatNumber(report.statistics.gpuTemp.avg)}</td><td>°C</td>
        </tr>
        <tr><td>Максимальная</td><td>${formatNumber(report.statistics.gpuTemp.max)}</td><td>°C</td>
        </tr>
        <tr><td>Минимальная</td><td>${formatNumber(report.statistics.gpuTemp.min)}</td><td>°C</td>
        </tr>
    </table>
    ${generateAsciiChart(report.raw_data.gpuTemp, 50, 8, 'Температура GPU')}
    ` : ''}
    
    <hr>
    
    <h2>4. ИТОГОВАЯ ОЦЕНКА</h2>
    <div class="summary">
        <strong>Стабильность FPS:</strong> ${((report.statistics.fps.min / report.statistics.fps.max) * 100).toFixed(1)}%<br>
        <strong>Средняя загрузка CPU:</strong> ${formatNumber(report.statistics.cpu.avg)}%<br>
        <strong>Средняя загрузка GPU:</strong> ${formatNumber(report.statistics.gpu.avg)}%<br>
        <strong>Максимальное потребление RAM:</strong> ${formatNumber(report.statistics.ram.max)}%<br>
        <strong>Максимальное потребление VRAM:</strong> ${formatNumber(report.statistics.vram.max)}%
    </div>
    
    <div class="footer">
        Отчет сгенерирован автоматически системой тестирования 3D Viewer (Three.js)<br>
        Файл с сырыми данными: benchmark_data_*.json
    </div>
</div>
</body>
</html>`;
}

function generateAndDownloadReport() {
  const report = generateBenchmarkReport();
  
  // Сохраняем JSON
  const json = JSON.stringify(report, null, 2);
  const jsonBlob = new Blob([json], { type: 'application/json' });
  const jsonUrl = URL.createObjectURL(jsonBlob);
  const jsonA = document.createElement('a');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonFilename = `benchmark_${timestamp}.json`;
  jsonA.href = jsonUrl;
  jsonA.download = jsonFilename;
  document.body.appendChild(jsonA);
  jsonA.click();
  document.body.removeChild(jsonA);
  URL.revokeObjectURL(jsonUrl);
  
  // Сохраняем HTML отчет
  const html = generateSimpleHTMLReport(report);
  const htmlBlob = new Blob([html], { type: 'text/html' });
  const htmlUrl = URL.createObjectURL(htmlBlob);
  const htmlA = document.createElement('a');
  const htmlFilename = `benchmark_${timestamp}.html`;
  htmlA.href = htmlUrl;
  htmlA.download = htmlFilename;
  document.body.appendChild(htmlA);
  htmlA.click();
  document.body.removeChild(htmlA);
  URL.revokeObjectURL(htmlUrl);
  
  setStatus(`Тест завершен! Сохранены: ${jsonFilename} и ${htmlFilename}`);
}

function startBenchmark() {
  if (!currentModel) {
    setStatus('Ошибка: сначала загрузите STEP файл');
    return;
  }
  
  if (benchmarkActive) {
    setStatus('Тест уже запущен');
    return;
  }
  
  // Сбрасываем данные
  benchmarkData = {
    cpu: [],
    ram: [],
    gpu: [],
    vram: [],
    fps: [],
    draws: [],
    triangles: [],
    cpuTemp: [],
    gpuTemp: [],
    timestamps: []
  };
  
  // Сохраняем исходное состояние автовращения
  originalAutoRotate = controls.autoRotate;
  controls.autoRotate = true;
  rotateButton.textContent = 'Пауза';
  
  benchmarkActive = true;
  benchmarkStartTime = performance.now();
  setStatus('Тест запущен на 3 минуты...');
  benchmarkButton.textContent = 'Тест выполняется...';
  benchmarkButton.disabled = true;
  
  // Показываем таймер
  benchmarkTimerDiv.style.display = 'flex';
  timerValueDiv.textContent = '03:00';
  timerValueDiv.style.color = '#ffffff';
  timerValueDiv.style.animation = 'none';
  timerProgressBar.style.width = '0%';
  
  // Запускаем обновление таймера
  benchmarkTimerInterval = setInterval(() => {
    if (benchmarkActive) {
      updateBenchmarkTimer();
    }
  }, 100);
  
  // Таймер на 3 минуты
  setTimeout(() => {
    if (benchmarkActive) {
      finishBenchmark();
    }
  }, 180000);
}

function finishBenchmark() {
  benchmarkActive = false;
  
  if (benchmarkTimerInterval) {
    clearInterval(benchmarkTimerInterval);
    benchmarkTimerInterval = null;
  }
  
  benchmarkTimerDiv.style.display = 'none';
  
  controls.autoRotate = originalAutoRotate;
  rotateButton.textContent = controls.autoRotate ? 'Пауза' : 'Старт';
  
  benchmarkButton.textContent = 'Тест 3 мин';
  benchmarkButton.disabled = false;
  
  setStatus('Тест завершен, формирование отчета...');
  
  generateAndDownloadReport();
}

// Добавляем CSS для таймера
const style = document.createElement('style');
style.textContent = `
  .benchmark-timer {
    position: absolute;
    top: 20px;
    right: 20px;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(10px);
    border-radius: 12px;
    padding: 12px 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
    z-index: 1000;
    font-family: 'Courier New', monospace;
  }
  
  .timer-label {
    font-size: 12px;
    color: #aaa;
    letter-spacing: 1px;
    font-weight: 500;
  }
  
  .timer-value {
    font-size: 32px;
    font-weight: bold;
    color: #ffffff;
    text-shadow: 0 0 10px rgba(0, 255, 0, 0.5);
    transition: color 0.3s ease;
  }
  
  .timer-progress {
    width: 100%;
    height: 3px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 3px;
    overflow: hidden;
  }
  
  .timer-progress-bar {
    height: 100%;
    background: linear-gradient(90deg, #4caf50, #8bc34a);
    width: 0%;
    transition: width 0.1s linear;
    border-radius: 3px;
  }
  
  @keyframes pulse {
    0%, 100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.7;
      transform: scale(1.05);
    }
  }
  
  .viewer {
    position: relative;
  }
`;
document.head.appendChild(style);

function animate(now) {
  const delta = now - lastFrameAt;
  lastFrameAt = now;
  frameAccumulator += delta;
  frameCounter += 1;

  if (frameAccumulator >= 500) {
    fps = (frameCounter * 1000) / frameAccumulator;
    frameAccumulator = 0;
    frameCounter = 0;
  }

  resizeRenderer();
  controls.update();
  renderer.render(scene, camera);

  requestAnimationFrame(animate);
}

fileInput.addEventListener('change', async (event) => {
  const [file] = event.target.files;
  await loadStepFile(file);
});

rotateButton.addEventListener('click', () => {
  controls.autoRotate = !controls.autoRotate;
  rotateButton.textContent = controls.autoRotate ? 'Пауза' : 'Старт';
});

fitButton.addEventListener('click', () => {
  fitCameraToModel(currentBounds);
});

benchmarkButton.addEventListener('click', () => {
  startBenchmark();
});

window.addEventListener('resize', resizeRenderer);

loadStaticSystemInfo();
refreshMetrics();
setInterval(() => {
  refreshMetrics();
}, 1000);
resizeRenderer();
requestAnimationFrame(animate);