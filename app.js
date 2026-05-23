/**
 * WeaveArt - Application Orchestrator
 * Connects UI elements to the weaving engine, handles image loading, zoom/pan, and exports.
 */

import { renderWeave } from './weaving-engine.js';

// === 全局状态管理 ===
const state = {
  imageA: null,
  imageB: null,
  
  // 渲染参数（与 UI 控制器一一对应）
  options: {
    weftColor: '#0f172a',
    weftMode: 'image', // 'image' | 'color'
    weaveType: 'grid', // 'grid' | 'shift'
    densityX: 30,
    densityY: 30,
    offsetX: 0,
    offsetY: 15,
    waveType: 'alternating',
    weavePattern: 'plain',
    shadowDepth: 40,
    edgeHighlight: 20,
    paperTexture: 'none'
  },
  
  // 缩放与平移参数
  zoom: 1.0,
  panX: 0,
  panY: 0,
  isDragging: false,
  dragStart: { x: 0, y: 0 }
};

// === DOM 元素引用 ===
const el = {
  canvas: document.getElementById('weave-canvas'),
  canvasContainer: document.getElementById('canvas-container'),
  canvasWrapper: document.getElementById('canvas-wrapper'),
  
  // 上传与预览
  dropZoneA: document.getElementById('drop-zone-a'),
  dropZoneB: document.getElementById('drop-zone-b'),
  inputA: document.getElementById('input-image-a'),
  inputB: document.getElementById('input-image-b'),
  previewA: document.getElementById('preview-a'),
  previewB: document.getElementById('preview-b'),
  
  // 经纬模式切换
  modeWeftImage: document.getElementById('mode-weft-image'),
  modeWeftColor: document.getElementById('mode-weft-color'),
  colorPickerContainer: document.getElementById('weft-color-picker-container'),
  inputWeftColor: document.getElementById('input-weft-color'),
  labelWeftColor: document.getElementById('label-weft-color'),
  
  // 样例预设
  preset1: document.getElementById('preset-1'),
  preset2: document.getElementById('preset-2'),
  preset3: document.getElementById('preset-3'),
  
  // 顶部与底部全局动作
  btnReset: document.getElementById('btn-reset'),
  btnExport: document.getElementById('btn-export'),
  
  // 编织类型选择
  typeGrid: document.getElementById('type-grid'),
  typeShift: document.getElementById('type-shift'),
  
  // 滑块与控制组
  densityX: document.getElementById('range-density-x'),
  densityY: document.getElementById('range-density-y'),
  valDensityX: document.getElementById('val-density-x'),
  valDensityY: document.getElementById('val-density-y'),
  chkLinkDensity: document.getElementById('chk-link-density'),
  
  offsetX: document.getElementById('range-offset-x'),
  offsetY: document.getElementById('range-offset-y'),
  valOffsetX: document.getElementById('val-offset-x'),
  valOffsetY: document.getElementById('val-offset-y'),
  
  selectWaveType: document.getElementById('select-wave-type'),
  selectWeavePattern: document.getElementById('select-weave-pattern'),
  selectPaperTexture: document.getElementById('select-paper-texture'),
  
  shadowDepth: document.getElementById('range-shadow-depth'),
  valShadowDepth: document.getElementById('val-shadow-depth'),
  
  edgeHighlight: document.getElementById('range-edge-highlight'),
  valEdgeHighlight: document.getElementById('val-edge-highlight'),
  
  // 画布工具条
  zoomIn: document.getElementById('zoom-in'),
  zoomOut: document.getElementById('zoom-out'),
  zoomFit: document.getElementById('zoom-fit'),
  infoResolution: document.getElementById('info-resolution'),
  infoZoom: document.getElementById('info-zoom'),
  
  // 控制显隐的容器组
  groupDensityY: document.getElementById('control-group-density-y'),
  groupLinkDensity: document.getElementById('control-group-link-density'),
  groupOffsetY: document.getElementById('control-group-offset-y'),
  groupWaveType: document.getElementById('control-group-wave-type'),
  groupWeavePattern: document.getElementById('control-group-weave-pattern'),
  labelOffsetX: document.getElementById('label-offset-x')
};

