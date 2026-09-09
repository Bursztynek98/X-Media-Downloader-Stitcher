/**
 * X (Twitter) Media Downloader & Stitcher Content Script
 * Adds a download button to every tweet action bar on X.com.
 * Supports downloading full-res images (name=orig), MP4 & GIF options for EVERY video,
 * hover preview thumbnails, smart 1px seam auto-crop panorama stitching,
 * and reliable filtering of quoted tweet media.
 */

(function () {
  'use strict';

  console.log('[X Downloader] Skrypt załadowany i aktywny na stronie.');

  // SVG Icons
  const ICON_DOWNLOAD = `<svg viewBox="0 0 24 24" aria-hidden="true"><g><path d="M12 2.59l5.7 5.7-1.41 1.42L13 6.41V16h-2V6.41l-3.3 3.3-1.41-1.42L12 2.59z" transform="rotate(180 12 12)"></path><path d="M21 15l-.02 3.51c0 1.38-1.12 2.49-2.5 2.49H5.5C4.11 21 3 19.88 3 18.5V15h2v3.5c0 .28.22.5.5.5h12.98c.28 0 .5-.22.5-.5L19 15h2z"></path></g></svg>`;
  const ICON_STITCH_HORIZ = `<svg viewBox="0 0 24 24"><path d="M3 5h5v14H3V5zm8 0h5v14h-5V5zm8 0h2v14h-2V5z"/></svg>`;
  const ICON_STITCH_VERT = `<svg viewBox="0 0 24 24"><path d="M5 3h14v5H5V3zm0 8h14v5H5v-5zm0 8h14v2H5v-2z"/></svg>`;
  const ICON_ZIP = `<svg viewBox="0 0 24 24"><path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"/></svg>`;
  const ICON_IMAGE = `<svg viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>`;
  const ICON_VIDEO = `<svg viewBox="0 0 24 24"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>`;
  const ICON_GIF = `<svg viewBox="0 0 24 24"><path d="M11.5 9H13v6h-1.5V9zM9 9H6c-.55 0-1 .45-1 1v4c0 .55.45 1 1 1h3c.55 0 1-.45 1-1v-1H7.5v.5h-1v-3h3V9zm9.5 1.5h-2V9H19V7.5h-3.5v7.5H17v-3h1.5v-1.5z"/></svg>`;

  let activeMenu = null;

  // Initialize Observer for tweets
  function init() {
    processTweets();

    const observer = new MutationObserver(() => {
      processTweets();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Close open menu on outside click
    document.addEventListener('click', (e) => {
      if (activeMenu && !activeMenu.contains(e.target) && !e.target.closest('.x-downloader-btn')) {
        closeMenu();
      }
    });
  }

  // Find all tweets on page and inject button
  function processTweets() {
    const tweets = document.querySelectorAll('article[data-testid="tweet"]:not([data-x-dl-injected])');
    tweets.forEach(tweet => {
      tweet.setAttribute('data-x-dl-injected', 'true');
      injectDownloadButton(tweet);
    });
  }

  // Inject download button into action bar (role="group")
  function injectDownloadButton(tweet) {
    const actionBar = tweet.querySelector('div[role="group"]');
    if (!actionBar) return;

    // Create wrapper container matching X action buttons
    const btnWrap = document.createElement('div');
    btnWrap.className = 'css-g5y9jx r-18u37iz r-1h0z5md x-downloader-btn-wrap';

    const btn = document.createElement('button');
    btn.className = 'x-downloader-btn';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Pobierz media');
    btn.setAttribute('title', 'Pobierz obrazki / wideo / GIF (X Media Downloader)');
    btn.innerHTML = ICON_DOWNLOAD;

    // Check media count for badge
    const media = extractTweetMedia(tweet);
    const totalItems = media.photos.length + media.videos.length;
    if (totalItems > 1) {
      const badge = document.createElement('span');
      badge.className = 'x-dl-badge';
      badge.textContent = totalItems;
      btnWrap.appendChild(badge);
    }

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleButtonClick(tweet, btnWrap, btn);
    });

    btnWrap.appendChild(btn);

    // Insert before bookmark or share button if available, else append
    const targetBtn = actionBar.querySelector('button[aria-label*="Udostępnij"], button[aria-label*="Share"], [data-testid="bookmark"]');
    if (targetBtn) {
      let targetChild = targetBtn;
      while (targetChild.parentElement && targetChild.parentElement !== actionBar) {
        targetChild = targetChild.parentElement;
      }
      if (targetChild && targetChild.parentElement === actionBar) {
        actionBar.insertBefore(btnWrap, targetChild);
      } else {
        targetBtn.insertAdjacentElement('beforebegin', btnWrap);
      }
    } else {
      actionBar.appendChild(btnWrap);
    }
  }

  // Check if an element is inside a quoted tweet container
  function isQuotedMedia(elem, tweet) {
    let curr = elem;
    while (curr && curr !== tweet) {
      if (curr.getAttribute) {
        const testId = curr.getAttribute('data-testid');
        if (testId === 'testCondensedMedia' || testId === 'quoteTweet') {
          return true;
        }
        if (curr.tagName === 'ARTICLE' && curr !== tweet) {
          return true;
        }
      }
      curr = curr.parentElement;
    }
    return false;
  }

  // Extract all photos and videos from a tweet (excluding quoted tweet media)
  function extractTweetMedia(tweet) {
    const photos = [];
    const videos = [];

    // Find photo elements (including horizontal carousel / split panorama photos)
    const photoContainers = tweet.querySelectorAll('div[data-testid="tweetPhoto"], a[href*="/photo/"]');
    const seenMediaIds = new Set();

    photoContainers.forEach(container => {
      // Exclude media inside quoted tweet card or nested tweet
      if (isQuotedMedia(container, tweet)) return;

      let rawSrc = null;

      // Check img element
      const img = container.querySelector('img[src*="pbs.twimg.com/media/"]');
      if (img && img.src) {
        rawSrc = img.src;
      } else {
        // Fallback: check background-image
        const bgDiv = container.querySelector('div[style*="twimg.com/media/"]');
        if (bgDiv && bgDiv.style.backgroundImage) {
          const match = bgDiv.style.backgroundImage.match(/url\(["']?(https:\/\/[^"']+)["']?\)/);
          if (match) rawSrc = match[1];
        }
      }

      if (!rawSrc) return;

      // Extract unique media ID from twimg URL
      const mediaIdMatch = rawSrc.match(/media\/([A-Za-z0-9_-]+)/);
      const mediaId = mediaIdMatch ? mediaIdMatch[1] : rawSrc;

      if (!seenMediaIds.has(mediaId)) {
        seenMediaIds.add(mediaId);
        
        // Convert URL to highest original resolution (name=orig)
        const origUrl = getOrigImageUrl(rawSrc);

        // Check if there is a photo index in link (e.g., /photo/1, /photo/2)
        const link = container.closest('a[href*="/photo/"]');
        let photoIndex = 999;
        if (link && link.href) {
          const match = link.href.match(/\/photo\/(\d+)/);
          if (match) photoIndex = parseInt(match[1], 10);
        }

        photos.push({
          id: mediaId,
          url: origUrl,
          rawUrl: rawSrc,
          index: photoIndex
        });
      }
    });

    // Sort photos by photo index (/photo/1, /photo/2, etc.) to guarantee correct stitching order
    photos.sort((a, b) => a.index - b.index);

    // Find video elements (excluding quoted tweets)
    const videoElements = tweet.querySelectorAll('video');
    videoElements.forEach((vid, idx) => {
      if (isQuotedMedia(vid, tweet)) return;
      const poster = vid.getAttribute('poster') || '';
      const isGif = poster.includes('tweet_video_thumb');
      videos.push({
        index: idx + 1,
        poster: poster,
        isGif: isGif,
        videoElem: vid
      });
    });

    return { photos, videos };
  }

  // Extract MP4 video URL specifically for the given video element inside the tweet
  async function getTweetVideoUrl(videoElem, tweet) {
    if (!videoElem) return null;

    // 1. Check direct videoElem.src or source tag if it's a real non-blob URL (like GIF)
    const directSrc = videoElem.src || videoElem.querySelector('source')?.src;
    if (directSrc && !directSrc.startsWith('blob:')) {
      console.log('[X Downloader] Wykryto bezpośredni link MP4 w elemencie video:', directSrc);
      return directSrc;
    }

    const poster = videoElem.getAttribute('poster') || '';
    console.log('[X Downloader] Szukanie wideo dla elementu z posterem:', poster);

    // 2. Check if it's a GIF (tweet_video_thumb)
    if (poster.includes('tweet_video_thumb/')) {
      const gifMatch = poster.match(/tweet_video_thumb\/([^./]+)/);
      if (gifMatch) {
        console.log('[X Downloader] Wykryto GIF w posterze, generowanie adresu MP4');
        return `https://video.twimg.com/tweet_video/${gifMatch[1]}.mp4`;
      }
    }

    // Extract video ID from this specific poster
    const videoIdMatch = poster.match(/(?:amplify_video_thumb|ext_tw_video_thumb)\/(\d+)/);
    const videoId = videoIdMatch ? videoIdMatch[1] : null;

    // 3. Search performance entries for MP4 files loaded by Twitter player matching THIS videoId
    const resources = performance.getEntriesByType('resource');
    const mp4Entries = [];

    for (const entry of resources) {
      const name = entry.name;
      if (name.includes('video.twimg.com') && name.includes('.mp4')) {
        if (videoId && name.includes(videoId)) {
          mp4Entries.push(name);
        } else if (!videoId) {
          mp4Entries.push(name);
        }
      }
    }

    if (mp4Entries.length > 0) {
      // Sort by resolution quality (higher resolution first)
      mp4Entries.sort((a, b) => {
        const resA = (a.match(/(\d+)x(\d+)/) || [0, 0, 0]).slice(1).map(Number).reduce((x, y) => x * y, 0);
        const resB = (b.match(/(\d+)x(\d+)/) || [0, 0, 0]).slice(1).map(Number).reduce((x, y) => x * y, 0);
        return resB - resA;
      });
      console.log('[X Downloader] Znaleziono MP4 w zasobach sieciowych dla tego wideo:', mp4Entries[0]);
      return mp4Entries[0];
    }

    // 4. Fallback: Query VxTwitter API for tweet status ID and match video index
    const tweetLink = tweet.querySelector('a[href*="/status/"]');
    if (tweetLink && tweetLink.href) {
      const statusMatch = tweetLink.href.match(/\/status\/(\d+)/);
      if (statusMatch) {
        const statusId = statusMatch[1];
        console.log('[X Downloader] Pobieranie adresu wideo z API VxTwitter dla statusId:', statusId);
        try {
          const resp = await fetch(`https://api.vxtwitter.com/Twitter/status/${statusId}`);
          if (resp.ok) {
            const data = await resp.json();
            if (data.media_extended) {
              const vidObjList = data.media_extended.filter(m => m.type === 'video' || m.type === 'gif');
              if (vidObjList.length > 0) {
                const videoIndex = Array.from(tweet.querySelectorAll('video')).indexOf(videoElem);
                const matchedVid = vidObjList[videoIndex] || vidObjList[0];
                if (matchedVid && matchedVid.url) {
                  console.log('[X Downloader] Pobrano wideo z API VxTwitter:', matchedVid.url);
                  return matchedVid.url;
                }
              }
            }
          }
        } catch (e) {
          console.warn('[X Downloader] Błąd zapytania do API VxTwitter:', e);
        }
      }
    }

    return directSrc || null;
  }

  // Convert Twitter image URL to original full resolution
  function getOrigImageUrl(url) {
    try {
      const u = new URL(url);
      if (u.hostname.includes('twimg.com')) {
        u.searchParams.set('name', 'orig');
        return u.toString();
      }
    } catch (e) {}
    return url;
  }

  // Handle click on download button
  async function handleButtonClick(tweet, btnWrap, btn) {
    const media = extractTweetMedia(tweet);

    if (media.photos.length === 0 && media.videos.length === 0) {
      showToast('Brak mediów w tym poście.', true);
      return;
    }

    // Single photo -> Direct download
    if (media.photos.length === 1 && media.videos.length === 0) {
      downloadFile(media.photos[0].url, `x_photo_${media.photos[0].id}.jpg`);
      return;
    }

    // If there is any video (or multiple media items), open menu to offer MP4 vs GIF choices
    if (activeMenu) {
      closeMenu();
      return;
    }

    openDropdownMenu(btnWrap, media, tweet);
  }

  // Open multi-option dropdown menu with hover image previews, MP4 & GIF options for EVERY video
  function openDropdownMenu(btnWrap, media, tweet) {
    const menu = document.createElement('div');
    menu.className = 'x-downloader-menu';

    const totalMediaCount = media.photos.length + media.videos.length;

    // Header
    const header = document.createElement('div');
    header.className = 'x-dl-header';
    header.textContent = `Pobieranie (${totalMediaCount} mediów)`;
    menu.appendChild(header);

    // If multiple photos -> Option: Stitch Horizontally (Panorama / Split Post)
    if (media.photos.length > 1) {
      const stitchHorizBtn = createMenuItem(
        ICON_STITCH_HORIZ,
        `Scal w 1 obraz (Poziomo - Panorama)`,
        'highlight',
        async () => {
          closeMenu();
          await stitchAndDownloadImages(media.photos.map(p => p.url), 'horizontal', getTweetId(tweet));
        }
      );
      stitchHorizBtn.addEventListener('mouseenter', () => showMultiPreview(menu, media.photos, 'horizontal', 'Podgląd scalenia poziomego'));
      stitchHorizBtn.addEventListener('mouseleave', () => removePreview(menu));
      menu.appendChild(stitchHorizBtn);

      const stitchVertBtn = createMenuItem(
        ICON_STITCH_VERT,
        `Scal w 1 obraz (Pionowo)`,
        '',
        async () => {
          closeMenu();
          await stitchAndDownloadImages(media.photos.map(p => p.url), 'vertical', getTweetId(tweet));
        }
      );
      stitchVertBtn.addEventListener('mouseenter', () => showMultiPreview(menu, media.photos, 'vertical', 'Podgląd scalenia pionowego'));
      stitchVertBtn.addEventListener('mouseleave', () => removePreview(menu));
      menu.appendChild(stitchVertBtn);

      const divider = document.createElement('div');
      divider.className = 'x-dl-divider';
      menu.appendChild(divider);

      // Download all individually
      const downloadAllBtn = createMenuItem(
        ICON_ZIP,
        `Pobierz wszystkie osobno (${media.photos.length})`,
        '',
        () => {
          closeMenu();
          media.photos.forEach((p, idx) => {
            setTimeout(() => {
              downloadFile(p.url, `x_photo_${idx + 1}_${p.id}.jpg`);
            }, idx * 350);
          });
          showToast(`Rozpoczęto pobieranie ${media.photos.length} obrazków.`);
        }
      );
      downloadAllBtn.addEventListener('mouseenter', () => showMultiPreview(menu, media.photos, 'horizontal', 'Wszystkie obrazki'));
      downloadAllBtn.addEventListener('mouseleave', () => removePreview(menu));
      menu.appendChild(downloadAllBtn);

      const divider2 = document.createElement('div');
      divider2.className = 'x-dl-divider';
      menu.appendChild(divider2);

      // Individual image items
      media.photos.forEach((p, idx) => {
        const item = createMenuItem(
          ICON_IMAGE,
          `Obrazek ${idx + 1} (Oryginał)`,
          '',
          () => {
            closeMenu();
            downloadFile(p.url, `x_photo_${idx + 1}_${p.id}.jpg`);
          }
        );
        item.addEventListener('mouseenter', () => showSinglePreview(menu, p.rawUrl || p.url, `Obrazek ${idx + 1}`));
        item.addEventListener('mouseleave', () => removePreview(menu));
        menu.appendChild(item);
      });
    }

    // Videos / GIFs options: Every video gets BOTH .MP4 and .GIF download options!
    if (media.videos.length > 0) {
      if (media.photos.length > 0) {
        const divider3 = document.createElement('div');
        divider3.className = 'x-dl-divider';
        menu.appendChild(divider3);
      }

      media.videos.forEach((v, idx) => {
        const videoNum = media.videos.length > 1 ? ` ${idx + 1}` : '';

        // Option 1: Download as MP4
        const mp4Item = createMenuItem(
          ICON_VIDEO,
          `Pobierz Wideo${videoNum} jako .MP4`,
          media.photos.length === 0 && idx === 0 ? 'highlight' : '',
          async () => {
            closeMenu();
            showToast(`Wykrywanie Wideo${videoNum} MP4...`);
            const videoUrl = await getTweetVideoUrl(v.videoElem, tweet);
            if (videoUrl) {
              downloadFile(videoUrl, `x_video_${getTweetId(tweet)}_${idx + 1}.mp4`);
            } else {
              showToast(`Nie udało się wyodrębnić wideo MP4.`, true);
            }
          }
        );
        if (v.poster) {
          mp4Item.addEventListener('mouseenter', () => showSinglePreview(menu, v.poster, `Wideo${videoNum} (.mp4)`));
          mp4Item.addEventListener('mouseleave', () => removePreview(menu));
        }
        menu.appendChild(mp4Item);

        // Option 2: Download as GIF (Convert MP4 -> HD GIF)
        const gifItem = createMenuItem(
          ICON_GIF,
          `Pobierz Wideo${videoNum} jako .GIF (Animacja)`,
          '',
          async () => {
            closeMenu();
            showToast(`Przygotowywanie wideo${videoNum} do konwersji...`);
            const videoUrl = await getTweetVideoUrl(v.videoElem, tweet);
            if (videoUrl) {
              await downloadGifAsRealGif(videoUrl, `x_anim_${getTweetId(tweet)}_${idx + 1}.gif`);
            } else {
              showToast(`Nie udało się pobrać pliku GIF.`, true);
            }
          }
        );
        if (v.poster) {
          gifItem.addEventListener('mouseenter', () => showSinglePreview(menu, v.poster, `Wideo${videoNum} (.gif)`));
          gifItem.addEventListener('mouseleave', () => removePreview(menu));
        }
        menu.appendChild(gifItem);

        if (idx < media.videos.length - 1) {
          const vDivider = document.createElement('div');
          vDivider.className = 'x-dl-divider';
          menu.appendChild(vDivider);
        }
      });
    }

    btnWrap.appendChild(menu);
    activeMenu = menu;
  }

  // Convert MP4 video into real animated GIF blob and download
  async function downloadGifAsRealGif(videoUrl, filename) {
    showToast('Konwertowanie MP4 na animowany GIF (0%)...');
    try {
      const gifBlob = await window.convertVideoToGif(videoUrl, (percent) => {
        showToast(`Konwertowanie na GIF... (${percent}%)`);
      });

      const blobUrl = URL.createObjectURL(gifBlob);
      triggerAnchorDownload(blobUrl, filename);

      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
      showToast(`Pobrano animowany plik ${filename}!`);
    } catch (err) {
      console.error('[X Downloader GIF Error]', err);
      showToast('Błąd konwersji na GIF. Pobieranie oryginału MP4...', true);
      downloadFile(videoUrl, filename.replace(/\.gif$/, '.mp4'));
    }
  }

  // Hover Preview Helpers
  function showSinglePreview(menu, imageUrl, title) {
    removePreview(menu);

    const previewCard = document.createElement('div');
    previewCard.className = 'x-dl-preview-card';

    const menuRect = menu.getBoundingClientRect();
    if (menuRect.left < 220) {
      previewCard.classList.add('pos-right');
    } else {
      previewCard.classList.add('pos-left');
    }

    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = title;

    const label = document.createElement('div');
    label.className = 'x-dl-preview-label';
    label.textContent = title;

    previewCard.appendChild(img);
    previewCard.appendChild(label);

    menu.appendChild(previewCard);
  }

  function showMultiPreview(menu, photos, mode, title) {
    removePreview(menu);

    const previewCard = document.createElement('div');
    previewCard.className = 'x-dl-preview-card';

    const menuRect = menu.getBoundingClientRect();
    if (menuRect.left < 220) {
      previewCard.classList.add('pos-right');
    } else {
      previewCard.classList.add('pos-left');
    }

    const container = document.createElement('div');
    container.className = `x-dl-preview-grid ${mode}`;

    photos.forEach((p, idx) => {
      const img = document.createElement('img');
      img.src = p.rawUrl || p.url;
      img.alt = `Obrazek ${idx + 1}`;
      container.appendChild(img);
    });

    const label = document.createElement('div');
    label.className = 'x-dl-preview-label';
    label.textContent = title;

    previewCard.appendChild(container);
    previewCard.appendChild(label);

    menu.appendChild(previewCard);
  }

  function removePreview(menu) {
    const existing = menu.querySelector('.x-dl-preview-card');
    if (existing) existing.remove();
  }

  // Create menu item helper
  function createMenuItem(iconSvg, text, extraClass, onClick) {
    const buttonElem = document.createElement('button');
    buttonElem.className = `x-dl-item ${extraClass || ''}`;
    buttonElem.type = 'button';
    buttonElem.innerHTML = `${iconSvg} <span>${text}</span>`;
    buttonElem.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    return buttonElem;
  }

  function closeMenu() {
    if (activeMenu) {
      activeMenu.remove();
      activeMenu = null;
    }
  }

  // Extract tweet ID or handle username for filenames
  function getTweetId(tweet) {
    const timeLink = tweet.querySelector('time')?.parentElement;
    if (timeLink && timeLink.href) {
      const match = timeLink.href.match(/status\/(\d+)/);
      if (match) return match[1];
    }
    return Date.now().toString();
  }

  /**
   * Smart border line detector (detects 1px solid/transparent/jump lines on edges)
   */
  function detectImageBorderCrop(img) {
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;

    if (nw < 20 || nh < 20) {
      return { cropLeft: 0, cropRight: 0, cropTop: 0, cropBottom: 0 };
    }

    const canvas = document.createElement('canvas');
    canvas.width = nw;
    canvas.height = nh;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    let imgData;
    try {
      imgData = ctx.getImageData(0, 0, nw, nh);
    } catch (e) {
      return { cropLeft: 0, cropRight: 0, cropTop: 0, cropBottom: 0 };
    }

    const data = imgData.data;

    let cropLeft = 0;
    let cropRight = 0;
    let cropTop = 0;
    let cropBottom = 0;

    // Check left edge (up to 4px)
    for (let x = 0; x < Math.min(4, Math.floor(nw / 10)); x++) {
      if (isBorderColumn(data, nw, nh, x, x + 1)) {
        cropLeft = x + 1;
      } else {
        break;
      }
    }

    // Check right edge (up to 4px)
    for (let x = nw - 1; x >= Math.max(nw - 4, nw - Math.floor(nw / 10)); x--) {
      if (isBorderColumn(data, nw, nh, x, x - 1)) {
        cropRight++;
      } else {
        break;
      }
    }

    // Check top edge (up to 4px)
    for (let y = 0; y < Math.min(4, Math.floor(nh / 10)); y++) {
      if (isBorderRow(data, nw, nh, y, y + 1)) {
        cropTop = y + 1;
      } else {
        break;
      }
    }

    // Check bottom edge (up to 4px)
    for (let y = nh - 1; y >= Math.max(nh - 4, nh - Math.floor(nh / 10)); y--) {
      if (isBorderRow(data, nw, nh, y, y - 1)) {
        cropBottom++;
      } else {
        break;
      }
    }

    if (cropLeft > 0 || cropRight > 0 || cropTop > 0 || cropBottom > 0) {
      console.log(`[X Downloader Auto-Crop] Trimming borders: L=${cropLeft}px, R=${cropRight}px, T=${cropTop}px, B=${cropBottom}px`);
    }

    return { cropLeft, cropRight, cropTop, cropBottom };
  }

  function isBorderColumn(data, w, h, colX, compareX) {
    let isTransparent = true;
    let sumR = 0, sumG = 0, sumB = 0;
    let diffSum = 0;
    const step = Math.max(1, Math.floor(h / 100));
    let samples = 0;

    for (let y = 0; y < h; y += step) {
      const idx1 = (y * w + colX) * 4;
      const idx2 = (y * w + compareX) * 4;

      const r1 = data[idx1], g1 = data[idx1 + 1], b1 = data[idx1 + 2], a1 = data[idx1 + 3];
      const r2 = data[idx2], g2 = data[idx2 + 1], b2 = data[idx2 + 2], a2 = data[idx2 + 3];

      if (a1 >= 30) isTransparent = false;

      sumR += r1; sumG += g1; sumB += b1;
      diffSum += Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
      samples++;
    }

    if (isTransparent) return true;

    const avgR = sumR / samples;
    const avgG = sumG / samples;
    const avgB = sumB / samples;

    let varSum = 0;
    for (let y = 0; y < h; y += step) {
      const idx = (y * w + colX) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      varSum += Math.abs(r - avgR) + Math.abs(g - avgG) + Math.abs(b - avgB);
    }
    const avgVar = varSum / samples;

    // Solid line check (low variance across vertical line)
    if (avgVar < 10.0) return true;
    // Discontinuity jump check relative to inner column
    if (diffSum / samples > 45) return true;

    return false;
  }

  function isBorderRow(data, w, h, rowY, compareY) {
    let isTransparent = true;
    let sumR = 0, sumG = 0, sumB = 0;
    let diffSum = 0;
    const step = Math.max(1, Math.floor(w / 100));
    let samples = 0;

    for (let x = 0; x < w; x += step) {
      const idx1 = (rowY * w + x) * 4;
      const idx2 = (compareY * w + x) * 4;

      const r1 = data[idx1], g1 = data[idx1 + 1], b1 = data[idx1 + 2], a1 = data[idx1 + 3];
      const r2 = data[idx2], g2 = data[idx2 + 1], b2 = data[idx2 + 2], a2 = data[idx2 + 3];

      if (a1 >= 30) isTransparent = false;

      sumR += r1; sumG += g1; sumB += b1;
      diffSum += Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
      samples++;
    }

    if (isTransparent) return true;

    const avgR = sumR / samples;
    const avgG = sumG / samples;
    const avgB = sumB / samples;

    let varSum = 0;
    for (let x = 0; x < w; x += step) {
      const idx = (rowY * w + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      varSum += Math.abs(r - avgR) + Math.abs(g - avgG) + Math.abs(b - avgB);
    }
    const avgVar = varSum / samples;

    if (avgVar < 10.0) return true;
    if (diffSum / samples > 45) return true;

    return false;
  }

  /**
   * Stitch multiple images together using Canvas API with automatic 1px seam border removal
   * @param {Array<string>} urls Array of original image URLs
   * @param {string} direction 'horizontal' or 'vertical'
   * @param {string} tweetId
   */
  async function stitchAndDownloadImages(urls, direction, tweetId) {
    showToast(`Pobieranie i analizowanie ${urls.length} obrazków...`);

    try {
      // Fetch all images as blobs to avoid CORS canvas taint
      const loadedImages = await Promise.all(
        urls.map(async (url) => {
          const resp = await fetch(url);
          if (!resp.ok) throw new Error(`Błąd pobierania obrazu (${resp.status}): ${url}`);
          const blob = await resp.blob();
          const imgUrl = URL.createObjectURL(blob);

          return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
              const crop = detectImageBorderCrop(img);
              const effW = img.naturalWidth - crop.cropLeft - crop.cropRight;
              const effH = img.naturalHeight - crop.cropTop - crop.cropBottom;
              resolve({
                img,
                blobUrl: imgUrl,
                crop,
                effectiveWidth: effW > 0 ? effW : img.naturalWidth,
                effectiveHeight: effH > 0 ? effH : img.naturalHeight
              });
            };
            img.onerror = () => reject(new Error('Błąd ładowania obrazka'));
            img.src = imgUrl;
          });
        })
      );

      // Create canvas
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (direction === 'horizontal') {
        // Find target height (max effective height among images)
        const targetHeight = Math.max(...loadedImages.map(item => item.effectiveHeight));
        
        // Calculate scaled widths for all images to match targetHeight
        const scaledWidths = loadedImages.map(item =>
          Math.round(item.effectiveWidth * (targetHeight / item.effectiveHeight))
        );

        const totalWidth = scaledWidths.reduce((a, b) => a + b, 0);

        canvas.width = totalWidth;
        canvas.height = targetHeight;

        // Draw images horizontally side-by-side (cropped of border lines)
        let currentX = 0;
        loadedImages.forEach((item, idx) => {
          const w = scaledWidths[idx];
          const sx = item.crop.cropLeft;
          const sy = item.crop.cropTop;
          const sw = item.effectiveWidth;
          const sh = item.effectiveHeight;

          ctx.drawImage(item.img, sx, sy, sw, sh, currentX, 0, w, targetHeight);
          currentX += w;
        });

      } else {
        // Vertical stitching
        const targetWidth = Math.max(...loadedImages.map(item => item.effectiveWidth));

        const scaledHeights = loadedImages.map(item =>
          Math.round(item.effectiveHeight * (targetWidth / item.effectiveWidth))
        );

        const totalHeight = scaledHeights.reduce((a, b) => a + b, 0);

        canvas.width = targetWidth;
        canvas.height = targetHeight;

        // Draw images vertically top-to-bottom (cropped of border lines)
        let currentY = 0;
        loadedImages.forEach((item, idx) => {
          const h = scaledHeights[idx];
          const sx = item.crop.cropLeft;
          const sy = item.crop.cropTop;
          const sw = item.effectiveWidth;
          const sh = item.effectiveHeight;

          ctx.drawImage(item.img, sx, sy, sw, sh, 0, currentY, targetWidth, h);
          currentY += h;
        });
      }

      // Cleanup object URLs
      loadedImages.forEach(item => URL.revokeObjectURL(item.blobUrl));

      // Export canvas to blob and download directly
      canvas.toBlob((blob) => {
        if (!blob) {
          showToast('Nie udało się wygenerować połączonego obrazka.', true);
          return;
        }

        const stitchedFilename = `x_stitched_${direction}_${tweetId}.png`;
        const blobUrl = URL.createObjectURL(blob);
        triggerAnchorDownload(blobUrl, stitchedFilename);

        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
        showToast(`Bezszwowo połączono ${urls.length} obrazki jako 1 plik PNG!`);
      }, 'image/png');

    } catch (err) {
      console.error('[X Downloader Error]', err);
      showToast(`Błąd scalania obrazków: ${err.message}`, true);
    }
  }

  /**
   * Direct download helper: Fetches image/video as Blob and triggers anchor download.
   * Converts cross-origin URLs into local blob: URLs so browsers NEVER open them in a new tab!
   */
  async function downloadFile(url, filename) {
    if (url.startsWith('blob:') || url.startsWith('data:')) {
      triggerAnchorDownload(url, filename);
      return;
    }

    showToast(`Pobieranie ${filename}...`);

    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);

      triggerAnchorDownload(blobUrl, filename);

      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    } catch (err) {
      console.warn('[X Downloader] Pobieranie bezpośrednie przez Blob nie powiodło się, próbuję link bezpośredni:', err);
      triggerAnchorDownload(url, filename);
    }
  }

  // Trigger HTML <a> tag download
  function triggerAnchorDownload(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // Show Toast notification
  function showToast(message, isError = false) {
    let container = document.querySelector('.x-dl-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'x-dl-toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `x-dl-toast ${isError ? 'error' : ''}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(12px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // Start script execution
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
