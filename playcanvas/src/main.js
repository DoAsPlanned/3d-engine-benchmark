import './style.css';
import * as pc from 'playcanvas';

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
        <div id="small-note" class="small-note">PlayCanvas viewer готов к загрузке STEP/STP.</div>
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

// PlayCanvas инициализация
const app = new pc.Application(canvas, {
  graphicsDeviceOptions: {
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: false,
  },
});

app.start();
app.setCanvasFillMode(pc.FILLMODE_NONE);
app.setCanvasResolution(pc.RESOLUTION_AUTO);
app.scene.ambientLight = new pc.Color(0.3, 0.35, 0.4);
app.scene.gammaCorrection = pc.GAMMA_SRGB;
app.scene.toneMapping = pc.TONEMAP_ACES;

const root = app.root;

// Камера
const camera = new pc.Entity('camera');
camera.addComponent('camera', {
  fov: 45,
  clearColor: new pc.Color(0.15, 0.15, 0.15),
  nearClip: 0.1,
  farClip: 5000,
});
root.addChild(camera);

// Основной свет
const mainLight = new pc.Entity('mainLight');
mainLight.addComponent('light', {
  type: 'directional',
  color: new pc.Color(1, 1, 1),
  intensity: 1.2,
  castShadows: false,
});
mainLight.setEulerAngles(45, 35, 0);
root.addChild(mainLight);

// Заполняющий свет
const fillLight = new pc.Entity('fillLight');
fillLight.addComponent('light', {
  type: 'directional',
  color: new pc.Color(0.7, 0.76, 0.88),
  intensity: 0.5,
  castShadows: false,
});
fillLight.setEulerAngles(-25, -140, 0);
root.addChild(fillLight);

// Удаляем подложку (пол) - закомментировано
// const groundMaterial = new pc.StandardMaterial();
// groundMaterial.diffuse = new pc.Color(0.84, 0.88, 0.91);
// groundMaterial.opacity = 0.3;
// groundMaterial.blendType = pc.BLEND_NORMAL;
// groundMaterial.cull = pc.CULLFACE_NONE;
// groundMaterial.update();
// 
// const ground = new pc.Entity('ground');
// ground.addComponent('render', {
//   type: 'plane',
//   material: groundMaterial,
//   castShadows: false,
//   receiveShadows: false,
// });
// ground.setLocalScale(200, 1, 200);
// ground.setEulerAngles(-90, 0, 0);
// root.addChild(ground);

let currentModel = null;
let currentModelResources = [];
let metricsRefreshInFlight = false;
let occtPromise = null;
let autoRotate = true;
let fps = 0;
let lastFrameTime = performance.now();
let frameAccumulator = 0;
let frameCounter = 0;

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

// Орбита камеры
const orbitState = {
  yaw: Math.PI / 4,
  pitch: 0.9,
  radius: 150,
  target: new pc.Vec3(0, 0, 0),
  minRadius: 0.25,
  maxRadius: 1800,
};

const pointerState = {
  dragging: false,
  x: 0,
  y: 0,
};

function setStatus(text) {
  statusNode.textContent = text;
}

function formatMb(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  if (value >= 1024) return `${(value / 1024).toFixed(1)} GB`;
  return `${value.toFixed(0)} MB`;
}