// === 核心：初始化与事件绑定 ===
function init() {
  // 1. 初始化 Feather 图标
  if (window.feather) {
    window.feather.replace();
  }
  
  // 2. 绑定控制滑块、选择框等 UI 变更事件
  bindControlEvents();
  
  // 3. 绑定拖拽与缩放事件
  bindZoomPanEvents();
  
  // 4. 绑定文件上传事件
  bindUploadEvents();
  
  // 5. 绑定样例加载事件
  bindPresetEvents();
  
  // 6. 默认载入第一个样例作为初始图片
  loadPreset(1);
}

// === 渲染与状态更新调度 ===
function scheduleRender() {
  if (!state.imageA) return;
  
  // 同步当前控件状态到 state.options
  state.options.densityX = parseInt(el.densityX.value);
  state.options.densityY = parseInt(el.densityY.value);
  state.options.offsetX = parseInt(el.offsetX.value);
  state.options.offsetY = parseInt(el.offsetY.value);
  state.options.shadowDepth = parseInt(el.shadowDepth.value);
  state.options.edgeHighlight = parseInt(el.edgeHighlight.value);
  state.options.waveType = el.selectWaveType.value;
  state.options.weavePattern = el.selectWeavePattern.value;
  state.options.paperTexture = el.selectPaperTexture.value;
  state.options.weftColor = el.inputWeftColor.value;

  // 调用编织引擎进行实时 Canvas 绘制
  renderWeave(el.canvas, {
    imageA: state.imageA,
    imageB: state.imageB,
    ...state.options
  });
  
  // 更新画布底部状态栏分辨率
  el.infoResolution.textContent = `${el.canvas.width} × ${el.canvas.height} px`;
}

