/**
 * High-Quality Pure JavaScript MP4 Video to Animated GIF Converter
 * Uses Median-Cut Adaptive Color Quantization & 3D Palette Lookup
 * for HD vibrant GIF output directly in the browser.
 */

class HighQualityGifEncoder {
  constructor(width, height, delayMs = 66) {
    this.width = width;
    this.height = height;
    this.delayMs = delayMs;
    this.frames = [];
  }

  addFrame(ctx) {
    const imgData = ctx.getImageData(0, 0, this.width, this.height);
    this.frames.push(imgData);
  }

  buildBlob() {
    const w = this.width;
    const h = this.height;
    const delay = Math.max(1, Math.round(this.delayMs / 10));

    const bytes = [];
    const pushStr = (str) => {
      for (let i = 0; i < str.length; i++) bytes.push(str.charCodeAt(i));
    };
    const pushShort = (v) => {
      bytes.push(v & 0xff);
      bytes.push((v >> 8) & 0xff);
    };

    // Header: GIF89a
    pushStr("GIF89a");

    // Logical Screen Descriptor
    pushShort(w);
    pushShort(h);
    bytes.push(0xf7); // Global Color Table (256 colors), 8-bit color resolution
    bytes.push(0);    // Background color index
    bytes.push(0);    // Pixel aspect ratio

    // Sample pixels across all frames to build high-quality Median-Cut adaptive palette
    const sampledPixels = [];
    const frameStep = Math.max(1, Math.floor(this.frames.length / 10));

    for (let f = 0; f < this.frames.length; f += frameStep) {
      const data = this.frames[f].data;
      const pixelStep = Math.max(1, Math.floor(data.length / (4 * 3000)));
      for (let i = 0; i < data.length; i += 4 * pixelStep) {
        if (data[i + 3] >= 50) {
          sampledPixels.push(data[i], data[i + 1], data[i + 2]);
        }
      }
    }

    const palette = medianCutQuantize(sampledPixels, 256);

    // Write Global Color Table (256 * 3 bytes)
    for (let i = 0; i < 256; i++) {
      bytes.push(palette[i][0]);
      bytes.push(palette[i][1]);
      bytes.push(palette[i][2]);
    }

    // Netscape Application Extension for Looping GIF (Infinite loop)
    bytes.push(0x21, 0xff, 0x0b);
    pushStr("NETSCAPE2.0");
    bytes.push(0x03, 0x01, 0x00, 0x00, 0x00); // Loop count = 0 (infinite)

    // Build fast 3D palette lookup map (32x32x32 resolution)
    const getColorIdx = buildPaletteLookup(palette);

    // Process each frame
    for (const frameData of this.frames) {
      const data = frameData.data;

      // Graphic Control Extension
      bytes.push(0x21, 0xf9, 0x04);
      bytes.push(0x04); // Disposal method: overwrite
      pushShort(delay);
      bytes.push(0x00); // Transparent color index
      bytes.push(0x00); // Block terminator

      // Image Descriptor
      bytes.push(0x2c);
      pushShort(0); // Left
      pushShort(0); // Top
      pushShort(w);
      pushShort(h);
      bytes.push(0x00); // Local color table flag = 0

      // Map RGBA pixels to 8-bit adaptive color indices using lookup table
      const indexedPixels = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) {
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        indexedPixels[i] = getColorIdx(r, g, b);
      }

      // LZW Encoder
      const lzwData = lzwEncode(indexedPixels, 8);
      bytes.push(8); // LZW Minimum Code Size

      // Write sub-blocks of max 255 bytes
      let pos = 0;
      while (pos < lzwData.length) {
        const chunkSize = Math.min(255, lzwData.length - pos);
        bytes.push(chunkSize);
        for (let i = 0; i < chunkSize; i++) {
          bytes.push(lzwData[pos + i]);
        }
        pos += chunkSize;
      }
      bytes.push(0x00); // Block terminator
    }

    // GIF Trailer
    bytes.push(0x3b);

    return new Blob([new Uint8Array(bytes)], { type: 'image/gif' });
  }
}

/**
 * Median-Cut Color Quantization Algorithm
 * Generates an optimal 256-color palette based on video color distribution.
 */
function medianCutQuantize(rgbArray, maxColors = 256) {
  const colorList = [];
  for (let i = 0; i < rgbArray.length; i += 3) {
    colorList.push([rgbArray[i], rgbArray[i + 1], rgbArray[i + 2]]);
  }

  if (colorList.length === 0) {
    const fallback = [];
    for (let i = 0; i < 256; i++) fallback.push([i, i, i]);
    return fallback;
  }

  let boxes = [{ colors: colorList }];

  while (boxes.length < maxColors) {
    let maxRange = -1;
    let splitIdx = -1;

    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i];
      if (box.colors.length <= 1) continue;

      const range = getBoxRange(box.colors);
      if (range.maxDiff > maxRange) {
        maxRange = range.maxDiff;
        splitIdx = i;
      }
    }

    if (splitIdx === -1 || maxRange <= 0) break;

    const boxToSplit = boxes[splitIdx];
    const range = getBoxRange(boxToSplit.colors);
    const channel = range.channel;

    boxToSplit.colors.sort((a, b) => a[channel] - b[channel]);
    const median = Math.floor(boxToSplit.colors.length / 2);

    const box1 = { colors: boxToSplit.colors.slice(0, median) };
    const box2 = { colors: boxToSplit.colors.slice(median) };

    boxes.splice(splitIdx, 1, box1, box2);
  }

  const palette = boxes.map(box => {
    let r = 0, g = 0, b = 0;
    for (const c of box.colors) {
      r += c[0];
      g += c[1];
      b += c[2];
    }
    const len = box.colors.length || 1;
    return [Math.round(r / len), Math.round(g / len), Math.round(b / len)];
  });

  while (palette.length < 256) {
    palette.push([0, 0, 0]);
  }

  return palette;
}

