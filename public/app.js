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
  const hero = document.getElementById('hero');
  const heroImg = document.getElementById('heroImg');
  const heroTitle = document.getElementById('heroTitle');
  const menuToggle = document.getElementById('menuToggle');
  const filtersPanel = document.getElementById('filtersPanel');
  const filtersOverlay = document.getElementById('filtersOverlay');
  const authorFilter = document.getElementById('authorFilter');
  const sortToggle = document.getElementById('sortToggle');
  const sortLabel = document.getElementById('sortLabel');
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

      if (data.coverPhoto) {
        heroImg.src = data.coverPhoto.fullUrl;
        heroTitle.textContent = data.title || '';
        hero.hidden = false;
      } else {
        hero.hidden = true;
      }
    } catch (e) { /* usa titolo di default, niente hero */ }
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
      const aspectRatio = photo.width && photo.height ? photo.width / photo.height : 1;

      const tile = document.createElement('div');
      tile.className = 'tile';
      tile.dataset.index = String(index);
      // Righe "giustificate" in stile Google Photos: ogni riquadro tenta di
      // occupare la larghezza proporzionale alla sua foto (flex-basis), poi
      // flex-grow (pesato sull'aspect ratio) distribuisce lo spazio libero
      // di ogni riga così che il bordo destro combaci, senza tagli forzati
      // a un quadrato fisso.
      tile.style.flexGrow = aspectRatio;
      tile.style.flexBasis = `${aspectRatio * 140}px`;

      const img = document.createElement('img');
      img.src = photo.thumbUrl;
      img.loading = 'lazy';
      img.alt = `Foto di ${photo.author}`;

      const caption = document.createElement('div');
      caption.className = 'tile-caption';
      caption.textContent = `${photo.author} · ${formatDate(photo.createdAt)}`;

      tile.appendChild(img);
      tile.appendChild(caption);
      tile.addEventListener('click', () => openLightbox(index));
      grid.appendChild(tile);
    });
  }

  function samePhotoList(a, b) {
    return a.length === b.length && a.every((photo, i) => photo.id === b[i].id);
  }

  async function refresh() {
    const photos = await fetchPhotos();
    if (samePhotoList(photos, state.photos)) return;
    state.photos = photos;
    renderGrid(photos);
  }

  function openLightbox(index) {
    state.lightboxIndex = index;
    showLightboxPhoto();
    lightbox.classList.add('open');
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
    lightbox.classList.remove('open');
    refresh();
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
  function setMenuOpen(open) {
    filtersPanel.hidden = !open;
    filtersOverlay.hidden = !open;
    menuToggle.setAttribute('aria-expanded', String(open));
  }

  menuToggle.addEventListener('click', () => {
    setMenuOpen(filtersPanel.hidden);
  });

  filtersOverlay.addEventListener('click', () => setMenuOpen(false));

  authorFilter.addEventListener('change', () => {
    state.author = authorFilter.value;
    refresh();
  });

  sortToggle.addEventListener('click', () => {
    state.sort = state.sort === 'desc' ? 'asc' : 'desc';
    sortLabel.textContent = state.sort === 'desc' ? 'Più recenti prima' : 'Meno recenti prima';
    refresh();
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
    if (e.key === 'Escape' && !filtersPanel.hidden) setMenuOpen(false);
    if (!lightbox.classList.contains('open')) return;
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
    setInterval(() => {
      loadAuthors();
      // Non aggiornare la griglia sotto i piedi di chi sta guardando una
      // foto a schermo intero: l'indice del lightbox si riferisce alla
      // lista attuale e andrebbe fuori sincrono con una nuova lista.
      if (!lightbox.classList.contains('open')) refresh();
    }, POLL_INTERVAL_MS);
  });
})();
