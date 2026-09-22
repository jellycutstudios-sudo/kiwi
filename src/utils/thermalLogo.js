/**
 * Thermal Printer Logo Converter & Rasterizer
 * Converts color/high-res restaurant logos into 1-bit monochrome graphics
 * optimized for 203 DPI thermal receipt printers (HTML browser print & ESC/POS).
 */

/**
 * Packs 1-bit binary pixels (1 = black dot, 0 = white) into ESC/POS GS v 0 raster command format.
 * @param {Uint8Array} binaryArray - Array of size (width * height) where 1 is black, 0 is white.
 * @param {number} width - Width in pixels (padded to multiple of 8).
 * @param {number} height - Height in pixels.
 * @returns {Uint8Array} ESC/POS command bytes ready to send to thermal printer.
 */
export function packBitsToEscPosRaster(binaryArray, width, height) {
  const widthBytes = Math.ceil(width / 8);
  const xL = widthBytes & 0xFF;
  const xH = (widthBytes >> 8) & 0xFF;
  const yL = height & 0xFF;
  const yH = (height >> 8) & 0xFF;

  // GS v 0 m xL xH yL yH (m = 0 for standard normal density)
  const header = [29, 118, 48, 0, xL, xH, yL, yH];
  const bitmapData = new Uint8Array(widthBytes * height);

  for (let y = 0; y < height; y++) {
    for (let xb = 0; xb < widthBytes; xb++) {
      let byteVal = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = xb * 8 + bit;
        if (x < width && binaryArray[y * width + x] === 1) {
          byteVal |= (0x80 >> bit);
        }
      }
      bitmapData[y * widthBytes + xb] = byteVal;
    }
  }

  const result = new Uint8Array(header.length + bitmapData.length);
  result.set(header, 0);
  result.set(bitmapData, header.length);
  return result;
}

/**
 * Applies Floyd-Steinberg error diffusion dithering to grayscale pixel values (0..255).
 * Gives smooth gradients and natural shading on 1-bit thermal printers.
 */
export function ditherGrayscalePixels(grayArray, width, height, threshold = 128, invert = false) {
  const gray = new Float32Array(grayArray);
  const binary = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const oldVal = gray[idx];
      const isBlack = oldVal < threshold;
      const newVal = isBlack ? 0 : 255;
      binary[idx] = invert ? (isBlack ? 0 : 1) : (isBlack ? 1 : 0);
      const err = oldVal - newVal;

      if (x + 1 < width) {
        gray[idx + 1] += err * (7 / 16);
      }
      if (y + 1 < height) {
        if (x > 0) {
          gray[(y + 1) * width + (x - 1)] += err * (3 / 16);
        }
        gray[(y + 1) * width + x] += err * (5 / 16);
        if (x + 1 < width) {
          gray[(y + 1) * width + (x + 1)] += err * (1 / 16);
        }
      }
    }
  }

  return binary;
}

/**
 * Applies direct contrast thresholding to grayscale pixels.
 * Produces crisp, sharp, non-dithered vector-like black lines.
 */
export function thresholdGrayscalePixels(grayArray, width, height, threshold = 128, invert = false) {
  const binary = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const isBlack = grayArray[i] < threshold;
    binary[i] = invert ? (isBlack ? 0 : 1) : (isBlack ? 1 : 0);
  }
  return binary;
}

/**
 * Convert a File, Blob, or URL into a thermal-optimized 1-bit image.
 * Returns both a web-safe Data URL (for HTML receipts) and ESC/POS raster byte stream.
 *
 * @param {File|Blob|string} imageSource - The input logo.
 * @param {Object} options - Conversion settings.
 * @param {number} [options.maxWidth=384] - Max width in dots (384 for 80mm, 256 for 58mm).
 * @param {number} [options.maxHeight=140] - Max height in dots.
 * @param {number} [options.threshold=128] - Luminance cutoff (0-255).
 * @param {'dither'|'threshold'} [options.algorithm='dither'] - Conversion algorithm.
 * @param {boolean} [options.invert=false] - Invert black/white.
 * @param {boolean} [options.transparentBg=true] - Keep background transparent in thermal PNG.
 * @returns {Promise<{
 *   originalUrl: string,
 *   thermalDataUrl: string,
 *   escPosBytes: Uint8Array,
 *   escPosBase64: string,
 *   width: number,
 *   height: number
 * }>}
 */