// === 控件事件绑定 ===
function bindControlEvents() {
  // 编织类型切换 (Grid vs Shift)
  el.typeGrid.addEventListener('click', () => {
    el.typeGrid.classList.add('active');
    el.typeShift.classList.remove('active');
    state.options.weaveType = 'grid';
    
    // 更新控制面板组件的显隐
    el.groupDensityY.classList.remove('hidden');
    el.groupLinkDensity.classList.remove('hidden');
    el.groupOffsetY.classList.remove('hidden');
    el.groupWeavePattern.classList.remove('hidden');
    el.groupWaveType.classList.add('hidden');
    el.labelOffsetX.textContent = '经向图像位移 (Warp Shift)';
    
    scheduleRender();
  });

  el.typeShift.addEventListener('click', () => {
    el.typeShift.classList.add('active');
    el.typeGrid.classList.remove('active');
    state.options.weaveType = 'shift';
    
    // 更新控制面板组件的显隐
    el.groupDensityY.classList.add('hidden');
    el.groupLinkDensity.classList.add('hidden');
    el.groupOffsetY.classList.remove('hidden'); // 依然控制最大位移
    el.groupWeavePattern.classList.add('hidden');
    el.groupWaveType.classList.remove('hidden');
    el.labelOffsetX.textContent = '横向相位调节 (Phase Shift)';
    
    scheduleRender();
  });

  // 密度同步控制
  el.densityX.addEventListener('input', () => {
    el.valDensityX.textContent = el.densityX.value;
    if (el.chkLinkDensity.checked && state.options.weaveType === 'grid') {
      el.densityY.value = el.densityX.value;
      el.valDensityY.textContent = el.densityX.value;
    }
    scheduleRender();
  });

  el.densityY.addEventListener('input', () => {
    el.valDensityY.textContent = el.densityY.value;
    if (el.chkLinkDensity.checked) {
      el.densityX.value = el.densityY.value;
      el.valDensityX.textContent = el.densityY.value;
    }
    scheduleRender();
  });

  // 偏移量控制
  el.offsetX.addEventListener('input', () => {
    el.valOffsetX.textContent = `${el.offsetX.value}%`;
    scheduleRender();
  });

  el.offsetY.addEventListener('input', () => {
    el.valOffsetY.textContent = `${el.offsetY.value}%`;
    scheduleRender();
  });

  // 3D 投影与切口控制
  el.shadowDepth.addEventListener('input', () => {
    el.valShadowDepth.textContent = `${el.shadowDepth.value}%`;
    scheduleRender();
  });

  el.edgeHighlight.addEventListener('input', () => {
    el.valEdgeHighlight.textContent = `${el.edgeHighlight.value}%`;
    scheduleRender();
  });

  // 选择框变化
  el.selectWaveType.addEventListener('change', scheduleRender);
  el.selectWeavePattern.addEventListener('change', scheduleRender);
  el.selectPaperTexture.addEventListener('change', scheduleRender);

  // 纬线模式切换 (使用图像 vs 使用纯色)
  el.modeWeftImage.addEventListener('click', () => {
    el.modeWeftImage.classList.add('active');
    el.modeWeftColor.classList.remove('active');
    el.dropZoneB.classList.remove('hidden');
    el.colorPickerContainer.classList.add('hidden');
    state.options.weftMode = 'image';
    scheduleRender();
  });

  el.modeWeftColor.addEventListener('click', () => {
    el.modeWeftColor.classList.add('active');
    el.modeWeftImage.classList.remove('active');
    el.dropZoneB.classList.add('hidden');
    el.colorPickerContainer.classList.remove('hidden');
    state.options.weftMode = 'color';
    scheduleRender();
  });

  // 纯色选择器
  el.inputWeftColor.addEventListener('input', () => {
    const color = el.inputWeftColor.value.toUpperCase();
    el.labelWeftColor.textContent = color;
    // 取消所有 preset 的 active，给自定义颜色
    document.querySelectorAll('.color-preset').forEach(btn => btn.classList.remove('active'));
    scheduleRender();
  });

  // 快捷预设色卡点击
  document.querySelectorAll('.color-preset').forEach(preset => {
    preset.addEventListener('click', (e) => {
      document.querySelectorAll('.color-preset').forEach(btn => btn.classList.remove('active'));
      e.target.classList.add('active');
      const color = e.target.getAttribute('data-color');
      el.inputWeftColor.value = color;
      el.labelWeftColor.textContent = color.toUpperCase();
      scheduleRender();
    });
  });

  // 全局动作
  el.btnReset.addEventListener('click', resetParameters);
  el.btnExport.addEventListener('click', exportResult);
}

// === 重置参数 ===
function resetParameters() {
  el.densityX.value = 30;
  el.valDensityX.textContent = '30';
  el.densityY.value = 30;
  el.valDensityY.textContent = '30';
  el.chkLinkDensity.checked = true;
  
  el.offsetX.value = 0;
  el.valOffsetX.textContent = '0%';
  el.offsetY.value = 15;
  el.valOffsetY.textContent = '15%';
  
  el.shadowDepth.value = 40;
  el.valShadowDepth.textContent = '40%';
  el.edgeHighlight.value = 20;
  el.valEdgeHighlight.textContent = '20%';
  
  el.selectWaveType.value = 'alternating';
  el.selectWeavePattern.value = 'plain';
  el.selectPaperTexture.value = 'none';
  
  // 重置回 grid
  el.typeGrid.click();
  
  resetZoomPan();
  scheduleRender();
}

