/**
 * WeaveArt - Weaving Engine
 * Handles image slicing, weave matrix calculation, 3D shadows, and textures.
 */

// 伪随机数发生器（带种子，保证相同参数下随机结果一致）
function seededRandom(seed) {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}

/**
 * 创建程序化纸张纹理
 * @param {string} type 纹理类型 ('matte', 'canvas', 'linen')
 * @param {number} width 画布宽
 * @param {number} height 画布高
 * @returns {CanvasPattern|null} Canvas 纹理填充模式
 */
function createProceduralTexture(ctx, type, width, height) {
  if (type === 'none') return null;

  // 创建一个小型的离屏画布来平铺纹理，提高性能
  const patternCanvas = document.createElement('canvas');
  const pCtx = patternCanvas.getContext('2d');

  if (type === 'matte') {
    // 哑光特种纸：细微杂色
    patternCanvas.width = 128;
    patternCanvas.height = 128;
    const imgData = pCtx.createImageData(128, 128);
    for (let i = 0; i < imgData.data.length; i += 4) {
      // 产生 128-135 之间的微弱灰度变化
      const val = 128 + Math.floor(Math.random() * 8);
      imgData.data[i] = val;     // R
      imgData.data[i + 1] = val; // G
      imgData.data[i + 2] = val; // B
      imgData.data[i + 3] = 255; // A
    }
    pCtx.putImageData(imgData, 0, 0);
  } 
  else if (type === 'canvas') {
    // 粗糙画布：较粗的十字网格
    patternCanvas.width = 8;
    patternCanvas.height = 8;
    pCtx.fillStyle = '#e2e8f0'; // 浅灰色底色
    pCtx.fillRect(0, 0, 8, 8);
    
    pCtx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
    pCtx.lineWidth = 1;
    // 画横竖线
    pCtx.beginPath();
    pCtx.moveTo(0, 4);
    pCtx.lineTo(8, 4);
    pCtx.moveTo(4, 0);
    pCtx.lineTo(4, 8);
    pCtx.stroke();

    // 细微白色高光线增强立体感
    pCtx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    pCtx.beginPath();
    pCtx.moveTo(0, 5);
    pCtx.lineTo(8, 5);
    pCtx.moveTo(5, 0);
    pCtx.lineTo(5, 8);
    pCtx.stroke();
  } 
  else if (type === 'linen') {
    // 亚麻布：细密且带有些许无规则的编织肌理
    patternCanvas.width = 4;
    patternCanvas.height = 4;
    pCtx.fillStyle = '#f1f5f9';
    pCtx.fillRect(0, 0, 4, 4);

    pCtx.strokeStyle = 'rgba(0, 0, 0, 0.05)';
    pCtx.lineWidth = 0.5;
    pCtx.beginPath();
    pCtx.moveTo(0, 2);
    pCtx.lineTo(4, 2);
    pCtx.moveTo(2, 0);
    pCtx.lineTo(2, 4);
    pCtx.stroke();
  }

  return ctx.createPattern(patternCanvas, 'repeat');
}

/**
 * 判断在 grid 编织模式下，Warp (经线，垂直线) 是否在上方
 * @param {number} i 经线索引 (x轴)
 * @param {number} j 纬线索引 (y轴)
 * @param {string} pattern 编织类型
 * @returns {boolean} true 为 经线在上，false 为 纬线在上
 */
function isWarpOnTop(i, j, pattern) {
  switch (pattern) {
    case 'plain':
      // 1x1 平纹交错
      return (i + j) % 2 === 0;

    case 'twill-2-2': {
      // 2x2 斜纹阶梯 (Over 2, Under 2, 每行右移1格)
      const repeat = 4;
      const val = ((i - j) % repeat + repeat) % repeat;
      return val < 2;
    }

    case 'twill-3-3': {
      // 3x3 斜纹阶梯 (Over 3, Under 3, 每行右移1格)
      const repeat = 6;
      const val = ((i - j) % repeat + repeat) % repeat;
      return val < 3;
    }

    case 'custom-diagonal':
      // 纯对角线遮挡 (例如 i == j 形式的斜条)
      return (i + j) % 3 === 0;

    default:
      return (i + j) % 2 === 0;
  }
}

