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
    paperTexture = 'none'
  } = options;

  if (!imageA) return;

  const ctx = canvas.getContext('2d');
  
  // 1. 设置画布物理分辨率（以 Image A 的尺寸为准，保证高清）
  const W = imageA.naturalWidth || imageA.width;
  const H = imageA.naturalHeight || imageA.height;
  
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
  }

  // 清空画布
  ctx.clearRect(0, 0, W, H);

  // 2. 如果是“纯色纬线”或“竖条错位”，先用底色填充画布背景
  if (weaveType === 'shift' || (weaveType === 'grid' && weftMode === 'color')) {
    ctx.fillStyle = weftColor;
    ctx.fillRect(0, 0, W, H);
  }

  // 3. 执行编织算法
  if (weaveType === 'grid') {
    // ==========================================
    // 方案一：网格经纬编织 (Grid Weave)
    // ==========================================
    const w = W / densityX; // 经线纸条宽度
    const h = H / densityY; // 纬线纸条高度

    // 计算实际像素偏移量
    const pxOffsetX = (offsetX / 100) * W;
    const pxOffsetY = (offsetY / 100) * H;

    // 为了实现拟真的编织，我们按网格单元 (i, j) 逐个绘制
    for (let i = 0; i < densityX; i++) {
      for (let j = 0; j < densityY; j++) {
        const x = i * w;
        const y = j * h;
        const warpTop = isWarpOnTop(i, j, weavePattern);

        ctx.save();
        
        // 创建单元格裁剪路径，限制绘制区域
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();

        if (warpTop) {
          // ----------------------------------------
          // 经线在上：绘制垂直纸条的一部分
          // ----------------------------------------
          // 经线使用 Image A (无偏移)
          ctx.drawImage(imageA, x, 0, w, H, x, 0, w, H);

          // 绘制来自上方或下方纬线（Weft）盖过来的 3D 投影
          if (shadowDepth > 0) {
            const shadowOpacity = shadowDepth / 100 * 0.45;
            
            // 如果上方单元格是纬线在上，则上方会投影到当前单元格
            if (j > 0 && !isWarpOnTop(i, j - 1, weavePattern)) {
              const grad = ctx.createLinearGradient(x, y, x, y + h * 0.4);
              grad.addColorStop(0, `rgba(0, 0, 0, ${shadowOpacity})`);
              grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
              ctx.fillStyle = grad;
              ctx.fillRect(x, y, w, h * 0.4);
            }
            
            // 如果下方单元格是纬线在上，则下方会投影到当前单元格
            if (j < densityY - 1 && !isWarpOnTop(i, j + 1, weavePattern)) {
              const grad = ctx.createLinearGradient(x, y + h, x, y + h * 0.6);
              grad.addColorStop(0, `rgba(0, 0, 0, ${shadowOpacity})`);
              grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
              ctx.fillStyle = grad;
              ctx.fillRect(x, y + h * 0.6, w, h * 0.4);
            }
          }

          // 绘制纸条切面边缘高光 (Warp 是垂直纸条，高光在左右边缘)
          if (edgeHighlight > 0) {
            ctx.strokeStyle = `rgba(255, 255, 255, ${edgeHighlight / 100 * 0.25})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x + 0.5, y);
            ctx.lineTo(x + 0.5, y + h);
            ctx.moveTo(x + w - 0.5, y);
            ctx.lineTo(x + w - 0.5, y + h);
            ctx.stroke();
          }

        } else {
          // ----------------------------------------
          // 纬线在上：绘制水平纸条的一部分
          // ----------------------------------------
          if (weftMode === 'image') {
            // 使用 Image B (或没有 Image B 时使用 Image A 偏移版)
            const sourceImg = imageB || imageA;
            // 纬线在水平方向移动，计算带有偏移的源图像坐标，并处理越界循环包裹
            let srcX = (x + pxOffsetX) % W;
            if (srcX < 0) srcX += W;
            let srcY = (y + pxOffsetY) % H;
            if (srcY < 0) srcY += H;

            // 绘制水平条的局部
            ctx.drawImage(sourceImg, 0, y, W, h, 0, y, W, h);
            
            // 为了创造错位效果，我们可以选择将该单元格内容替换为带偏移的版本
            ctx.save();
            ctx.beginPath();
            ctx.rect(x, y, w, h);
            ctx.clip();
            ctx.drawImage(sourceImg, srcX, srcY, w, h, x, y, w, h);
            ctx.restore();

          } else {
            // 使用纯色填充
            ctx.fillStyle = weftColor;
            ctx.fillRect(x, y, w, h);
          }

          // 绘制来自左侧或右侧经线（Warp）盖过来的 3D 投影
          if (shadowDepth > 0) {
            const shadowOpacity = shadowDepth / 100 * 0.45;

            // 如果左侧单元格是经线在上，左侧会投射阴影过来
            if (i > 0 && isWarpOnTop(i - 1, j, weavePattern)) {
              const grad = ctx.createLinearGradient(x, y, x + w * 0.4, y);
              grad.addColorStop(0, `rgba(0, 0, 0, ${shadowOpacity})`);
              grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
              ctx.fillStyle = grad;
              ctx.fillRect(x, y, w * 0.4, h);
            }

            // 如果右侧单元格是经线在上，右侧会投射阴影过来
            if (i < densityX - 1 && isWarpOnTop(i + 1, j, weavePattern)) {
              const grad = ctx.createLinearGradient(x + w, y, x + w * 0.6, y);
              grad.addColorStop(0, `rgba(0, 0, 0, ${shadowOpacity})`);
              grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
              ctx.fillStyle = grad;
              ctx.fillRect(x + w * 0.6, y, w * 0.4, h);
            }
          }

          // 绘制纸条切面边缘高光 (Weft 是水平纸条，高光在上下边缘)
          if (edgeHighlight > 0) {
            ctx.strokeStyle = `rgba(255, 255, 255, ${edgeHighlight / 100 * 0.25})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, y + 0.5);
            ctx.lineTo(x + w, y + 0.5);
            ctx.moveTo(x, y + h - 0.5);
            ctx.lineTo(x + w, y + h - 0.5);
            ctx.stroke();
          }
        }

        ctx.restore();
      }
    }

  } else if (weaveType === 'shift') {
    // ==========================================
    // 方案二：竖条波形错位 (Vertical Wave Shift)
    // ==========================================
    const w = W / densityX; // 竖条宽度
    const maxShift = (offsetY / 100) * H; // 最大垂直偏移像素

    for (let i = 0; i < densityX; i++) {
      const x = i * w;
      let dy = 0;

      // 根据起伏算法计算垂直偏移像素 dy
      switch (waveType) {
        case 'alternating':
          dy = maxShift * (i % 2 === 0 ? 1 : -1);
          break;
        case 'sine': {
          // 周期为 2，把波形横向铺开
          const angle = (i / densityX) * Math.PI * 4 + (offsetX / 100) * Math.PI * 2;
          dy = Math.sin(angle) * maxShift;
          break;
        }
        case 'triangle': {
          const period = densityX / 2;
          const phase = (offsetX / 100) * period;
          const val = ((i + phase) % period) / period; // 0 到 1
          dy = maxShift * (val < 0.5 ? 4 * val - 1 : 3 - 4 * val);
          break;
        }
        case 'random':
          // 使用带种子的伪随机，以保证拖拽滑块时不会闪烁
          dy = (seededRandom(i + 100) * 2 - 1) * maxShift;
          break;
      }

      ctx.save();

      // 开启 3D 浮动投影（让条带浮起来）
      if (shadowDepth > 0) {
        ctx.shadowColor = `rgba(0, 0, 0, ${shadowDepth / 100 * 0.4})`;
        ctx.shadowBlur = Math.abs(dy) * 0.1 + 8;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 4;
      }

      // 绘制带位移的垂直条带
      ctx.drawImage(imageA, x, 0, w, H, x, dy, w, H);

      // 绘制纸条左右切口高光
      if (edgeHighlight > 0) {
        ctx.shadowColor = 'transparent'; // 屏蔽投影
        ctx.strokeStyle = `rgba(255, 255, 255, ${edgeHighlight / 100 * 0.25})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 0.5, dy);
        ctx.lineTo(x + 0.5, dy + H);
        ctx.moveTo(x + w - 0.5, dy);
        ctx.lineTo(x + w - 0.5, dy + H);
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  // 4. 程序化纸张肌理叠加层
  if (paperTexture !== 'none') {
    const texPattern = createProceduralTexture(ctx, paperTexture, W, H);
    if (texPattern) {
      ctx.save();
      // 使用 multiply (正片叠底) 让暗部沉下去，亮部保留，产生纸张凹凸斑驳感
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = texPattern;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }
}
