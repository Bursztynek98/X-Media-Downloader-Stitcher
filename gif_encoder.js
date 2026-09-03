/**
 * Lightweight Pure JavaScript MP4 Video to Animated GIF Converter
 * Converts HTML5 Video / MP4 URLs into real .gif files directly in the browser.
 */

class SimpleGifEncoder {
  constructor(width, height, delayMs = 60) {
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
    const delay = Math.round(this.delayMs / 10); // GIF delay unit is 10ms

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

    // Build uniform 256-color global palette (6x6x6 color cube + 40 grays)
    const palette = [];
    for (let r = 0; r < 6; r++) {
      for (let g = 0; g < 6; g++) {
        for (let b = 0; b < 6; b++) {
          palette.push([Math.round(r * 51), Math.round(g * 51), Math.round(b * 51)]);
        }
      }
    }
    while (palette.length < 256) {
      const gray = Math.round(((palette.length - 216) / 40) * 255);
      palette.push([gray, gray, gray]);
    }

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

    // Helper: find nearest palette color index for RGB
    const getColorIdx = (r, g, b) => {
      const rIdx = Math.min(5, Math.floor((r + 25) / 51));
      const gIdx = Math.min(5, Math.floor((g + 25) / 51));
      const bIdx = Math.min(5, Math.floor((b + 25) / 51));
      return rIdx * 36 + gIdx * 6 + bIdx;
    };

    // Process each frame
    for (const frameData of this.frames) {
      const data = frameData.data;

      // Graphic Control Extension
      bytes.push(0x21, 0xf9, 0x04);
      bytes.push(0x04); // Disposal method: overwrite
      pushShort(delay);
      bytes.push(0x00); // Transparent color index (none)
      bytes.push(0x00); // Block terminator

      // Image Descriptor
      bytes.push(0x2c);
      pushShort(0); // Left
      pushShort(0); // Top
      pushShort(w);
      pushShort(h);
      bytes.push(0x00); // Local color table flag = 0

      // Map RGBA pixels to 8-bit color indices
      const indexedPixels = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) {
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        indexedPixels[i] = getColorIdx(r, g, b);
      }

      // Simple LZW Encoder (Code size 8)
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
 * Converts a video URL into an animated GIF Blob.
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
        const duration = Math.min(video.duration || 3, 6); // Max 6s for fast conversion
        
        // Scale down large videos to max width 360px for quick encoding and small file size
        const maxWidth = 360;
        let width = video.videoWidth || 320;
        let height = video.videoHeight || 320;

        if (width > maxWidth) {
          height = Math.round(height * (maxWidth / width));
          width = maxWidth;
        }

        const fps = 12; // 12 frames per second for smooth GIF
        const totalFrames = Math.max(1, Math.round(duration * fps));
        const frameInterval = duration / totalFrames;
        const delayMs = Math.round(1000 / fps);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        const encoder = new SimpleGifEncoder(width, height, delayMs);

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