/**
 * 根据波形算法计算垂直偏移像素 dy
 */
function getShiftOffset(i, densityX, waveType, maxShift, offsetX) {
  switch (waveType) {
    case 'alternating':
      return maxShift * (i % 2 === 0 ? 1 : -1);
    case 'sine': {
      // 周期为 2，把波形横向铺开
      const angle = (i / densityX) * Math.PI * 4 + (offsetX / 100) * Math.PI * 2;
      return Math.sin(angle) * maxShift;
    }
    case 'triangle': {
      const period = densityX / 2;
      const phase = (offsetX / 100) * period;
      const val = ((i + phase) % period) / period; // 0 到 1
      return maxShift * (val < 0.5 ? 4 * val - 1 : 3 - 4 * val);
    }
    case 'random':
      // 使用带种子的伪随机，以保证拖拽滑块时不会闪烁
      return (seededRandom(i + 100) * 2 - 1) * maxShift;
    default:
      return 0;
  }
}

/**
 * 核心渲染函数
 * @param {HTMLCanvasElement} canvas 目标画布
 * @param {Object} options 渲染参数
 */
export function renderWeave(canvas, options) {
  const {
    imageA,
    imageB,
    weftColor = '#0f172a',
    weftMode = 'image', // 'image' | 'color'
    weaveType = 'grid', // 'grid' | 'shift'
    densityX = 30,
    densityY = 30,
    offsetX = 0,
    offsetY = 15,
    waveType = 'alternating', // 'alternating' | 'sine' | 'triangle' | 'random'
    weavePattern = 'plain',
    shadowDepth = 40,
    edgeHighlight = 20,
    paperTexture = 'none',
    autoCrop = true,
    stripOrder = 'normal',
    localProcessing = false,
    roi = null
  } = options;

  if (!imageA) return;

  const ctx = canvas.getContext('2d');
  
  // 1. 获取 Image A 的原始尺寸，作为渲染基准
  const W = imageA.naturalWidth || imageA.width;
  const H = imageA.naturalHeight || imageA.height;

  // 局部处理时强制关闭自动切边，以保证外部完整性
  const isLocal = localProcessing && roi && roi.w > 0 && roi.h > 0;
  const activeAutoCrop = isLocal ? false : autoCrop;

  // 2. 如果是竖条错位且开启了自动切边，计算切边范围
  let cropTop = 0;
  let cropBottom = H;
  let targetHeight = H;
  const maxShift = (offsetY / 100) * H;

  if (weaveType === 'shift' && activeAutoCrop && maxShift > 0) {
    let maxDy = -Infinity;
    let minDy = Infinity;
    for (let i = 0; i < densityX; i++) {
      const dy = getShiftOffset(i, densityX, waveType, maxShift, offsetX);
      if (dy > maxDy) maxDy = dy;
      if (dy < minDy) minDy = dy;
    }
    // 裁剪边界
    cropTop = Math.max(0, maxDy);
    cropBottom = Math.min(H, H + minDy);
    if (cropBottom > cropTop) {
      targetHeight = cropBottom - cropTop;
    }
  }

  // 3. 设定主画布的尺寸
  if (canvas.width !== W || canvas.height !== targetHeight) {
    canvas.width = W;
    canvas.height = targetHeight;
  }

  // 4. 决定绘制的目标 Context。如果是切边模式，我们先绘制到离屏 Canvas，再截取到主 Canvas
  const useOffscreen = weaveType === 'shift' && activeAutoCrop && maxShift > 0 && cropBottom > cropTop;
  const renderCanvas = useOffscreen ? document.createElement('canvas') : canvas;
  if (useOffscreen) {
    renderCanvas.width = W;
    renderCanvas.height = H;
  }
  const renderCtx = renderCanvas.getContext('2d');
  renderCtx.clearRect(0, 0, W, H);

  // 5. 先填充背景色（如果需要）
  if (isLocal) {
    // 局部处理：先绘制完整原图，再开启剪裁区域
    renderCtx.drawImage(imageA, 0, 0, W, H);
    renderCtx.save();
    renderCtx.beginPath();
    renderCtx.rect(roi.x, roi.y, roi.w, roi.h);
    renderCtx.clip();
    
    // 在剪裁区内，如需要则填充背景色（由于是局部剪裁，仅填充 roi 区域）
    if (weaveType === 'shift' || (weaveType === 'grid' && weftMode === 'color')) {
      renderCtx.fillStyle = weftColor;
      renderCtx.fillRect(roi.x, roi.y, roi.w, roi.h);
    }
  } else {
    // 全图处理：按需填充整张背景
    if (weaveType === 'shift' || (weaveType === 'grid' && weftMode === 'color')) {
      renderCtx.fillStyle = weftColor;
      renderCtx.fillRect(0, 0, W, H);
    }
  }

  // 6. 核心绘制逻辑
  if (weaveType === 'grid') {
    // 网格经纬编织 (Grid Weave)
    const w = W / densityX; // 经线宽度
    const h = H / densityY; // 纬线高度
    const pxOffsetX = (offsetX / 100) * W;
    const pxOffsetY = (offsetY / 100) * H;

    for (let i = 0; i < densityX; i++) {
      for (let j = 0; j < densityY; j++) {
        const x = i * w;
        const y = j * h;
        const warpTop = isWarpOnTop(i, j, weavePattern);

        renderCtx.save();
        renderCtx.beginPath();
        renderCtx.rect(x, y, w, h);
        renderCtx.clip();

        if (warpTop) {
          renderCtx.drawImage(imageA, x, 0, w, H, x, 0, w, H);

          if (shadowDepth > 0) {
            const shadowOpacity = (shadowDepth / 100) * 0.45;
            if (j > 0 && !isWarpOnTop(i, j - 1, weavePattern)) {
              const grad = renderCtx.createLinearGradient(x, y, x, y + h * 0.4);
              grad.addColorStop(0, `rgba(0, 0, 0, ${shadowOpacity})`);
              grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
              renderCtx.fillStyle = grad;
              renderCtx.fillRect(x, y, w, h * 0.4);
            }
            if (j < densityY - 1 && !isWarpOnTop(i, j + 1, weavePattern)) {
              const grad = renderCtx.createLinearGradient(x, y + h, x, y + h * 0.6);
              grad.addColorStop(0, `rgba(0, 0, 0, ${shadowOpacity})`);
              grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
              renderCtx.fillStyle = grad;
              renderCtx.fillRect(x, y + h * 0.6, w, h * 0.4);
            }
          }

          if (edgeHighlight > 0) {
            renderCtx.strokeStyle = `rgba(255, 255, 255, ${(edgeHighlight / 100) * 0.25})`;
            renderCtx.lineWidth = 1;
            renderCtx.beginPath();
            renderCtx.moveTo(x + 0.5, y);
            renderCtx.lineTo(x + 0.5, y + h);
            renderCtx.moveTo(x + w - 0.5, y);
            renderCtx.lineTo(x + w - 0.5, y + h);
            renderCtx.stroke();
          }

        } else {
          if (weftMode === 'image') {
            const sourceImg = imageB || imageA;
            let srcX = (x + pxOffsetX) % W;
            if (srcX < 0) srcX += W;
            let srcY = (y + pxOffsetY) % H;
            if (srcY < 0) srcY += H;

            renderCtx.drawImage(sourceImg, 0, y, W, h, 0, y, W, h);
            
            renderCtx.save();
            renderCtx.beginPath();
            renderCtx.rect(x, y, w, h);
            renderCtx.clip();
            renderCtx.drawImage(sourceImg, srcX, srcY, w, h, x, y, w, h);
            renderCtx.restore();
          } else {
            renderCtx.fillStyle = weftColor;
            renderCtx.fillRect(x, y, w, h);
          }

          if (shadowDepth > 0) {
            const shadowOpacity = (shadowDepth / 100) * 0.45;
            if (i > 0 && isWarpOnTop(i - 1, j, weavePattern)) {
              const grad = renderCtx.createLinearGradient(x, y, x + w * 0.4, y);
              grad.addColorStop(0, `rgba(0, 0, 0, ${shadowOpacity})`);
              grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
              renderCtx.fillStyle = grad;
              renderCtx.fillRect(x, y, w * 0.4, h);
            }
            if (i < densityX - 1 && isWarpOnTop(i + 1, j, weavePattern)) {
              const grad = renderCtx.createLinearGradient(x + w, y, x + w * 0.6, y);
              grad.addColorStop(0, `rgba(0, 0, 0, ${shadowOpacity})`);
              grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
              renderCtx.fillStyle = grad;
              renderCtx.fillRect(x + w * 0.6, y, w * 0.4, h);
            }
          }

          if (edgeHighlight > 0) {
            renderCtx.strokeStyle = `rgba(255, 255, 255, ${(edgeHighlight / 100) * 0.25})`;
            renderCtx.lineWidth = 1;
            renderCtx.beginPath();
            renderCtx.moveTo(x, y + 0.5);
            renderCtx.lineTo(x + w, y + 0.5);
            renderCtx.moveTo(x, y + h - 0.5);
            renderCtx.lineTo(x + w, y + h - 0.5);
            renderCtx.stroke();
          }
        }
        renderCtx.restore();
      }
    }

  } else if (weaveType === 'shift') {
    // 竖条波形错位 (Vertical Wave Shift)
    const w = W / densityX; // 竖条宽度

    // 1. 生成列索引数组
    let indices = Array.from({ length: densityX }, (_, idx) => idx);

    // 2. 根据重排方式进行列交换
    if (stripOrder === 'mirror-swap') {
      const half = Math.floor(densityX / 2);
      for (let i = 0; i < half; i++) {
        if (i % 2 === 1) {
          const opposite = densityX - 1 - i;
          const temp = indices[i];
          indices[i] = indices[opposite];
          indices[opposite] = temp;
        }
      }
    } else if (stripOrder === 'faro-shuffle') {
      const shuffled = [];
      const mid = Math.ceil(densityX / 2);
      for (let k = 0; k < mid; k++) {
        shuffled.push(k);
        if (mid + k < densityX) {
          shuffled.push(mid + k);
        }
      }
      indices = shuffled;
    } else if (stripOrder === 'random-shuffle') {
      let m = indices.length, t, tempIdx;
      while (m) {
        const r = seededRandom(9999 + m); // 固定种子
        tempIdx = Math.floor(r * m--);
        t = indices[m];
        indices[m] = indices[tempIdx];
        indices[tempIdx] = t;
      }
    }

    for (let i = 0; i < densityX; i++) {
      const destX = i * w;
      const srcIndex = indices[i];
      const srcX = srcIndex * w;
      const dy = getShiftOffset(i, densityX, waveType, maxShift, offsetX);

      renderCtx.save();

      if (shadowDepth > 0) {
        renderCtx.shadowColor = `rgba(0, 0, 0, ${(shadowDepth / 100) * 0.4})`;
        renderCtx.shadowBlur = Math.abs(dy) * 0.1 + 8;
        renderCtx.shadowOffsetX = 0;
        renderCtx.shadowOffsetY = 4;
      }

      // 从原位置 srcX 裁剪，绘制到目标位置 destX
      renderCtx.drawImage(imageA, srcX, 0, w, H, destX, dy, w, H);

      if (edgeHighlight > 0) {
        renderCtx.shadowColor = 'transparent';
        renderCtx.strokeStyle = `rgba(255, 255, 255, ${(edgeHighlight / 100) * 0.25})`;
        renderCtx.lineWidth = 1;
        renderCtx.beginPath();
        renderCtx.moveTo(destX + 0.5, dy);
        renderCtx.lineTo(destX + 0.5, dy + H);
        renderCtx.moveTo(destX + w - 0.5, dy);
        renderCtx.lineTo(destX + w - 0.5, dy + H);
        renderCtx.stroke();
      }

      renderCtx.restore();
    }
  }

  // 如果是局部处理，在此处恢复剪裁环境，以便纸纹和离屏拷贝能处理完整画布
  if (isLocal) {
    renderCtx.restore();
  }

  // 7. 纸张肌理叠加层
  if (paperTexture !== 'none') {
    const texPattern = createProceduralTexture(renderCtx, paperTexture, W, H);
    if (texPattern) {
      renderCtx.save();
      renderCtx.globalCompositeOperation = 'multiply';
      renderCtx.fillStyle = texPattern;
      renderCtx.fillRect(0, 0, W, H);
      renderCtx.restore();
    }
  }

  // 8. 如果使用了离屏 Canvas，将截取后的部分复制回主 Canvas
  if (useOffscreen) {
    ctx.clearRect(0, 0, W, targetHeight);
    ctx.drawImage(renderCanvas, 0, cropTop, W, targetHeight, 0, 0, W, targetHeight);
  }
}

