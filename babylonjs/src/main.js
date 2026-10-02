import './style.css';
import * as BABYLON from '@babylonjs/core';
import '@babylonjs/loaders';

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

const engine = new BABYLON.Engine(canvas, true, {
  preserveDrawingBuffer: false,
  stencil: true,
  antialias: true,
});

const scene = new BABYLON.Scene(engine);
scene.clearColor = new BABYLON.Color4(0.15, 0.15, 0.15, 1);
scene.autoClear = true;

const camera = new BABYLON.ArcRotateCamera(
  'camera',
  Math.PI / 4,
  Math.PI / 4,
  150,
  BABYLON.Vector3.Zero(),
  scene,
);
camera.attachControl(canvas, true);
camera.wheelPrecision = 50;
camera.panningSensibility = 50;
camera.lowerRadiusLimit = 1;
camera.upperRadiusLimit = 1800;

camera.useAutoRotationBehavior = true;
camera.autoRotationBehavior.idleRotationSpeed = 0.5;
camera.autoRotationBehavior.idleRotationWaitTime = 0;
camera.autoRotationBehavior.idleRotationSpinupTime = 0;

// Единый источник света - направленный свет
const mainLight = new BABYLON.DirectionalLight('mainLight', new BABYLON.Vector3(1, -2, 1), scene);
mainLight.intensity = 1.2;
mainLight.position = new BABYLON.Vector3(5, 10, 5);

// Добавляем небольшой ambient light чтобы тени не были слишком черными
const ambientLight = new BABYLON.HemisphericLight('ambientLight', new BABYLON.Vector3(0, 1, 0), scene);
ambientLight.intensity = 0.3;
ambientLight.groundColor = new BABYLON.Color3(0.2, 0.2, 0.2);

let currentModel = null;
let fps = 0;
let lastFrameAt = performance.now();
let frameAccumulator = 0;
let frameCounter = 0;
let metricsRefreshInFlight = false;
let occtPromise = null;

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

function disposeCurrentModel() {
  if (!currentModel) {
    return;
  }

  currentModel.getChildMeshes().forEach((mesh) => {
    if (mesh.material) {
      mesh.material.dispose();
    }
  });
  currentModel.dispose(false, true);
  currentModel = null;
}

function fitCameraToModel(model) {
  if (!model) {
    return;
  }

  const { min, max } = model.getHierarchyBoundingVectors();
  const size = max.subtract(min);
  const center = min.add(size.scale(0.5));
  const maxSize = Math.max(size.x, size.y, size.z, 1);
  const distance = maxSize * 1.55;

  camera.setTarget(center);
  camera.radius = distance;
  camera.alpha = Math.PI / 4;
  camera.beta = Math.PI / 3;
  camera.lowerRadiusLimit = Math.max(maxSize * 0.01, 0.25);
  camera.upperRadiusLimit = maxSize * 30;
}

function pushHistory(key, value) {
  const history = histories[key];
  if (!history) {
    return;
  }

  history.push(value);
  if (history.length > historySize) {
    history.shift();
  }
}

function drawChart(key, def) {
  const canvasNode = chartCanvases.get(key);
  const valueNode = chartValues.get(key);
  if (!canvasNode || !valueNode) {
    return;
  }

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

  const localMax = Math.max(def.max, ...values.map((value) => value ?? 0), 1);
  ctx.strokeStyle = def.color;
  ctx.lineWidth = 2;
  ctx.beginPath();

  values.forEach((value, index) => {
    const x = (index / Math.max(values.length - 1, 1)) * width;
    const safeValue = Math.min(Math.max(value ?? 0, 0), localMax);
    const y = height - (safeValue / localMax) * (height - 4) - 2;
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });

  ctx.stroke();

  const currentValue = values.at(-1);
  valueNode.textContent =
    currentValue === null || currentValue === undefined
      ? '-'
      : `${currentValue.toFixed(def.decimals)}${def.unit}`;
}

function drawAllCharts() {
  for (const def of chartDefs) {
    drawChart(def.key, def);
  }
}