// === 导出高质量图片 ===
function exportResult() {
  if (!state.imageA) return;
  
  // 创建临时下载链接
  const dataURL = el.canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.download = `WeaveArt_${Date.now()}.png`;
  link.href = dataURL;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// === 缩放和平移事件 (Zoom & Pan) ===
function bindZoomPanEvents() {
  // 鼠标滚轮缩放
  el.canvasWrapper.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomFactor = 1.1;
    if (e.deltaY < 0) {
      zoomCanvas(state.zoom * zoomFactor);
    } else {
      zoomCanvas(state.zoom / zoomFactor);
    }
  });

  // 鼠标拖拽平移 (Pan)
  el.canvasWrapper.addEventListener('mousedown', (e) => {
    // 仅允许左键拖拽
    if (e.button !== 0) return;
    state.isDragging = true;
    el.canvasWrapper.style.cursor = 'grabbing';
    state.dragStart.x = e.clientX - state.panX;
    state.dragStart.y = e.clientY - state.panY;
  });

  window.addEventListener('mousemove', (e) => {
    if (!state.isDragging) return;
    state.panX = e.clientX - state.dragStart.x;
    state.panY = e.clientY - state.dragStart.y;
    applyZoomPan();
  });

  window.addEventListener('mouseup', () => {
    if (state.isDragging) {
      state.isDragging = false;
      el.canvasWrapper.style.cursor = 'grab';
    }
  });

  // 缩放按钮动作
  el.zoomIn.addEventListener('click', () => zoomCanvas(state.zoom * 1.2));
  el.zoomOut.addEventListener('click', () => zoomCanvas(state.zoom / 1.2));
  el.zoomFit.addEventListener('click', resetZoomPan);
}

function zoomCanvas(newZoom) {
  // 限制缩放范围在 0.15 到 5.0 之间
  state.zoom = Math.max(0.15, Math.min(5.0, newZoom));
  applyZoomPan();
}

function resetZoomPan() {
  if (!state.imageA) return;
  
  // 计算恰好契合 wrapper 容器的缩放比例 (Fit Screen)
  const wrapperW = el.canvasWrapper.clientWidth - 40;
  const wrapperH = el.canvasWrapper.clientHeight - 40;
  const canvasW = el.canvas.width;
  const canvasH = el.canvas.height;
  
  const scaleX = wrapperW / canvasW;
  const scaleY = wrapperH / canvasH;
  
  state.zoom = Math.min(scaleX, scaleY, 1.0); // 最大不大于 1.0 原图
  state.panX = 0;
  state.panY = 0;
  
  applyZoomPan();
}

function applyZoomPan() {
  el.canvasContainer.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
  el.infoZoom.textContent = `${Math.round(state.zoom * 100)}%`;
}

// === 上传源图像处理 ===
function bindUploadEvents() {
  // 上传 A (经线/底图)
  el.dropZoneA.addEventListener('click', () => el.inputA.click());
  el.inputA.addEventListener('change', (e) => handleImageUpload(e.target.files[0], 'A'));
  
  // 上传 B (纬线/织线)
  el.dropZoneB.addEventListener('click', () => el.inputB.click());
  el.inputB.addEventListener('change', (e) => handleImageUpload(e.target.files[0], 'B'));

  // 拖拽文件进入
  ['dragenter', 'dragover'].forEach(eventName => {
    el.dropZoneA.addEventListener(eventName, (e) => {
      e.preventDefault();
      el.dropZoneA.classList.add('dragover');
    }, false);
    
    el.dropZoneB.addEventListener(eventName, (e) => {
      e.preventDefault();
      el.dropZoneB.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    el.dropZoneA.addEventListener(eventName, (e) => {
      e.preventDefault();
      el.dropZoneA.classList.remove('dragover');
    }, false);
    
    el.dropZoneB.addEventListener(eventName, (e) => {
      e.preventDefault();
      el.dropZoneB.classList.remove('dragover');
    }, false);
  });

  el.dropZoneA.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    handleImageUpload(dt.files[0], 'A');
  });

  el.dropZoneB.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    handleImageUpload(dt.files[0], 'B');
  });
}

function handleImageUpload(file, layer) {
  if (!file || !file.type.startsWith('image/')) return;
  
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = () => {
    const img = new Image();
    img.src = reader.result;
    img.onload = () => {
      if (layer === 'A') {
        state.imageA = img;
        el.previewA.style.backgroundImage = `url('${img.src}')`;
        el.previewA.classList.add('has-image');
        resetZoomPan();
      } else {
        state.imageB = img;
        el.previewB.style.backgroundImage = `url('${img.src}')`;
        el.previewB.classList.add('has-image');
      }
      scheduleRender();
    };
  };
}