/**
 * 智能检测图像主体区域 (基于显著性检测算法：色彩对比度 + 边缘密度梯度)
 * @param {HTMLImageElement} img 输入图像
 * @returns {Object} {x, y, w, h} 像素级包围框坐标
 */
export function detectSubjectBoundingBox(img) {
  const size = 100; // 使用 100x100 的采样图进行高效分析
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, size, size);
  
  const imgData = ctx.getImageData(0, 0, size, size);
  const data = imgData.data;
  
  // 1. 计算图像的平均色彩
  let rSum = 0, gSum = 0, bSum = 0;
  const pixelCount = size * size;
  for (let i = 0; i < data.length; i += 4) {
    rSum += data[i];
    gSum += data[i + 1];
    bSum += data[i + 2];
  }
  const rAvg = rSum / pixelCount;
  const gAvg = gSum / pixelCount;
  const bAvg = bSum / pixelCount;
  
  // 2. 估计每个像素点的显著性值 (Saliency = 40% 色彩对比度差异 + 60% Sobel-like 局部亮度梯度)
  const saliency = new Float32Array(pixelCount);
  
  // 获取局部像素亮度辅助函数
  const getLum = (x, y) => {
    if (x < 0 || x >= size || y < 0 || y >= size) return 0;
    const idx = (y * size + x) * 4;
    return 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
  };
  
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      
      // A. 色彩与均值的欧式距离
      const colorDist = Math.sqrt((r - rAvg) ** 2 + (g - gAvg) ** 2 + (b - bAvg) ** 2);
      
      // B. 边缘梯度（横向及纵向差分之和）
      const gradX = getLum(x + 1, y) - getLum(x - 1, y);
      const gradY = getLum(x, y + 1) - getLum(x, y - 1);
      const edgeGrad = Math.sqrt(gradX * gradX + gradY * gradY);
      
      saliency[y * size + x] = colorDist * 0.4 + edgeGrad * 0.6;
    }
  }
  
  // 3. 将显著性投影到 X 轴与 Y 轴
  const xProfile = new Float32Array(size);
  const yProfile = new Float32Array(size);
  let totalSaliency = 0;
  
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const val = saliency[y * size + x];
      xProfile[x] += val;
      yProfile[y] += val;
      totalSaliency += val;
    }
  }
  
  // 4. 从分布曲线中截取中间 65% 的主要能量区间，作为主体所在位置
  const getThresholdRange = (profile, total, ratio = 0.65) => {
    const target = total * ratio;
    const padding = (total - target) / 2;
    
    let sum = 0;
    let start = 0;
    for (let i = 0; i < profile.length; i++) {
      sum += profile[i];
      if (sum >= padding) {
        start = i;
        break;
      }
    }
    
    sum = 0;
    let end = profile.length - 1;
    for (let i = profile.length - 1; i >= 0; i--) {
      sum += profile[i];
      if (sum >= padding) {
        end = i;
        break;
      }
    }
    
    // 防御性安全检查，确保选区有合理的尺寸
    if (end <= start) {
      start = Math.floor(profile.length * 0.2);
      end = Math.floor(profile.length * 0.8);
    }
    
    return [start / size, (end - start) / size];
  };
  
  const [xNorm, wNorm] = getThresholdRange(xProfile, totalSaliency);
  const [yNorm, hNorm] = getThresholdRange(yProfile, totalSaliency);
  
  // 5. 还原至原图实际像素分辨率
  const imgW = img.naturalWidth || img.width;
  const imgH = img.naturalHeight || img.height;
  
  return {
    x: Math.round(xNorm * imgW),
    y: Math.round(yNorm * imgH),
    w: Math.round(wNorm * imgW),
    h: Math.round(hNorm * imgH)
  };
}