// Добавьте эту функцию в ваш код:
function getBabylonStats() {
  // Для Babylon.js v5 и выше
  if (engine.getStatistics) {
    return engine.getStatistics();
  }
  
  // Альтернативный метод для старых версий
  const sceneStats = {
    drawCalls: 0,
    totalVertices: 0,
    totalIndices: 0
  };
  
  // Подсчитываем активные меши
  scene.getMeshes().forEach(mesh => {
    if (mesh.isEnabled() && mesh.isVisible && mesh.material) {
      sceneStats.drawCalls++;
      if (mesh.getTotalVertices) {
        sceneStats.totalVertices += mesh.getTotalVertices();
      }
      if (mesh.getTotalIndices) {
        sceneStats.totalIndices += mesh.getTotalIndices();
      }
    }
  });
  
  return sceneStats;
}

function refreshViewerCharts() {
  // Простейший способ - использовать сохраненные данные из модели
  let drawCalls = 0;
  let totalTriangles = 0;
  
  if (currentModel) {
    // Обход всех потомков через разные возможные методы
    if (currentModel.getChildren) {
      // Способ 1: через getChildren
      const children = currentModel.getChildren();
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child.material) {
          drawCalls++;
        }
        // Получаем индексы для треугольников
        if (child.getIndices) {
          const indices = child.getIndices();
          if (indices && indices.length) {
            totalTriangles += indices.length / 3;
          }
        }
      }
    } else if (currentModel._children) {
      // Способ 2: через внутреннее свойство _children
      for (let i = 0; i < currentModel._children.length; i++) {
        const child = currentModel._children[i];
        if (child.material) {
          drawCalls++;
        }
        if (child._indices) {
          totalTriangles += child._indices.length / 3;
        }
      }
    } else if (currentModel.metadata) {
      // Способ 3: используем сохраненные метаданные
      drawCalls = currentModel.metadata.meshCount || 0;
      totalTriangles = currentModel.metadata.totalTriangles || 0;
    }
  }
  
  // Если не удалось получить данные, используем значения по умолчанию
  if (drawCalls === 0 && currentModel) {
    drawCalls = 1; // Хотя бы один draw call
  }
  
  // Сохраняем в историю
  pushHistory('fps', Math.round(fps));
  pushHistory('draws', drawCalls);
  pushHistory('triangles', Math.round(totalTriangles));
  
  // Принудительно обновляем отображение значений на графиках
  const drawsValueElem = document.querySelector('#value-draws');
  const trianglesValueElem = document.querySelector('#value-triangles');
  const fpsValueElem = document.querySelector('#value-fps');
  
  if (drawsValueElem) drawsValueElem.textContent = drawCalls;
  if (trianglesValueElem) trianglesValueElem.textContent = Math.round(totalTriangles).toLocaleString();
  if (fpsValueElem) fpsValueElem.textContent = Math.round(fps);
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
      
      // Простой подсчет draw calls
      let drawCalls = 0;
      let totalTriangles = 0;
      
      if (currentModel) {
        if (currentModel.metadata) {
          drawCalls = currentModel.metadata.meshCount;
          totalTriangles = currentModel.metadata.totalTriangles;
        } else if (currentModel.getChildren) {
          const children = currentModel.getChildren();
          for (let i = 0; i < children.length; i++) {
            if (children[i].material) drawCalls++;
            if (children[i].getIndices) {
              const indices = children[i].getIndices();
              if (indices) totalTriangles += indices.length / 3;
            }
          }
        }
      }
      
      benchmarkData.fps.push(fps);
      benchmarkData.draws.push(drawCalls);
      benchmarkData.triangles.push(Math.round(totalTriangles));
    }
  } catch (error) {
    console.error('Failed to get system metrics', error);
    smallNoteNode.textContent = 'Не удалось получить системные метрики из Electron/systeminformation.';
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
      'Desktop-режим Electron: системные графики приходят из Windows через systeminformation.';
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

function createMeshFromGeometry(geometryMesh, meshIndex, modelGroup) {
  const positions = Array.from(geometryMesh.attributes.position?.array ?? []);
  const indices = Array.from(geometryMesh.index?.array ?? []);

  if (!positions.length || !indices.length) {
    return null;
  }

  const normals = geometryMesh.attributes.normal?.array
    ? Array.from(geometryMesh.attributes.normal.array)
    : null;

  const vertexData = new BABYLON.VertexData();
  vertexData.positions = positions;
  vertexData.indices = indices;
  if (normals?.length) {
    vertexData.normals = normals;
  }

  const mesh = new BABYLON.Mesh(`mesh_${meshIndex}`, scene);
  vertexData.applyToMesh(mesh);
  if (!normals?.length) {
    mesh.createNormals(true);
  }

  const rawColor = geometryMesh.color ?? [0.655, 0.733, 0.8];
  const [r, g, b] = rawColor.map((value) => Math.min(Math.max(value, 0), 1));
  const material = new BABYLON.PBRMaterial(`mat_${meshIndex}`, scene);
  material.albedoColor = new BABYLON.Color3(r, g, b);
  material.metallic = 0.05;
  material.roughness = 0.45;
  material.backFaceCulling = false;
  material.twoSidedLighting = true;
  // Убираем clear coat (блики)
  material.clearCoat.isEnabled = false;

  mesh.material = material;
  mesh.parent = modelGroup;
  // Убираем обводку граней
  mesh.enableEdgesRendering = false;

  return mesh;
}

async function loadStepFile(file) {
  if (!file) {
    return;
  }

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

    currentModel = new BABYLON.TransformNode('modelGroup', scene);
    let totalTriangles = 0;
    let meshCount = 0;

    for (const geometryMesh of result.meshes) {
      const mesh = createMeshFromGeometry(geometryMesh, meshCount, currentModel);
      if (!mesh) {
        continue;
      }

      totalTriangles += mesh.getTotalIndices() / 3;
      meshCount += 1;
    }

    if (!meshCount) {
      throw new Error('STEP прочитан, но геометрия оказалась пустой.');
    }

    currentModel.metadata = {
      totalTriangles: Math.round(totalTriangles),
      meshCount,
    };

    fitCameraToModel(currentModel);

    const loadMs = performance.now() - start;
    meshCountNode.textContent = String(meshCount);
    triangleCountNode.textContent = currentModel.metadata.totalTriangles.toLocaleString('ru-RU');
    setStatus(`Готово за ${loadMs.toFixed(0)} ms`);
  } catch (error) {
    console.error(error);
    disposeCurrentModel();
    setStatus(error instanceof Error ? error.message : 'Ошибка');
  }
}