function getBoxRange(colors) {
  let minR = 255, maxR = 0;
  let minG = 255, maxG = 0;
  let minB = 255, maxB = 0;

  for (let i = 0; i < colors.length; i++) {
    const c = colors[i];
    if (c[0] < minR) minR = c[0];
    if (c[0] > maxR) maxR = c[0];
    if (c[1] < minG) minG = c[1];
    if (c[1] > maxG) maxG = c[1];
    if (c[2] < minB) minB = c[2];
    if (c[2] > maxB) maxB = c[2];
  }

  const diffR = maxR - minR;
  const diffG = maxG - minG;
  const diffB = maxB - minB;

  let channel = 0;
  let maxDiff = diffR;
  if (diffG > maxDiff) {
    channel = 1;
    maxDiff = diffG;
  }
  if (diffB > maxDiff) {
    channel = 2;
    maxDiff = diffB;
  }

  return { channel, maxDiff };
}

/**
 * Pre-computes 3D color lookup map (32x32x32) for fast & precise palette indexing.
 */
function buildPaletteLookup(palette) {
  const lookup = new Uint8Array(32 * 32 * 32);

  for (let r = 0; r < 32; r++) {
    for (let g = 0; g < 32; g++) {
      for (let b = 0; b < 32; b++) {
        const realR = (r << 3) + 4;
        const realG = (g << 3) + 4;
        const realB = (b << 3) + 4;

        let minDist = Infinity;
        let bestIdx = 0;

        for (let i = 0; i < 256; i++) {
          const pr = palette[i][0];
          const pg = palette[i][1];
          const pb = palette[i][2];
          const dist = (realR - pr) ** 2 + (realG - pg) ** 2 + (realB - pb) ** 2;
          if (dist < minDist) {
            minDist = dist;
            bestIdx = i;
          }
        }
        lookup[(r << 10) | (g << 5) | b] = bestIdx;
      }
    }
  }

  return (r, g, b) => lookup[((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)];
}

// Pure LZW Encoder for GIF (Min Code Size = 8)
function lzwEncode(pixels, minCodeSize) {
  const clearCode = 1 << minCodeSize; // 256
  const eoiCode = clearCode + 1;       // 257

  let nextCode = eoiCode + 1;
  let codeSize = minCodeSize + 1;

  const dictionary = new Map();
  function initDict() {
    dictionary.clear();
    for (let i = 0; i < clearCode; i++) {
      dictionary.set(String(i), i);
    }
    nextCode = eoiCode + 1;
    codeSize = minCodeSize + 1;
  }

  initDict();

  const outBits = [];
  let bitBuffer = 0;
  let bitCount = 0;

  function writeCode(code) {
    bitBuffer |= (code << bitCount);
    bitCount += codeSize;
    while (bitCount >= 8) {
      outBits.push(bitBuffer & 0xff);
      bitBuffer >>= 8;
      bitCount -= 8;
    }
  }

  writeCode(clearCode);

  let currentPrefix = String(pixels[0]);

  for (let i = 1; i < pixels.length; i++) {
    const k = pixels[i];
    const key = currentPrefix + ',' + k;

    if (dictionary.has(key)) {
      currentPrefix = key;
    } else {
      writeCode(dictionary.get(currentPrefix));

      if (nextCode < 4096) {
        dictionary.set(key, nextCode++);
        if (nextCode === (1 << codeSize) + 1 && codeSize < 12) {
          codeSize++;
        }
      } else {
        writeCode(clearCode);
        initDict();
      }
      currentPrefix = String(k);
    }
  }

  writeCode(dictionary.get(currentPrefix));
  writeCode(eoiCode);

  if (bitCount > 0) {
    outBits.push(bitBuffer & 0xff);
  }

  return new Uint8Array(outBits);
}

/**
 * Converts a video URL into an animated HD GIF Blob.
 * @param {string} videoUrl
 * @param {Function} onProgress Progress callback (percentage)
 * @returns {Promise<Blob>}
 */
async function convertVideoToGif(videoUrl, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    video.muted = true;
    video.src = videoUrl;

    video.onloadedmetadata = async () => {
      try {
        const duration = Math.min(video.duration || 3, 8); // Up to 8s
        
        // High resolution limit: up to 540px width for sharp, vibrant GIF
        const maxWidth = 540;
        let width = video.videoWidth || 480;
        let height = video.videoHeight || 480;

        if (width > maxWidth) {
          height = Math.round(height * (maxWidth / width));
          width = maxWidth;
        }

        const fps = 15; // Smooth 15 FPS
        const totalFrames = Math.max(1, Math.round(duration * fps));
        const frameInterval = duration / totalFrames;
        const delayMs = Math.round(1000 / fps);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        const encoder = new HighQualityGifEncoder(width, height, delayMs);

        for (let i = 0; i < totalFrames; i++) {
          const seekTime = i * frameInterval;
          video.currentTime = seekTime;

          await new Promise((res) => {
            const onSeeked = () => {
              video.removeEventListener('seeked', onSeeked);
              res();
            };
            video.addEventListener('seeked', onSeeked);
          });

          ctx.drawImage(video, 0, 0, width, height);
          encoder.addFrame(ctx);
          onProgress(Math.round(((i + 1) / totalFrames) * 100));
        }

        const gifBlob = encoder.buildBlob();
        resolve(gifBlob);

      } catch (err) {
        reject(err);
      } finally {
        video.remove();
      }
    };

    video.onerror = (e) => reject(new Error('Błąd ładowania wideo do konwersji GIF'));
  });
}

window.convertVideoToGif = convertVideoToGif;