function formatBytes(value) {
  if (!value) return '-';
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  return `${value.toFixed(0)} %`;
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function pushHistory(key, value) {
  const history = histories[key];
  if (!history) return;
  history.push(value);
  if (history.length > historySize) history.shift();
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

  const localMax = Math.max(def.max, ...values.map(v => v ?? 0), 1);
  ctx.strokeStyle = def.color;
  ctx.lineWidth = 2;
  ctx.beginPath();

  values.forEach((value, index) => {
    const x = (index / Math.max(values.length - 1, 1)) * width;
    const safeValue = Math.min(Math.max(value ?? 0, 0), localMax);
    const y = height - (safeValue / localMax) * (height - 4) - 2;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.stroke();

  const currentValue = values.at(-1);
  valueNode.textContent = currentValue === null || currentValue === undefined
    ? '-'
    : `${currentValue.toFixed(def.decimals)}${def.unit}`;
}

function drawAllCharts() {
  for (const def of chartDefs) drawChart(def.key, def);
}

function updateCameraTransform() {
  orbitState.pitch = Math.max(-1.45, Math.min(1.45, orbitState.pitch));
  orbitState.radius = Math.min(Math.max(orbitState.radius, orbitState.minRadius), orbitState.maxRadius);

  const cosPitch = Math.cos(orbitState.pitch);
  const x = orbitState.target.x + orbitState.radius * cosPitch * Math.sin(orbitState.yaw);
  const y = orbitState.target.y + orbitState.radius * Math.sin(orbitState.pitch);
  const z = orbitState.target.z + orbitState.radius * cosPitch * Math.cos(orbitState.yaw);

  camera.setPosition(x, y, z);
  camera.lookAt(orbitState.target);
}

function disposeCurrentModel() {
  if (currentModel) {
    currentModel.entity.destroy();
    currentModel = null;
  }
  for (const resource of currentModelResources) {
    if (resource.mesh) resource.mesh.destroy();
    if (resource.material) resource.material.destroy();
  }
  currentModelResources = [];
  meshCountNode.textContent = '-';
  triangleCountNode.textContent = '-';
}

function fitCameraToBounds(bounds) {
  if (!bounds) return;

  const size = new pc.Vec3().sub2(bounds.max, bounds.min);
  const center = new pc.Vec3().add2(bounds.min, size.clone().mulScalar(0.5));
  const maxSize = Math.max(size.x, size.y, size.z, 1);

  orbitState.target.copy(center);
  orbitState.radius = maxSize * 1.55;
  orbitState.minRadius = Math.max(maxSize * 0.01, 0.25);
  orbitState.maxRadius = maxSize * 30;
  orbitState.yaw = Math.PI / 4;
  orbitState.pitch = 0.9;
  updateCameraTransform();
}

function refreshViewerCharts() {
  const stats = app.stats;
  const fpsValue = stats?.frame?.fps || 0;
  fps = fpsValue;
  pushHistory('fps', fpsValue);
  pushHistory('draws', stats?.drawCalls?.total || 0);
  pushHistory('triangles', stats?.frame?.triangles || 0);
}

async function refreshSystemCharts() {
  if (!window.desktopAPI?.getLiveSystemMetrics) return;

  try {
    const metrics = await window.desktopAPI.getLiveSystemMetrics();
    pushHistory('cpu', metrics.cpuPercent);
    pushHistory('ram', metrics.ramPercent);
    pushHistory('gpu', metrics.gpuPercent);
    pushHistory('vram', metrics.vramPercent);
    pushHistory('cpuTemp', metrics.cpuTemperature);
    pushHistory('gpuTemp', metrics.gpuTemperature);

    cpuNowNode.textContent = formatPercent(metrics.cpuPercent);
    ramNowNode.textContent = metrics.ramPercent === null || metrics.ramPercent === undefined
      ? '-'
      : `${metrics.ramPercent.toFixed(0)} % (${formatMb(metrics.ramUsedMb)} / ${formatMb(metrics.ramTotalMb)})`;
    gpuNowNode.textContent = formatPercent(metrics.gpuPercent);
    vramNowNode.textContent = metrics.vramPercent === null || metrics.vramPercent === undefined
      ? '-'
      : `${metrics.vramPercent.toFixed(0)} % (${formatMb(metrics.vramUsedMb)} / ${formatMb(metrics.vramTotalMb)})`;

    if (benchmarkActive) {
      const timestamp = (performance.now() - benchmarkStartTime) / 1000;
      benchmarkData.timestamps.push(timestamp);
      benchmarkData.cpu.push(metrics.cpuPercent);
      benchmarkData.ram.push(metrics.ramPercent);
      benchmarkData.gpu.push(metrics.gpuPercent);
      benchmarkData.vram.push(metrics.vramPercent);
      benchmarkData.cpuTemp.push(metrics.cpuTemperature);
      benchmarkData.gpuTemp.push(metrics.gpuTemperature);
      benchmarkData.fps.push(fps);
      benchmarkData.draws.push(app.stats?.drawCalls?.total || 0);
      benchmarkData.triangles.push(app.stats?.frame?.triangles || 0);
    }
  } catch (error) {
    console.error('Failed to get system metrics', error);
    smallNoteNode.textContent = 'Не удалось получить системные метрики из Electron/systeminformation.';
  }
}

async function refreshMetrics() {
  if (metricsRefreshInFlight) return;
  metricsRefreshInFlight = true;
  try {
    await refreshSystemCharts();
    refreshViewerCharts();
    drawAllCharts();
  } finally {
    metricsRefreshInFlight = false;
  }
}

async function loadStaticSystemInfo() {
  if (!window.desktopAPI?.getStaticSystemInfo) {
    metricsModeNode.textContent = 'Браузер';
    cpuNameNode.textContent = 'Browser mode';
    gpuNameNode.textContent = 'Browser mode';
    smallNoteNode.textContent = 'Сейчас запущен браузерный режим. Для реальных графиков CPU/RAM/GPU/VRAM запускай: npm run desktop';
    return;
  }

  try {
    const info = await window.desktopAPI.getStaticSystemInfo();
    metricsModeNode.textContent = 'Electron';
    cpuNameNode.textContent = info.cpu?.brand || '-';
    gpuNameNode.textContent = info.gpu?.model || '-';
    ramTotalNode.textContent = formatBytes(info.ramTotal);
    vramTotalNode.textContent = info.gpu?.vram ? `${info.gpu.vram} MB` : '-';
    smallNoteNode.textContent = 'Desktop режим Electron: системные графики приходят из Windows через systeminformation.';
  } catch (error) {
    console.error('Failed to get static system info', error);
    metricsModeNode.textContent = 'Ошибка';
    smallNoteNode.textContent = 'Electron запущен, но статические системные данные не прочитались.';
  }
}

async function getOcct() {
  if (!occtPromise) {
    occtPromise = (async () => {
      const [{ default: initOcct }, wasmUrl] = await Promise.all([
        import('occt-import-js'),
        import('occt-import-js/dist/occt-import-js.wasm?url'),
      ]);
      return initOcct({
        locateFile: (path) => (path.endsWith('.wasm') ? wasmUrl.default : path),
      });
    })();
  }
  return occtPromise;
}

function createMeshResource(geometryMesh, meshIndex) {
  const positions = geometryMesh.attributes.position?.array
    ? Array.from(geometryMesh.attributes.position.array)
    : [];
  const indices = geometryMesh.index?.array ? Array.from(geometryMesh.index.array) : [];

  if (!positions.length || !indices.length) return null;

  const normals = geometryMesh.attributes.normal?.array && geometryMesh.attributes.normal.array.length
    ? Array.from(geometryMesh.attributes.normal.array)
    : null;

  const mesh = new pc.Mesh(app.graphicsDevice);
  mesh.setPositions(new Float32Array(positions));
  if (normals) mesh.setNormals(new Float32Array(normals));
  mesh.setIndices(positions.length / 3 > 65535 ? new Uint32Array(indices) : new Uint16Array(indices));
  mesh.update(pc.PRIMITIVE_TRIANGLES);

  if (!normals) mesh.generateNormals();

  const rawColor = geometryMesh.color ?? [0.655, 0.733, 0.8];
  const [r, g, b] = rawColor.map((value) => Math.min(Math.max(value, 0), 1));

  const material = new pc.StandardMaterial();
  material.diffuse = new pc.Color(r, g, b);
  material.useMetalness = true;
  material.metalness = 0.08;
  material.roughness = 0.45;
  material.shininess = 55;
  material.cull = pc.CULLFACE_BACK;
  material.update();

  const entity = new pc.Entity(`mesh_${meshIndex}`);
  const meshInstance = new pc.MeshInstance(mesh, material);
  meshInstance.castShadow = false;

  entity.addComponent('render', {
    meshInstances: [meshInstance],
    castShadows: false,
    receiveShadows: true,
  });

  return { entity, mesh, material, positions, indices };
}

function computeBoundsFromPositions(bounds, positions) {
  for (let i = 0; i < positions.length; i += 3) {
    bounds.min.x = Math.min(bounds.min.x, positions[i]);
    bounds.min.y = Math.min(bounds.min.y, positions[i + 1]);
    bounds.min.z = Math.min(bounds.min.z, positions[i + 2]);
    bounds.max.x = Math.max(bounds.max.x, positions[i]);
    bounds.max.y = Math.max(bounds.max.y, positions[i + 1]);
    bounds.max.z = Math.max(bounds.max.z, positions[i + 2]);
  }
}

async function loadStepFile(file) {
  if (!file) return;

  setStatus('Инициализация');
  fileNameNode.textContent = file.name;
  fileSizeNode.textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB`;
  meshCountNode.textContent = '-';
  triangleCountNode.textContent = '-';

  try {
    const occt = await getOcct();
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

    disposeCurrentModel();

    const modelGroup = new pc.Entity('modelGroup');
    const bounds = {
      min: new pc.Vec3(Infinity, Infinity, Infinity),
      max: new pc.Vec3(-Infinity, -Infinity, -Infinity),
    };

    let totalTriangles = 0;
    let meshCount = 0;

    for (const geometryMesh of result.meshes) {
      const resource = createMeshResource(geometryMesh, meshCount);
      if (!resource) continue;

      computeBoundsFromPositions(bounds, resource.positions);
      totalTriangles += resource.indices.length / 3;
      meshCount += 1;
      currentModelResources.push(resource);
      modelGroup.addChild(resource.entity);
    }

    if (!meshCount) {
      throw new Error('STEP прочитан, но геометрия оказалась пустой.');
    }

    currentModel = {
      entity: modelGroup,
      bounds,
      meshCount,
      totalTriangles: Math.round(totalTriangles),
    };

    root.addChild(modelGroup);
    fitCameraToBounds(bounds);

    meshCountNode.textContent = String(meshCount);
    triangleCountNode.textContent = currentModel.totalTriangles.toLocaleString('ru-RU');

    const loadMs = performance.now() - start;
    setStatus(`Готово ${loadMs.toFixed(0)} ms`);
  } catch (error) {
    console.error(error);
    disposeCurrentModel();
    setStatus(error instanceof Error ? error.message : 'Ошибка');
  }
}

function resizeRenderer() {
  const parent = canvas.parentElement;
  if (!parent) return;
  const width = parent.clientWidth;
  const height = parent.clientHeight;
  if (width > 0 && height > 0) app.resizeCanvas(width, height);
}

// Обработчики ввода
canvas.addEventListener('pointerdown', (event) => {
  pointerState.dragging = true;
  pointerState.x = event.clientX;
  pointerState.y = event.clientY;
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener('pointermove', (event) => {
  if (!pointerState.dragging) return;
  const dx = event.clientX - pointerState.x;
  const dy = event.clientY - pointerState.y;
  pointerState.x = event.clientX;
  pointerState.y = event.clientY;
  orbitState.yaw -= dx * 0.008;
  orbitState.pitch -= dy * 0.008;
  updateCameraTransform();
});

canvas.addEventListener('pointerup', (event) => {
  pointerState.dragging = false;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
});

canvas.addEventListener('pointercancel', () => { pointerState.dragging = false; });

canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  orbitState.radius *= Math.exp(event.deltaY * 0.001);
  updateCameraTransform();
}, { passive: false });

// Функции бенчмарка
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
    timerValueDiv.style.animation = 'none';
  } else {
    timerValueDiv.style.color = '#ffffff';
    timerValueDiv.style.animation = 'none';
  }
  
  if (remaining <= 0) {
    if (benchmarkTimerInterval) {
      clearInterval(benchmarkTimerInterval);
      benchmarkTimerInterval = null;
    }
  }
}

function calculateAverage(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
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
    cpu: { avg: calculateAverage(benchmarkData.cpu), max: calculateMax(benchmarkData.cpu), min: calculateMin(benchmarkData.cpu), p95: calculatePercentile(benchmarkData.cpu, 95) },
    ram: { avg: calculateAverage(benchmarkData.ram), max: calculateMax(benchmarkData.ram), min: calculateMin(benchmarkData.ram), p95: calculatePercentile(benchmarkData.ram, 95) },
    gpu: { avg: calculateAverage(benchmarkData.gpu), max: calculateMax(benchmarkData.gpu), min: calculateMin(benchmarkData.gpu), p95: calculatePercentile(benchmarkData.gpu, 95) },
    vram: { avg: calculateAverage(benchmarkData.vram), max: calculateMax(benchmarkData.vram), min: calculateMin(benchmarkData.vram), p95: calculatePercentile(benchmarkData.vram, 95) },
    fps: { avg: calculateAverage(benchmarkData.fps), max: calculateMax(benchmarkData.fps), min: calculateMin(benchmarkData.fps), p95: calculatePercentile(benchmarkData.fps, 95) },
    draws: { avg: calculateAverage(benchmarkData.draws), max: calculateMax(benchmarkData.draws), min: calculateMin(benchmarkData.draws), p95: calculatePercentile(benchmarkData.draws, 95) },
    triangles: { avg: calculateAverage(benchmarkData.triangles), max: calculateMax(benchmarkData.triangles), min: calculateMin(benchmarkData.triangles), p95: calculatePercentile(benchmarkData.triangles, 95) },
    cpuTemp: benchmarkData.cpuTemp.length > 0 ? { avg: calculateAverage(benchmarkData.cpuTemp), max: calculateMax(benchmarkData.cpuTemp), min: calculateMin(benchmarkData.cpuTemp), p95: calculatePercentile(benchmarkData.cpuTemp, 95) } : null,
    gpuTemp: benchmarkData.gpuTemp.length > 0 ? { avg: calculateAverage(benchmarkData.gpuTemp), max: calculateMax(benchmarkData.gpuTemp), min: calculateMin(benchmarkData.gpuTemp), p95: calculatePercentile(benchmarkData.gpuTemp, 95) } : null
  };
  
  return {
    timestamp: new Date().toISOString(),
    duration_seconds: duration,
    model_info: modelInfo,
    system_info: systemInfo,
    statistics: stats,
    raw_data: benchmarkData
  };
}

function generateSimpleHTMLReport(report) {
  const formatDate = (date) => {
    const d = new Date(date);
    return `${d.toLocaleDateString('ru-RU')} ${d.toLocaleTimeString('ru-RU')}`;
  };
  
  const formatNumber = (num, decimals = 1) => num.toFixed(decimals);
  
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
    chart += `└${'─'.repeat(width)}┘\n0${' '.repeat(width-5)}${data.length}с\n</pre>`;
    return chart;
  };
  
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Отчет о производительности (PlayCanvas)</title>
<style>
  body { font-family: 'Courier New', monospace; background: #fff; margin: 20px; color: #000; }
  .report { max-width: 1000px; margin: 0 auto; border: 1px solid #ccc; padding: 20px; }
  h1 { font-size: 20px; border-bottom: 2px solid #000; margin-top: 20px; }
  h2 { font-size: 16px; margin: 20px 0 10px; background: #f0f0f0; padding: 5px; border-left: 3px solid #000; }
  h3 { font-size: 14px; margin: 15px 0 5px; color: #333; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 12px; }
  td, th { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
  th { background: #f5f5f5; font-weight: bold; }
  hr { border: none; border-top: 1px dashed #ccc; margin: 20px 0; }
  .footer { font-size: 10px; color: #666; margin-top: 30px; text-align: center; border-top: 1px solid #ccc; padding-top: 10px; }
  pre { background: #f9f9f9; border: 1px solid #e0e0e0; padding: 8px; overflow-x: auto; font-size: 10px; }
  .summary { background: #f9f9f9; padding: 10px; margin: 10px 0; border-left: 3px solid #000; }
  .badge { display: inline-block; background: linear-gradient(135deg, #ff6b6b, #ff8e53); color: white; padding: 2px 8px; border-radius: 3px; font-size: 10px; margin-left: 8px; }
</style>
</head>
<body>
<div class="report">
  <h1>📊 ОТЧЕТ ТЕСТА ПРОИЗВОДИТЕЛЬНОСТИ <span class="badge">PlayCanvas</span></h1>
  <div class="summary">
    <strong>Дата теста:</strong> ${formatDate(report.timestamp)}<br>
    <strong>Длительность:</strong> ${report.duration_seconds.toFixed(1)} сек (${(report.duration_seconds / 60).toFixed(1)} мин)<br>
    <strong>Замеров:</strong> ${report.raw_data.timestamps.length}
  </div>
  <h2>1. ИНФОРМАЦИЯ О СИСТЕМЕ</h2>
  <table>
    <tr><th>Режим работы</th><td>${report.system_info.mode}</td></tr>
    <tr><th>Процессор</th><td>${report.system_info.cpu}</td></tr>
    <tr><th>Видеокарта</th><td>${report.system_info.gpu}</td></tr>
    <tr><th>ОЗУ</th><td>${report.system_info.ramTotal}</td></tr>
    <tr><th>VRAM</th><td>${report.system_info.vramTotal}</td></tr>
  </table>
  ${report.model_info ? `<h2>2. ИНФОРМАЦИЯ О МОДЕЛИ</h2>
  <table>
    <tr><th>Имя файла</th><td>${report.model_info.fileName}</td></tr>
    <tr><th>Размер</th><td>${report.model_info.fileSize}</td></tr>
    <tr><th>Mesh</th><td>${report.model_info.meshCount}</td></tr>
    <tr><th>Полигоны</th><td>${report.model_info.triangleCount}</td></tr>
  </table>` : ''}
  <h2>3. РЕЗУЛЬТАТЫ ТЕСТА</h2>
  <h3>3.1 CPU</h3>
  <table>
    <tr><th>Средняя</th><td>${formatNumber(report.statistics.cpu.avg)}</td><td>%</td></tr>
    <tr><th>Максимальная</th><td>${formatNumber(report.statistics.cpu.max)}</td><td>%</td></tr>
    <tr><th>Минимальная</th><td>${formatNumber(report.statistics.cpu.min)}</td><td>%</td></tr>
    <tr><th>95-й перцентиль</th><td>${formatNumber(report.statistics.cpu.p95)}</td><td>%</td></tr>
  </table>
  ${generateAsciiChart(report.raw_data.cpu, 50, 8, 'Загрузка CPU')}
  
  <h3>3.2 GPU</h3>
  <table>
    <tr><th>Средняя</th><td>${formatNumber(report.statistics.gpu.avg)}</td><td>%</td></tr>
    <tr><th>Максимальная</th><td>${formatNumber(report.statistics.gpu.max)}</td><td>%</td></tr>
    <tr><th>Минимальная</th><td>${formatNumber(report.statistics.gpu.min)}</td><td>%</td></tr>
    <tr><th>95-й перцентиль</th><td>${formatNumber(report.statistics.gpu.p95)}</td><td>%</td></tr>
  </table>
  ${generateAsciiChart(report.raw_data.gpu, 50, 8, 'Загрузка GPU')}
  
  <h3>3.3 RAM</h3>
  <table>
    <tr><th>Средняя</th><td>${formatNumber(report.statistics.ram.avg)}</td><td>%</td></tr>
    <tr><th>Максимальная</th><td>${formatNumber(report.statistics.ram.max)}</td><td>%</td></tr>
    <tr><th>Минимальная</th><td>${formatNumber(report.statistics.ram.min)}</td><td>%</td></tr>
    <tr><th>95-й перцентиль</th><td>${formatNumber(report.statistics.ram.p95)}</td><td>%</td></tr>
  </table>
  ${generateAsciiChart(report.raw_data.ram, 50, 8, 'Загрузка RAM')}
  
  <h3>3.4 VRAM</h3>
  <table>
    <tr><th>Средняя</th><td>${formatNumber(report.statistics.vram.avg)}</td><td>%</td></tr>
    <tr><th>Максимальная</th><td>${formatNumber(report.statistics.vram.max)}</td><td>%</td></tr>
    <tr><th>Минимальная</th><td>${formatNumber(report.statistics.vram.min)}</td><td>%</td></tr>
    <tr><th>95-й перцентиль</th><td>${formatNumber(report.statistics.vram.p95)}</td><td>%</td></tr>
  </table>
  ${generateAsciiChart(report.raw_data.vram, 50, 8, 'Загрузка VRAM')}
  
  <h3>3.5 FPS</h3>
  <table>
    <tr><th>Средний</th><td>${formatNumber(report.statistics.fps.avg)}</td><td>fps</td></tr>
    <tr><th>Максимальный</th><td>${formatNumber(report.statistics.fps.max)}</td><td>fps</td></tr>
    <tr><th>Минимальный</th><td>${formatNumber(report.statistics.fps.min)}</td><td>fps</td></tr>
    <tr><th>95-й перцентиль</th><td>${formatNumber(report.statistics.fps.p95)}</td><td>fps</td></tr>
  </table>
  ${generateAsciiChart(report.raw_data.fps, 50, 8, 'Частота кадров')}
  
  <h3>3.6 Draw Calls</h3>
  <table>
    <tr><th>Среднее</th><td>${Math.round(report.statistics.draws.avg)}</td><td>calls</td></tr>
    <tr><th>Максимум</th><td>${Math.round(report.statistics.draws.max)}</td><td>calls</td></tr>
    <tr><th>Минимум</th><td>${Math.round(report.statistics.draws.min)}</td><td>calls</td></tr>
    <tr><th>95-й перцентиль</th><td>${Math.round(report.statistics.draws.p95)}</td><td>calls</td></tr>
  </table>
  ${generateAsciiChart(report.raw_data.draws, 50, 8, 'Draw Calls')}
  
  <h3>3.7 Triangles</h3>
  <table>
    <tr><th>Среднее</th><td>${Math.round(report.statistics.triangles.avg)}</td></tr>
    <tr><th>Максимум</th><td>${Math.round(report.statistics.triangles.max)}</td></tr>
    <tr><th>Минимум</th><td>${Math.round(report.statistics.triangles.min)}</td></tr>
    <tr><th>95-й перцентиль</th><td>${Math.round(report.statistics.triangles.p95)}</td></tr>
  </table>
  ${generateAsciiChart(report.raw_data.triangles, 50, 8, 'Треугольники')}
  
  ${report.statistics.cpuTemp ? `
  <h3>3.8 Температуры</h3>
  <h4>CPU</h4>
  <table>
    <tr><th>Средняя</th><td>${formatNumber(report.statistics.cpuTemp.avg)}</td><td>°C</td></tr>
    <tr><th>Максимальная</th><td>${formatNumber(report.statistics.cpuTemp.max)}</td><td>°C</td></tr>
    <tr><th>Минимальная</th><td>${formatNumber(report.statistics.cpuTemp.min)}</td><td>°C</td></tr>
  </table>
  ${generateAsciiChart(report.raw_data.cpuTemp, 50, 8, 'Температура CPU')}
  
  <h4>GPU</h4>
  <table>
    <tr><th>Средняя</th><td>${formatNumber(report.statistics.gpuTemp.avg)}</td><td>°C</td></tr>
    <tr><th>Максимальная</th><td>${formatNumber(report.statistics.gpuTemp.max)}</td><td>°C</td></tr>
    <tr><th>Минимальная</th><td>${formatNumber(report.statistics.gpuTemp.min)}</td><td>°C</td></tr>
  </table>
  ${generateAsciiChart(report.raw_data.gpuTemp, 50, 8, 'Температура GPU')}
  ` : ''}
  
  <hr>
  <h2>4. ИТОГОВАЯ ОЦЕНКА</h2>
  <div class="summary">
    <strong>Стабильность FPS:</strong> ${((report.statistics.fps.min / report.statistics.fps.max) * 100).toFixed(1)}%<br>
    <strong>CPU средняя:</strong> ${formatNumber(report.statistics.cpu.avg)}%<br>
    <strong>GPU средняя:</strong> ${formatNumber(report.statistics.gpu.avg)}%<br>
    <strong>RAM макс:</strong> ${formatNumber(report.statistics.ram.max)}%<br>
    <strong>VRAM макс:</strong> ${formatNumber(report.statistics.vram.max)}%
  </div>
  <div class="footer">Отчет сгенерирован системой тестирования PlayCanvas 3D Viewer</div>
</div>
</body>
</html>`;
}

function generateAndDownloadReport() {
  const report = generateBenchmarkReport();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  const json = JSON.stringify(report, null, 2);
  const jsonBlob = new Blob([json], { type: 'application/json' });
  const jsonUrl = URL.createObjectURL(jsonBlob);
  const jsonA = document.createElement('a');
  jsonA.href = jsonUrl;
  jsonA.download = `benchmark_${timestamp}.json`;
  document.body.appendChild(jsonA);
  jsonA.click();
  document.body.removeChild(jsonA);
  URL.revokeObjectURL(jsonUrl);
  
  const html = generateSimpleHTMLReport(report);
  const htmlBlob = new Blob([html], { type: 'text/html' });
  const htmlUrl = URL.createObjectURL(htmlBlob);
  const htmlA = document.createElement('a');
  htmlA.href = htmlUrl;
  htmlA.download = `benchmark_${timestamp}.html`;
  document.body.appendChild(htmlA);
  htmlA.click();
  document.body.removeChild(htmlA);
  URL.revokeObjectURL(htmlUrl);
  
  setStatus(`Тест завершен! Сохранены: benchmark_${timestamp}.json и .html`);
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
  
  benchmarkData = { cpu: [], ram: [], gpu: [], vram: [], fps: [], draws: [], triangles: [], cpuTemp: [], gpuTemp: [], timestamps: [] };
  
  originalAutoRotate = autoRotate;
  autoRotate = true;
  rotateButton.textContent = 'Пауза';
  
  benchmarkActive = true;
  benchmarkStartTime = performance.now();
  setStatus('Тест запущен на 3 минуты...');
  benchmarkButton.textContent = 'Тест выполняется...';
  benchmarkButton.disabled = true;
  
  benchmarkTimerDiv.style.display = 'flex';
  timerValueDiv.textContent = '03:00';
  timerValueDiv.style.color = '#ffffff';
  timerValueDiv.style.animation = 'none';
  timerProgressBar.style.width = '0%';
  
  benchmarkTimerInterval = setInterval(() => {
    if (benchmarkActive) updateBenchmarkTimer();
  }, 100);
  
  setTimeout(() => {
    if (benchmarkActive) finishBenchmark();
  }, 180000);
}

function finishBenchmark() {
  benchmarkActive = false;
  if (benchmarkTimerInterval) clearInterval(benchmarkTimerInterval);
  benchmarkTimerDiv.style.display = 'none';
  autoRotate = originalAutoRotate;
  rotateButton.textContent = autoRotate ? 'Пауза' : 'Старт';
  benchmarkButton.textContent = 'Тест 3 мин';
  benchmarkButton.disabled = false;
  setStatus('Тест завершен, формирование отчета...');
  generateAndDownloadReport();
}

// Добавляем CSS для таймера
const style = document.createElement('style');
style.textContent = `
  .benchmark-timer { position: absolute; top: 20px; right: 20px; background: rgba(0,0,0,0.85); backdrop-filter: blur(10px); border-radius: 12px; padding: 12px 20px; display: flex; flex-direction: column; align-items: center; gap: 8px; border: 1px solid rgba(255,255,255,0.2); box-shadow: 0 4px 15px rgba(0,0,0,0.3); z-index: 1000; font-family: 'Courier New', monospace; }
  .timer-label { font-size: 12px; color: #aaa; letter-spacing: 1px; font-weight: 500; }
  .timer-value { font-size: 32px; font-weight: bold; color: #fff; text-shadow: 0 0 10px rgba(0,255,0,0.5); transition: color 0.3s ease; }
  .timer-progress { width: 100%; height: 3px; background: rgba(255,255,255,0.2); border-radius: 3px; overflow: hidden; }
  .timer-progress-bar { height: 100%; background: linear-gradient(90deg, #4caf50, #8bc34a); width: 0%; transition: width 0.1s linear; border-radius: 3px; }
  @keyframes pulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.7; transform: scale(1.05); } }
  .viewer { position: relative; }
`;
document.head.appendChild(style);

// Обработчики кнопок
fileInput.addEventListener('change', async (event) => {
  const [file] = event.target.files ?? [];
  await loadStepFile(file);
});

rotateButton.addEventListener('click', () => {
  autoRotate = !autoRotate;
  rotateButton.textContent = autoRotate ? 'Пауза' : 'Старт';
});

fitButton.addEventListener('click', () => {
  fitCameraToBounds(currentModel?.bounds);
});

benchmarkButton.addEventListener('click', () => {
  startBenchmark();
});

window.addEventListener('resize', resizeRenderer);

// Функция обновления FPS для метрик
function updateFPS() {
  const now = performance.now();
  const delta = now - lastFrameTime;
  lastFrameTime = now;
  frameAccumulator += delta;
  frameCounter++;
  if (frameAccumulator >= 500) {
    fps = (frameCounter * 1000) / frameAccumulator;
    frameAccumulator = 0;
    frameCounter = 0;
  }
}

// Рендер-луп - скорость вращения увеличена (0.8 вместо 0.45) и направление изменено
app.on('update', (dt) => {
  updateFPS();
  if (autoRotate && currentModel) {
    orbitState.yaw -= dt * 0.8; // Минус для вращения в другую сторону, увеличенная скорость
    updateCameraTransform();
  }
});

// Инициализация
updateCameraTransform();
loadStaticSystemInfo();
refreshMetrics();
setInterval(() => refreshMetrics(), 1000);
resizeRenderer();