function resizeRenderer() {
  const parent = canvas.parentElement;
  if (!parent) {
    return;
  }

  const width = parent.clientWidth;
  const height = parent.clientHeight;
  if (width > 0 && height > 0) {
    engine.resize();
  }
}

function updateBenchmarkTimer() {
  const elapsed = (performance.now() - benchmarkStartTime) / 1000;
  const remaining = Math.max(0, 180 - elapsed);
  const minutes = Math.floor(remaining / 60);
  const seconds = Math.floor(remaining % 60);
  
  timerValueDiv.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  
  // Обновляем прогресс-бар
  const progress = (elapsed / 180) * 100;
  timerProgressBar.style.width = `${Math.min(100, progress)}%`;
  
  // Меняем цвет при остатке менее 30 секунд
  if (remaining <= 30) {
    timerValueDiv.style.color = '#ff4444';
    timerValueDiv.style.animation = 'pulse 1s infinite';
  } else if (remaining <= 60) {
    timerValueDiv.style.color = '#ffaa44';
  } else {
    timerValueDiv.style.color = '#ffffff';
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

  // Генерируем простые ASCII графики
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
    <title>Отчет о производительности (Babylon.js)</title>
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
        .metric {
            font-weight: bold;
            margin-top: 10px;
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
    <h1>📊 ОТЧЕТ ТЕСТА ПРОИЗВОДИТЕЛЬНОСТИ <span class="badge">Babylon.js</span></h1>
    
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
        <tr><td>Средняя загрузка</td><td>${formatNumber(report.statistics.gpu.avg)}</td><td>%</td>
        <tr>
        <tr><td>Максимальная загрузка</td><td>${formatNumber(report.statistics.gpu.max)}</td><td>%</td>
        </tr>
        <tr><td>Минимальная загрузка</td><td>${formatNumber(report.statistics.gpu.min)}</td><td>%</td>
        </tr>
        <tr><td>95-й перцентиль</td><td>${formatNumber(report.statistics.gpu.p95)}</td><td>%</td>
        </tr>
    </table>
    ${generateAsciiChart(report.raw_data.gpu, 50, 8, 'Загрузка GPU')}
    
    <h3>3.3 Оперативная память (RAM)</h3>
    <tr>
        <tr><th>Показатель</th><th>Значение</th><th>Ед.изм.</th></tr>
        <tr><td>Средняя загрузка</td><td>${formatNumber(report.statistics.ram.avg)}</td><td>%</td>
        </tr>
        <tr><td>Максимальная загрузка</td><td>${formatNumber(report.statistics.ram.max)}</td><td>%</td>
        </tr>
        <tr><td>Минимальная загрузка</td><td>${formatNumber(report.statistics.ram.min)}</td><td>%</td>
        </tr>
        <tr><td>95-й перцентиль</td><td>${formatNumber(report.statistics.ram.p95)}</td><td>%</td>
        </tr>
    </table>
    ${generateAsciiChart(report.raw_data.ram, 50, 8, 'Загрузка RAM')}
    
    <h3>3.4 Видеопамять (VRAM)</h3>
    </table>
        <tr><th>Показатель</th><th>Значение</th><th>Ед.изм.</th></tr>
        <tr><td>Средняя загрузка</td><td>${formatNumber(report.statistics.vram.avg)}</td><td>%</td>
        </tr>
        <tr><td>Максимальная загрузка</td><td>${formatNumber(report.statistics.vram.max)}</td><td>%</td>
        </tr>
        <tr><td>Минимальная загрузка</td><td>${formatNumber(report.statistics.vram.min)}</td><td>%</td>
        </tr>
        <tr><td>95-й перцентиль</td><td>${formatNumber(report.statistics.vram.p95)}</td><td>%</td>
        </tr>
    </table>
    ${generateAsciiChart(report.raw_data.vram, 50, 8, 'Загрузка VRAM')}
    
    <h3>3.5 Частота кадров (FPS)</h3>
    <table>
        <tr><th>Показатель</th><th>Значение</th><th>Ед.изм.</th></tr>
        <tr><td>Средний FPS</td><td>${formatNumber(report.statistics.fps.avg)}</td><td>fps</td>
        </tr>
        <tr><td>Максимальный FPS</td><td>${formatNumber(report.statistics.fps.max)}</td><td>fps</td>
        </tr>
        <tr><td>Минимальный FPS</td><td>${formatNumber(report.statistics.fps.min)}</td><td>fps</td>
        </tr>
        <tr><td>95-й перцентиль</td><td>${formatNumber(report.statistics.fps.p95)}</td><td>fps</td>
        </tr>
    </table>
    ${generateAsciiChart(report.raw_data.fps, 50, 8, 'Частота кадров')}
    
    <h3>3.6 Draw Calls</h3>
    <table>
        <tr><th>Показатель</th><th>Значение</th><th>Ед.изм.</th></tr>
        <tr><td>Среднее</td><td>${Math.round(report.statistics.draws.avg)}</td><td>calls</td>
        </tr>
        <tr><td>Максимум</td><td>${Math.round(report.statistics.draws.max)}</td><td>calls</td>
        </tr>
        <tr><td>Минимум</td><td>${Math.round(report.statistics.draws.min)}</td><td>calls</td>
        </tr>
        <tr><td>95-й перцентиль</td><td>${Math.round(report.statistics.draws.p95)}</td><td>calls</td>
        </tr>
    </table>
    ${generateAsciiChart(report.raw_data.draws, 50, 8, 'Draw Calls')}
    
    ${report.statistics.cpuTemp ? `
    <h3>3.7 Температуры</h3>
    
    <h4>Температура CPU</h4>
    <table>
        <tr><th>Показатель</th><th>Значение</th><th>Ед.изм.</th></tr>
        <tr><td>Средняя</td><td>${formatNumber(report.statistics.cpuTemp.avg)}</td><td>°C</td>
        </tr>
        <tr><td>Максимальная</td><td>${formatNumber(report.statistics.cpuTemp.max)}</td><td>°C</td>
        </tr>
        <tr><td>Минимальная</td><td>${formatNumber(report.statistics.cpuTemp.min)}</td><td>°C</td>
        </tr>
    </table>
    ${generateAsciiChart(report.raw_data.cpuTemp, 50, 8, 'Температура CPU')}
    
    <h4>Температура GPU</h4>
    <tr>
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
        Отчет сгенерирован автоматически системой тестирования 3D Viewer (Babylon.js)<br>
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
  originalAutoRotate = camera.useAutoRotationBehavior;
  camera.useAutoRotationBehavior = true;
  if (camera.autoRotationBehavior) {
    camera.autoRotationBehavior.idleRotationSpeed = 0.5;
    camera.autoRotationBehavior.idleRotationWaitTime = 0;
    camera.autoRotationBehavior.idleRotationSpinupTime = 0;
  }
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
  
  // Запускаем обновление таймера каждые 100мс для плавности
  benchmarkTimerInterval = setInterval(() => {
    if (benchmarkActive) {
      updateBenchmarkTimer();
    }
  }, 100);
  
  // Таймер на 3 минуты (180000 мс)
  setTimeout(() => {
    if (benchmarkActive) {
      finishBenchmark();
    }
  }, 180000);
}

function finishBenchmark() {
  benchmarkActive = false;
  
  // Очищаем интервал таймера
  if (benchmarkTimerInterval) {
    clearInterval(benchmarkTimerInterval);
    benchmarkTimerInterval = null;
  }
  
  // Скрываем таймер
  benchmarkTimerDiv.style.display = 'none';
  
  // Восстанавливаем исходное состояние автовращения
  camera.useAutoRotationBehavior = originalAutoRotate;
  rotateButton.textContent = camera.useAutoRotationBehavior ? 'Пауза' : 'Старт';
  
  benchmarkButton.textContent = 'Тест 3 мин';
  benchmarkButton.disabled = false;
  
  setStatus('Тест завершен, формирование отчета...');
  
  // Генерируем и скачиваем отчеты
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

fileInput.addEventListener('change', async (event) => {
  const target = event.target;
  const [file] = target.files ?? [];
  await loadStepFile(file);
});

rotateButton.addEventListener('click', () => {
  camera.useAutoRotationBehavior = !camera.useAutoRotationBehavior;
  if (camera.useAutoRotationBehavior && camera.autoRotationBehavior) {
    camera.autoRotationBehavior.idleRotationSpeed = 0.5;
    camera.autoRotationBehavior.idleRotationWaitTime = 0;
    camera.autoRotationBehavior.idleRotationSpinupTime = 0;
  }
  rotateButton.textContent = camera.useAutoRotationBehavior ? 'Пауза' : 'Старт';
});

fitButton.addEventListener('click', () => {
  fitCameraToModel(currentModel);
});

benchmarkButton.addEventListener('click', () => {
  startBenchmark();
});

window.addEventListener('resize', resizeRenderer);

engine.runRenderLoop(() => {
  const now = performance.now();
  const delta = now - lastFrameAt;
  lastFrameAt = now;
  frameAccumulator += delta;
  frameCounter += 1;

  if (frameAccumulator >= 500) {
    fps = (frameCounter * 1000) / frameAccumulator;
    frameAccumulator = 0;
    frameCounter = 0;
  }

  scene.render();
});

window.addEventListener('beforeunload', () => {
  disposeCurrentModel();
  scene.dispose();
  engine.dispose();
});

loadStaticSystemInfo();
refreshMetrics();
setInterval(() => {
  refreshMetrics();
}, 1000);
resizeRenderer();