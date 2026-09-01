(() => {
  const NAME_KEY = 'wg_guest_name';
  const POLL_INTERVAL_MS = 12000;

  const state = {
    photos: [],
    author: '',
    sort: 'desc',
    lightboxIndex: -1,
  };

  const grid = document.getElementById('grid');
  const emptyState = document.getElementById('emptyState');
  const authorFilter = document.getElementById('authorFilter');
  const sortToggle = document.getElementById('sortToggle');
  const sortLabel = document.getElementById('sortLabel');
  const newPhotosBanner = document.getElementById('newPhotosBanner');
  const newPhotosBtn = document.getElementById('newPhotosBtn');
  const fileInput = document.getElementById('fileInput');
  const uploadProgress = document.getElementById('uploadProgress');
  const uploadProgressFill = document.getElementById('uploadProgressFill');
  const uploadProgressText = document.getElementById('uploadProgressText');
  const nameModal = document.getElementById('nameModal');
  const nameForm = document.getElementById('nameForm');
  const nameInput = document.getElementById('nameInput');

  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightboxImg');
  const lightboxAuthor = document.getElementById('lightboxAuthor');
  const lightboxDate = document.getElementById('lightboxDate');
  const lightboxDownload = document.getElementById('lightboxDownload');

  function getGuestName() {
    return localStorage.getItem(NAME_KEY) || '';
  }

  function setGuestName(name) {
    localStorage.setItem(NAME_KEY, name);
  }

  function hashString(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (h * 31 + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
  }

  function isFeatured(photo) {
    return hashString(photo.id) % 7 === 0;
  }

  function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  async function loadConfig() {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      if (data.title) document.getElementById('galleryTitle').textContent = data.title;
    } catch (e) { /* usa titolo di default */ }
  }

  async function loadAuthors() {
    const res = await fetch('/api/authors');
    const data = await res.json();
    const current = authorFilter.value;
    authorFilter.innerHTML = '<option value="">Tutti gli invitati</option>';
    for (const { author, count } of data.authors) {
      const opt = document.createElement('option');
      opt.value = author;
      opt.textContent = `${author} (${count})`;
      authorFilter.appendChild(opt);
    }
    authorFilter.value = current;
  }

  async function fetchPhotos() {
    const params = new URLSearchParams({ sort: state.sort });
    if (state.author) params.set('author', state.author);
    const res = await fetch(`/api/photos?${params}`);
    const data = await res.json();
    return data.photos;
  }

  function renderGrid(photos) {
    grid.innerHTML = '';
    emptyState.hidden = photos.length > 0;

    photos.forEach((photo, index) => {
      const tile = document.createElement('div');
      tile.className = 'tile' + (isFeatured(photo) ? ' featured' : '');
      tile.dataset.index = String(index);

      const img = document.createElement('img');
      img.src = photo.thumbUrl;
      img.loading = 'lazy';
      img.alt = `Foto di ${photo.author}`;
      if (photo.width && photo.height) {
        img.style.aspectRatio = `${photo.width} / ${photo.height}`;
      }

      const caption = document.createElement('div');
      caption.className = 'tile-caption';
      caption.textContent = `${photo.author} · ${formatDate(photo.createdAt)}`;

      tile.appendChild(img);
      tile.appendChild(caption);
      tile.addEventListener('click', () => openLightbox(index));
      grid.appendChild(tile);
    });
  }

  async function refresh({ silent = false } = {}) {
    const photos = await fetchPhotos();

    if (silent && state.photos.length > 0) {
      const knownIds = new Set(state.photos.map((p) => p.id));
      const hasNew = photos.some((p) => !knownIds.has(p.id));
      if (hasNew) {
        newPhotosBanner.hidden = false;
        return;
      }
      return;
    }

    state.photos = photos;
    renderGrid(photos);
    newPhotosBanner.hidden = true;
  }

  function openLightbox(index) {
    state.lightboxIndex = index;
    showLightboxPhoto();
    lightbox.hidden = false;
  }

  function showLightboxPhoto() {
    const photo = state.photos[state.lightboxIndex];
    if (!photo) return;
    lightboxImg.src = photo.fullUrl;
    lightboxImg.alt = `Foto di ${photo.author}`;
    lightboxAuthor.textContent = photo.author;
    lightboxDate.textContent = formatDate(photo.createdAt);
    lightboxDownload.href = photo.fullUrl;
  }

  function closeLightbox() {
    lightbox.hidden = true;
    lightboxImg.src = '';
  }

  function stepLightbox(delta) {
    const next = state.lightboxIndex + delta;
    if (next < 0 || next >= state.photos.length) return;
    state.lightboxIndex = next;
    showLightboxPhoto();
  }

  function uploadFiles(files) {
    const guestName = getGuestName();
    const form = new FormData();
    form.append('author', guestName);
    for (const file of files) form.append('photos', file);

    uploadProgress.hidden = false;
    uploadProgressFill.style.width = '0%';
    uploadProgressText.textContent = `Caricamento di ${files.length} foto…`;

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/photos');

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        uploadProgressFill.style.width = `${pct}%`;
      }
    });

    xhr.onload = async () => {
      uploadProgress.hidden = true;
      fileInput.value = '';
      if (xhr.status >= 200 && xhr.status < 300) {
        await loadAuthors();
        await refresh();
      } else {
        let message = 'Errore durante il caricamento.';
        try { message = JSON.parse(xhr.responseText).error || message; } catch (e) { /* ignore */ }
        alert(message);
      }
    };

    xhr.onerror = () => {
      uploadProgress.hidden = true;
      alert('Errore di rete durante il caricamento.');
    };

    xhr.send(form);
  }

  function ensureGuestName(onReady) {
    const existing = getGuestName();
    if (existing) {
      onReady();
      return;
    }
    nameModal.hidden = false;
    nameForm.addEventListener(
      'submit',
      (e) => {
        e.preventDefault();
        const name = nameInput.value.trim();
        if (!name) return;
        setGuestName(name);
        nameModal.hidden = true;
        onReady();
      },
      { once: true },
    );
  }

  // Eventi UI
  authorFilter.addEventListener('change', () => {
    state.author = authorFilter.value;
    refresh();
  });

  sortToggle.addEventListener('click', () => {
    state.sort = state.sort === 'desc' ? 'asc' : 'desc';
    sortLabel.textContent = state.sort === 'desc' ? 'Più recenti' : 'Meno recenti';
    refresh();
  });

  newPhotosBtn.addEventListener('click', () => {
    refresh();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length === 0) return;
    ensureGuestName(() => uploadFiles(fileInput.files));
  });

  document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
  document.getElementById('lightboxPrev').addEventListener('click', () => stepLightbox(-1));
  document.getElementById('lightboxNext').addEventListener('click', () => stepLightbox(1));
  lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });

  document.addEventListener('keydown', (e) => {
    if (lightbox.hidden) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') stepLightbox(-1);
    if (e.key === 'ArrowRight') stepLightbox(1);
  });

  // Swipe touch nel lightbox
  let touchStartX = null;
  lightbox.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; });
  lightbox.addEventListener('touchend', (e) => {
    if (touchStartX === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 50) stepLightbox(dx > 0 ? -1 : 1);
    touchStartX = null;
  });

  // Avvio
  loadConfig();
  loadAuthors();
  refresh().then(() => {
    setInterval(() => refresh({ silent: true }), POLL_INTERVAL_MS);
  });
})();
