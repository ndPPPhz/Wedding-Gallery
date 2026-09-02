(() => {
  const PW_KEY = 'wg_admin_password';

  const loginBox = document.getElementById('loginBox');
  const loginForm = document.getElementById('loginForm');
  const passwordInput = document.getElementById('passwordInput');
  const loginError = document.getElementById('loginError');
  const adminGrid = document.getElementById('adminGrid');
  const adminEmpty = document.getElementById('adminEmpty');
  const adminSummary = document.getElementById('adminSummary');
  const coverSection = document.getElementById('coverSection');
  const coverPreviewImg = document.getElementById('coverPreviewImg');
  const coverPreviewEmpty = document.getElementById('coverPreviewEmpty');
  const coverFileInput = document.getElementById('coverFileInput');
  const removeCoverBtn = document.getElementById('removeCoverBtn');

  function formatBytes(bytes) {
    if (!bytes) return '0 KB';
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function getPassword() {
    return sessionStorage.getItem(PW_KEY) || '';
  }

  function showLogin(message) {
    loginBox.hidden = false;
    coverSection.hidden = true;
    adminGrid.hidden = true;
    adminEmpty.hidden = true;
    loginError.hidden = !message;
    loginError.textContent = message || '';
  }

  function showGrid() {
    loginBox.hidden = true;
    coverSection.hidden = false;
    loadPhotos();
  }

  function renderCoverPreview(coverPhoto) {
    if (coverPhoto) {
      coverPreviewImg.src = coverPhoto.thumbUrl;
      coverPreviewImg.hidden = false;
      coverPreviewEmpty.hidden = true;
      removeCoverBtn.hidden = false;
    } else {
      coverPreviewImg.hidden = true;
      coverPreviewEmpty.hidden = false;
      removeCoverBtn.hidden = true;
    }
  }

  function renderGrid(photos, password, coverId) {
    adminGrid.innerHTML = '';
    adminEmpty.hidden = photos.length > 0;
    adminGrid.hidden = photos.length === 0;

    const totalBytes = photos.reduce((sum, p) => sum + (p.sizeBytes || 0), 0);
    adminSummary.hidden = photos.length === 0;
    adminSummary.textContent = `${photos.length} foto · ${formatBytes(totalBytes)} totali (versioni compresse)`;

    for (const photo of photos) {
      const isCover = photo.id === coverId;

      const card = document.createElement('div');
      card.className = 'admin-card' + (isCover ? ' is-cover' : '');

      const img = document.createElement('img');
      img.src = photo.thumbUrl;
      img.alt = `Foto di ${photo.author}`;
      img.loading = 'lazy';

      const info = document.createElement('div');
      info.className = 'admin-card-info';
      info.textContent = `${photo.author} · ${new Date(photo.createdAt).toLocaleString('it-IT')} · ${formatBytes(photo.sizeBytes)}`;
      if (isCover) info.textContent += ' · Copertina attuale';

      const coverBtn = document.createElement('button');
      coverBtn.type = 'button';
      coverBtn.className = 'cover-btn';
      coverBtn.textContent = isCover ? 'Rimuovi copertina' : 'Imposta come copertina';
      coverBtn.addEventListener('click', () => setCover(isCover ? null : photo.id, password));

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.textContent = 'Elimina';
      deleteBtn.addEventListener('click', () => deletePhoto(photo.id, password));

      card.appendChild(img);
      card.appendChild(info);
      card.appendChild(coverBtn);
      card.appendChild(deleteBtn);
      adminGrid.appendChild(card);
    }
  }

  async function loadPhotos() {
    const password = getPassword();
    const [photosRes, configRes] = await Promise.all([
      fetch('/api/photos?sort=desc'),
      fetch('/api/config'),
    ]);
    const photosData = await photosRes.json();
    const configData = await configRes.json();
    const coverId = configData.coverPhoto ? configData.coverPhoto.id : null;
    renderGrid(photosData.photos, password, coverId);
    renderCoverPreview(configData.coverPhoto);
  }

  function handleAuthFailure(res) {
    if (res.status === 401) {
      sessionStorage.removeItem(PW_KEY);
      showLogin('Password non più valida, reinseriscila.');
      return true;
    }
    return false;
  }

  async function deletePhoto(id, password) {
    if (!confirm('Eliminare questa foto? Non si può annullare.')) return;

    const res = await fetch(`/api/photos/${id}`, {
      method: 'DELETE',
      headers: { 'x-admin-password': password },
    });

    if (handleAuthFailure(res)) return;
    if (!res.ok) {
      alert('Errore durante l\'eliminazione della foto.');
      return;
    }
    loadPhotos();
  }

  async function setCover(photoId, password) {
    const res = await fetch('/api/admin/cover', {
      method: 'POST',
      headers: { 'x-admin-password': password, 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoId }),
    });

    if (handleAuthFailure(res)) return;
    if (!res.ok) {
      alert('Errore durante l\'impostazione della copertina.');
      return;
    }
    loadPhotos();
  }

  coverFileInput.addEventListener('change', async () => {
    const file = coverFileInput.files[0];
    coverFileInput.value = '';
    if (!file) return;

    const password = getPassword();
    const form = new FormData();
    form.append('cover', file);

    const res = await fetch('/api/admin/cover-upload', {
      method: 'POST',
      headers: { 'x-admin-password': password },
      body: form,
    });

    if (handleAuthFailure(res)) return;
    if (!res.ok) {
      let message = 'Errore durante il caricamento della copertina.';
      try { message = (await res.json()).error || message; } catch (e) { /* ignore */ }
      alert(message);
      return;
    }
    loadPhotos();
  });

  removeCoverBtn.addEventListener('click', () => setCover(null, getPassword()));

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = passwordInput.value;
    const res = await fetch('/api/admin/check', { headers: { 'x-admin-password': password } });
    if (res.ok) {
      sessionStorage.setItem(PW_KEY, password);
      showGrid();
    } else {
      loginError.hidden = false;
      loginError.textContent = 'Password errata.';
    }
  });

  if (getPassword()) {
    showGrid();
  } else {
    showLogin();
  }
})();