// === 样例加载控制 (Preset loading) ===
function bindPresetEvents() {
  el.preset1.addEventListener('click', () => loadPreset(1));
  el.preset2.addEventListener('click', () => loadPreset(2));
  el.preset3.addEventListener('click', () => loadPreset(3));
}

function loadPreset(id) {
  // 设置样例图片地址
  const samplePath = `assets/sample${id}.jpg`;
  const img = new Image();
  img.src = samplePath;
  img.onload = () => {
    state.imageA = img;
    state.imageB = null; // 样例默认与自己编织或纯色编织
    
    // 设置上传预览框的缩略图背景
    el.previewA.style.backgroundImage = `url('${samplePath}')`;
    el.previewA.classList.add('has-image');
    
    // 清空纬线图像上传状态，显示默认的加号
    el.previewB.style.backgroundImage = 'none';
    el.previewB.classList.remove('has-image');
    
    // 根据样例自动配置最匹配的参数以呼应参考图效果
    if (id === 1) {
      // 竖条错位波浪
      el.typeShift.click();
      el.selectWaveType.value = 'sine';
      
      el.densityX.value = 35;
      el.valDensityX.textContent = '35';
      
      el.offsetY.value = 12;
      el.valOffsetY.textContent = '12%';
      
      el.shadowDepth.value = 45;
      el.valShadowDepth.textContent = '45%';
      
      el.edgeHighlight.value = 15;
      el.valEdgeHighlight.textContent = '15%';
      
      el.selectPaperTexture.value = 'none';
      
      // 纬线设置成底图色（配合错位时的背景透出，图1的蓝色调背景）
      el.modeWeftColor.click();
      el.inputWeftColor.value = '#105265'; // 深蓝绿底色
      el.labelWeftColor.textContent = '#105265';
    } 
    else if (id === 2) {
      // 马赛克格子平织
      el.typeGrid.click();
      el.selectWeavePattern.value = 'plain';
      
      el.densityX.value = 40;
      el.valDensityX.textContent = '40';
      el.densityY.value = 40;
      el.valDensityY.textContent = '40';
      el.chkLinkDensity.checked = true;
      
      // 设置微弱的偏移，使得格子产生重叠与像素立体感
      el.offsetX.value = 8;
      el.valOffsetX.textContent = '8%';
      el.offsetY.value = 12;
      el.valOffsetY.textContent = '12%';
      
      el.shadowDepth.value = 55;
      el.valShadowDepth.textContent = '55%';
      
      el.edgeHighlight.value = 20;
      el.valEdgeHighlight.textContent = '20%';
      
      el.selectPaperTexture.value = 'matte'; // 哑光纸
      
      el.modeWeftImage.click(); // 默认使用图像副本混合
    } 
    else if (id === 3) {
      // 斜纹阶梯质感
      el.typeGrid.click();
      el.selectWeavePattern.value = 'twill-2-2'; // 2x2斜纹
      
      el.densityX.value = 26;
      el.valDensityX.textContent = '26';
      el.densityY.value = 26;
      el.valDensityY.textContent = '26';
      el.chkLinkDensity.checked = true;
      
      el.offsetX.value = 0;
      el.valOffsetX.textContent = '0%';
      el.offsetY.value = 8;
      el.valOffsetY.textContent = '8%';
      
      el.shadowDepth.value = 50;
      el.valShadowDepth.textContent = '50%';
      
      el.edgeHighlight.value = 25;
      el.valEdgeHighlight.textContent = '25%';
      
      el.selectPaperTexture.value = 'linen'; // 细密亚麻布纹
      
      el.modeWeftImage.click();
    }
    
    // 初始化自适应视口尺寸并绘制
    resetZoomPan();
    scheduleRender();
  };
}

// 页面加载完成后启动
window.addEventListener('DOMContentLoaded', init);
