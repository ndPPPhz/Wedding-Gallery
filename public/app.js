(() => {
  const NAME_KEY = 'wg_guest_name';
  const GUEST_ID_KEY = 'wg_guest_id';
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
  const moreToggle = document.getElementById('moreToggle');
  const morePanel = document.getElementById('morePanel');
  const filtersOverlay = document.getElementById('filtersOverlay');
  const authorFilter = document.getElementById('authorFilter');
  const sortSelect = document.getElementById('sortSelect');
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
  const lightboxDelete = document.getElementById('lightboxDelete');
  const lightboxLike = document.getElementById('lightboxLike');
  const lightboxLikeCount = document.getElementById('lightboxLikeCount');
  const heartPop = document.getElementById('heartPop');

  const HEART_SVG =
    '<svg viewBox="0 0 24 24" width="12" height="12"><path fill="currentColor" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';

  function getGuestName() {
    return localStorage.getItem(NAME_KEY) || '';
  }

  function setGuestName(name) {
    localStorage.setItem(NAME_KEY, name);
  }

  function getGuestId() {
    let id = localStorage.getItem(GUEST_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(GUEST_ID_KEY, id);
    }
    return id;
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
    const params = new URLSearchParams({ sort: state.sort, guestId: getGuestId() });
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
      caption.textContent = photo.author;

      tile.appendChild(img);
      tile.appendChild(caption);
      if (photo.likeCount > 0) {
        tile.appendChild(buildLikeBadge(photo.likeCount));
      }
      tile.addEventListener('click', () => openLightbox(index));
      grid.appendChild(tile);
    });
  }

  function buildLikeBadge(count) {
    const badge = document.createElement('div');
    badge.className = 'tile-likes';
    badge.innerHTML = `${HEART_SVG}<span>${count}</span>`;
    return badge;
  }

  function updateTileLikeBadge(index) {
    const photo = state.photos[index];
    const tile = grid.children[index];
    if (!photo || !tile) return;
    const existing = tile.querySelector('.tile-likes');
    if (photo.likeCount > 0) {
      if (existing) {
        existing.querySelector('span').textContent = photo.likeCount;
      } else {
        tile.appendChild(buildLikeBadge(photo.likeCount));
      }
    } else if (existing) {
      existing.remove();
    }
  }

  function samePhotoList(a, b) {
    return (
      a.length === b.length &&
      a.every((photo, i) => photo.id === b[i].id && photo.likeCount === b[i].likeCount)
    );
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
    lightboxDelete.hidden = !photo.mine;
    updateLightboxLikeUI(photo);
  }

  function updateLightboxLikeUI(photo) {
    lightboxLikeCount.textContent = photo.likeCount;
    lightboxLike.classList.toggle('liked', photo.likedByMe);
  }

  async function setLike(liked) {
    const photo = state.photos[state.lightboxIndex];
    if (!photo) return;
    const res = await fetch(`/api/photos/${photo.id}/like`, {
      method: liked ? 'POST' : 'DELETE',
      headers: { 'x-guest-id': getGuestId() },
    });
    if (!res.ok) return;
    const data = await res.json();
    photo.likeCount = data.likeCount;
    photo.likedByMe = data.likedByMe;
    updateLightboxLikeUI(photo);
    updateTileLikeBadge(state.lightboxIndex);
  }

  function toggleLike() {
    const photo = state.photos[state.lightboxIndex];
    if (!photo) return;
    setLike(!photo.likedByMe);
  }

  function showHeartPop() {
    heartPop.hidden = false;
    heartPop.classList.remove('pop');
    void heartPop.offsetWidth; // riavvia l'animazione anche se già in corso
    heartPop.classList.add('pop');
  }

  function likeOnDoubleTap() {
    showHeartPop();
    const photo = state.photos[state.lightboxIndex];
    if (photo && !photo.likedByMe) setLike(true);
  }

  async function deleteOwnPhoto() {
    const photo = state.photos[state.lightboxIndex];
    if (!photo) return;
    if (!confirm('Eliminare questa foto? Non si può annullare.')) return;

    const res = await fetch(`/api/photos/${photo.id}`, {
      method: 'DELETE',
      headers: { 'x-guest-id': getGuestId() },
    });

    if (!res.ok) {
      alert('Non è stato possibile eliminare la foto.');
      return;
    }
    closeLightbox();
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
    form.append('guestId', getGuestId());
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
  const panelToggles = [
    { panel: filtersPanel, toggle: menuToggle },
    { panel: morePanel, toggle: moreToggle },
  ];

  function closeAllPanels() {
    for (const { panel, toggle } of panelToggles) {
      panel.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
    }
    filtersOverlay.hidden = true;
  }

  function togglePanel(panel, toggle) {
    const isOpening = panel.hidden;
    closeAllPanels();
    if (!isOpening) return;

    const topbar = document.querySelector('.topbar');
    panel.style.top = `${topbar.getBoundingClientRect().bottom}px`;
    panel.hidden = false;
    filtersOverlay.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
  }

  menuToggle.addEventListener('click', () => togglePanel(filtersPanel, menuToggle));
  moreToggle.addEventListener('click', () => togglePanel(morePanel, moreToggle));

  filtersOverlay.addEventListener('click', closeAllPanels);

  authorFilter.addEventListener('change', () => {
    state.author = authorFilter.value;
    refresh();
  });

  sortSelect.addEventListener('change', () => {
    state.sort = sortSelect.value;
    refresh();
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length === 0) return;
    ensureGuestName(() => uploadFiles(fileInput.files));
  });

  document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
  lightboxDelete.addEventListener('click', deleteOwnPhoto);
  lightboxLike.addEventListener('click', toggleLike);
  document.getElementById('lightboxPrev').addEventListener('click', () => stepLightbox(-1));
  document.getElementById('lightboxNext').addEventListener('click', () => stepLightbox(1));
  lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });
  heartPop.addEventListener('animationend', () => {
    heartPop.hidden = true;
    heartPop.classList.remove('pop');
  });

  // Doppio tap/click sulla foto per mettere like, come Instagram
  let lastImgTapTime = 0;
  lightboxImg.addEventListener('click', () => {
    const now = Date.now();
    if (now - lastImgTapTime < 300) {
      lastImgTapTime = 0;
      likeOnDoubleTap();
    } else {
      lastImgTapTime = now;
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && (!filtersPanel.hidden || !morePanel.hidden)) closeAllPanels();
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
