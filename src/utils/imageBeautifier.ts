/**
 * Snacktorio 智慧像素圖片美化處理器 (Smart Pixel Image Beautifier)
 * 1. 自動偵測邊緣背景色 (支援 Excel 淺灰、深暗底色、純白等)
 * 2. 邊緣向內洪水填充去背 (消除試算表藍色選取框、白色網格線、外部雜色)
 * 3. 嚴格保護內部色塊 (內部白蛋黃、眼珠、高光不被誤刪)
 * 4. 緊密裁切主體邊界 (Auto-Crop Bounding Box)
 * 5. 像素無損點陣縮放至 max 64x64 (Preserve crisp nearest-neighbor pixel art)
 */

export interface ProcessedImageResult {
  beautifiedUrl: string;
  rawUrl: string;
}

export function processAndBeautifyImage(dataUrl: string): Promise<ProcessedImageResult> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;

      // 1. Generate Raw Scaled URL
      const rawCanvas = document.createElement('canvas');
      const maxDim = 64;
      let rawW = w;
      let rawH = h;
      if (rawW > maxDim || rawH > maxDim) {
        if (rawW > rawH) {
          rawH = Math.round((rawH * maxDim) / rawW);
          rawW = maxDim;
        } else {
          rawW = Math.round((rawW * maxDim) / rawH);
          rawH = maxDim;
        }
      }
      rawCanvas.width = rawW;
      rawCanvas.height = rawH;
      const rawCtx = rawCanvas.getContext('2d');
      if (rawCtx) {
        rawCtx.imageSmoothingEnabled = false;
        rawCtx.drawImage(img, 0, 0, rawW, rawH);
      }
      const rawUrl = rawCanvas.toDataURL('image/png');

      // 2. Generate Beautified (Background Removed & Cropped) URL
      const workCanvas = document.createElement('canvas');
      workCanvas.width = w;
      workCanvas.height = h;
      const ctx = workCanvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        resolve({ beautifiedUrl: rawUrl, rawUrl });
        return;
      }

      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, w, h);
      const data = imgData.data;

      // Sample edge pixels
      const edges: [number, number, number][] = [];
      for (let x = 0; x < w; x++) {
        const topIdx = (0 * w + x) * 4;
        const botIdx = ((h - 1) * w + x) * 4;
        if (data[topIdx + 3] > 0) edges.push([data[topIdx], data[topIdx + 1], data[topIdx + 2]]);
        if (data[botIdx + 3] > 0) edges.push([data[botIdx], data[botIdx + 1], data[botIdx + 2]]);
      }
      for (let y = 0; y < h; y++) {
        const leftIdx = (y * w + 0) * 4;
        const rightIdx = (y * w + (w - 1)) * 4;
        if (data[leftIdx + 3] > 0) edges.push([data[leftIdx], data[leftIdx + 1], data[leftIdx + 2]]);
        if (data[rightIdx + 3] > 0) edges.push([data[rightIdx], data[rightIdx + 1], data[rightIdx + 2]]);
      }

      if (edges.length === 0) {
        // Already fully transparent borders
        resolve({ beautifiedUrl: rawUrl, rawUrl });
        return;
      }

      // Find dominant background color (excluding selection blue: r < 100 && b > 160)
      const colorCounts: Record<string, { count: number; rgb: [number, number, number] }> = {};
      for (const [r, g, b] of edges) {
        if (r < 100 && b > 160) continue; // skip Excel blue highlight
        const key = `${Math.round(r / 8) * 8},${Math.round(g / 8) * 8},${Math.round(b / 8) * 8}`;
        if (!colorCounts[key]) colorCounts[key] = { count: 0, rgb: [r, g, b] };
        colorCounts[key].count++;
      }

      let dominantBg: [number, number, number] = [207, 204, 202]; // default fallback
      let maxCnt = -1;
      for (const key in colorCounts) {
        if (colorCounts[key].count > maxCnt) {
          maxCnt = colorCounts[key].count;
          dominantBg = colorCounts[key].rgb;
        }
      }

      // Flood fill from outer edges
      const visited = new Uint8Array(w * h);
      const queue: number[] = [];

      for (let x = 0; x < w; x++) {
        queue.push(0 * w + x);
        queue.push((h - 1) * w + x);
      }
      for (let y = 0; y < h; y++) {
        queue.push(y * w + 0);
        queue.push(y * w + (w - 1));
      }

      const isBorderNoise = (r: number, g: number, b: number, a: number) => {
        if (a === 0) return true;
        const diff = Math.abs(r - dominantBg[0]) + Math.abs(g - dominantBg[1]) + Math.abs(b - dominantBg[2]);
        if (diff < 42) return true;
        // Selection blue border:
        if (r < 110 && b > 150) return true;
        // Cell white border:
        if (r > 240 && g > 240 && b > 240) return true;
        return false;
      };

      let head = 0;
      while (head < queue.length) {
        const pos = queue[head++];
        if (visited[pos]) continue;
        visited[pos] = 1;

        const pIdx = pos * 4;
        const r = data[pIdx];
        const g = data[pIdx + 1];
        const b = data[pIdx + 2];
        const a = data[pIdx + 3];

        if (isBorderNoise(r, g, b, a)) {
          data[pIdx + 3] = 0; // set alpha 0

          const px = pos % w;
          const py = Math.floor(pos / w);
          if (px > 0 && !visited[pos - 1]) queue.push(pos - 1);
          if (px < w - 1 && !visited[pos + 1]) queue.push(pos + 1);
          if (py > 0 && !visited[pos - w]) queue.push(pos - w);
          if (py < h - 1 && !visited[pos + w]) queue.push(pos + w);
        }
      }

      ctx.putImageData(imgData, 0, 0);

      // Find content bounding box
      let minX = w, maxX = -1, minY = h, maxY = -1;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (data[(y * w + x) * 4 + 3] > 0) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      if (maxX < minX || maxY < minY) {
        resolve({ beautifiedUrl: rawUrl, rawUrl });
        return;
      }

      const cropW = maxX - minX + 1;
      const cropH = maxY - minY + 1;

      let finalW = cropW;
      let finalH = cropH;
      if (finalW > maxDim || finalH > maxDim) {
        if (finalW > finalH) {
          finalH = Math.round((finalH * maxDim) / finalW);
          finalW = maxDim;
        } else {
          finalW = Math.round((finalW * maxDim) / finalH);
          finalH = maxDim;
        }
      }

      const outCanvas = document.createElement('canvas');
      outCanvas.width = finalW;
      outCanvas.height = finalH;
      const outCtx = outCanvas.getContext('2d');
      if (!outCtx) {
        resolve({ beautifiedUrl: rawUrl, rawUrl });
        return;
      }

      outCtx.imageSmoothingEnabled = false;
      outCtx.drawImage(workCanvas, minX, minY, cropW, cropH, 0, 0, finalW, finalH);
      const beautifiedUrl = outCanvas.toDataURL('image/png');

      resolve({ beautifiedUrl, rawUrl });
    };
    img.onerror = () => {
      resolve({ beautifiedUrl: dataUrl, rawUrl: dataUrl });
    };
    img.src = dataUrl;
  });
}
