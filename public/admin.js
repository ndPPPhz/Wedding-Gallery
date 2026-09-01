(() => {
  const PW_KEY = 'wg_admin_password';

  const loginBox = document.getElementById('loginBox');
  const loginForm = document.getElementById('loginForm');
  const passwordInput = document.getElementById('passwordInput');
  const loginError = document.getElementById('loginError');
  const adminGrid = document.getElementById('adminGrid');
  const adminEmpty = document.getElementById('adminEmpty');
  const adminSummary = document.getElementById('adminSummary');

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
    adminGrid.hidden = true;
    adminEmpty.hidden = true;
    loginError.hidden = !message;
    loginError.textContent = message || '';
  }

  function showGrid() {
    loginBox.hidden = true;
    loadPhotos();
  }

  function renderGrid(photos, password) {
    adminGrid.innerHTML = '';
    adminEmpty.hidden = photos.length > 0;
    adminGrid.hidden = photos.length === 0;

    const totalBytes = photos.reduce((sum, p) => sum + (p.sizeBytes || 0), 0);
    adminSummary.hidden = photos.length === 0;
    adminSummary.textContent = `${photos.length} foto · ${formatBytes(totalBytes)} totali (versioni compresse)`;

    for (const photo of photos) {
      const card = document.createElement('div');
      card.className = 'admin-card';

      const img = document.createElement('img');
      img.src = photo.thumbUrl;
      img.alt = `Foto di ${photo.author}`;
      img.loading = 'lazy';

      const info = document.createElement('div');
      info.className = 'admin-card-info';
      info.textContent = `${photo.author} · ${new Date(photo.createdAt).toLocaleString('it-IT')} · ${formatBytes(photo.sizeBytes)}`;

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.textContent = 'Elimina';
      deleteBtn.addEventListener('click', () => deletePhoto(photo.id, password));

      card.appendChild(img);
      card.appendChild(info);
      card.appendChild(deleteBtn);
      adminGrid.appendChild(card);
    }
  }

  async function loadPhotos() {
    const password = getPassword();
    const res = await fetch('/api/photos?sort=desc');
    const data = await res.json();
    renderGrid(data.photos, password);
  }

  async function deletePhoto(id, password) {
    if (!confirm('Eliminare questa foto? Non si può annullare.')) return;

    const res = await fetch(`/api/photos/${id}`, {
      method: 'DELETE',
      headers: { 'x-admin-password': password },
    });

    if (res.status === 401) {
      sessionStorage.removeItem(PW_KEY);
      showLogin('Password non più valida, reinseriscila.');
      return;
    }
    if (!res.ok) {
      alert('Errore durante l\'eliminazione della foto.');
      return;
    }
    loadPhotos();
  }

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