export function convertLogoForThermal(imageSource, options = {}) {
  const {
    maxWidth = 384,
    maxHeight = 140,
    threshold = 128,
    algorithm = 'dither',
    invert = false,
    transparentBg = true,
  } = options;

  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return reject(new Error('convertLogoForThermal requires a browser environment with Canvas.'));
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';

    let objectUrl = null;
    let originalUrl = '';

    if (typeof imageSource === 'string') {
      img.src = imageSource;
      originalUrl = imageSource;
    } else if (imageSource instanceof Blob || imageSource instanceof File) {
      objectUrl = URL.createObjectURL(imageSource);
      img.src = objectUrl;
    } else {
      return reject(new Error('Invalid image source'));
    }

    img.onload = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);

      try {
        const origW = img.naturalWidth || img.width;
        const origH = img.naturalHeight || img.height;

        // Maintain aspect ratio within bounding box
        const scale = Math.min(maxWidth / origW, maxHeight / origH, 1);
        let targetW = Math.round(origW * scale);
        let targetH = Math.round(origH * scale);

        // ESC/POS requires width to be a multiple of 8
        targetW = Math.max(8, Math.round(targetW / 8) * 8);
        targetH = Math.max(8, targetH);

        // Create canvas for pixel processing
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        // Fill with white paper background so transparent regions don't turn black
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, targetW, targetH);

        // Draw image smoothly
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, targetW, targetH);

        const imgData = ctx.getImageData(0, 0, targetW, targetH);
        const data = imgData.data;

        // Extract grayscale luminance (0..255) with alpha compositing
        const gray = new Float32Array(targetW * targetH);
        for (let i = 0; i < targetW * targetH; i++) {
          const idx = i * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const a = data[idx + 3] / 255;
          // Standard sRGB luminance composite over white (255)
          const lum = (0.299 * r + 0.587 * g + 0.114 * b) * a + 255 * (1 - a);
          gray[i] = lum;
        }

        // Apply chosen algorithm
        let binary;
        if (algorithm === 'dither') {
          binary = ditherGrayscalePixels(gray, targetW, targetH, threshold, invert);
        } else {
          binary = thresholdGrayscalePixels(gray, targetW, targetH, threshold, invert);
        }

        // Write pure 1-bit pixels to canvas for thermalDataUrl
        for (let i = 0; i < targetW * targetH; i++) {
          const idx = i * 4;
          const isBlack = binary[i] === 1;
          const val = isBlack ? 0 : 255;
          data[idx] = val;
          data[idx + 1] = val;
          data[idx + 2] = val;
          // Transparent for white if requested, so receipt background shows cleanly
          data[idx + 3] = isBlack ? 255 : (transparentBg ? 0 : 255);
        }
        ctx.putImageData(imgData, 0, 0);

        const thermalDataUrl = canvas.toDataURL('image/png');

        // Compile ESC/POS binary raster bytes
        const escPosBytes = packBitsToEscPosRaster(binary, targetW, targetH);

        // Convert to base64 for storage in Firestore
        let binaryStr = '';
        for (let i = 0; i < escPosBytes.length; i++) {
          binaryStr += String.fromCharCode(escPosBytes[i]);
        }
        const escPosBase64 = typeof btoa !== 'undefined' ? btoa(binaryStr) : '';

        // If original was a file, also get base64 of original for display
        if (imageSource instanceof Blob || imageSource instanceof File) {
          const origCanvas = document.createElement('canvas');
          origCanvas.width = targetW;
          origCanvas.height = targetH;
          const origCtx = origCanvas.getContext('2d');
          origCtx.drawImage(img, 0, 0, targetW, targetH);
          originalUrl = origCanvas.toDataURL('image/png');
        }

        resolve({
          originalUrl,
          thermalDataUrl,
          escPosBytes,
          escPosBase64,
          width: targetW,
          height: targetH,
        });
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = (err) => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image for thermal processing.'));
    };
  });
}
