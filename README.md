# Wedding Gallery

Galleria fotografica self-hosted per gli invitati di un matrimonio. Niente
login: si scrive il proprio nome una volta (salvato nel `localStorage` del
telefono) e da lì in poi ogni foto caricata mostra chi l'ha messa.

## Funzionalità

- Upload multiplo di foto (anche HEIC/HEIC da iPhone, convertite automaticamente).
- Compressione automatica: ogni foto genera una thumbnail leggera per la
  griglia e una versione "full" ottimizzata in WebP per la visualizzazione
  a schermo intero — pensate per restare piccole senza perdere dettaglio.
- I dati EXIF (inclusa la posizione GPS) vengono rimossi dalle foto salvate.
- Griglia in stile Google Photos, con alcune foto più grandi ("featured")
  per dare varietà al layout, responsive da telefono a desktop.
- Filtro per autore e ordinamento per data (più recenti / meno recenti).
- Aggiornamento automatico: un banner avvisa quando arrivano nuove foto,
  senza dover ricaricare la pagina.
- Lightbox con navigazione tastiera/swipe e download della foto originale.

## Requisiti

- Node.js 18 o superiore.

## Avvio in locale

```bash
npm install
cp .env.example .env
npm start
```

Apri `http://localhost:3000`.

## Configurazione (`.env`)

| Variabile              | Descrizione                                      | Default              |
|------------------------|---------------------------------------------------|-----------------------|
| `PORT`                 | Porta di ascolto del server                       | `3000`                |
| `UPLOAD_DIR`           | Cartella dove salvare le foto compresse           | `./data/uploads`      |
| `DB_PATH`              | Percorso del database SQLite                      | `./data/gallery.db`   |
| `MAX_FILE_MB`          | Dimensione massima per singola foto originale     | `25`                  |
| `MAX_FILES_PER_UPLOAD` | Numero massimo di foto per singolo upload         | `20`                  |
| `GALLERY_TITLE`        | Titolo mostrato in alto nella pagina              | `Il Nostro Matrimonio`|
| `ADMIN_PASSWORD`       | Password per `/admin`. Vuota = zona admin disabilitata | _(vuota)_        |

## Zona admin

Su `/admin` (es. `https://gallery.tuodominio.it/admin`) trovi una pagina,
non collegata dal resto del sito, per eliminare foto (utile per rimuovere
foto di test o inadatte). Serve `ADMIN_PASSWORD` impostata nel `.env` —
senza, la zona admin risponde "non configurata". La password viene
richiesta una volta per sessione del browser (non resta salvata dopo aver
chiuso la scheda).

## Deploy su Arch Linux (systemd)

1. Installa Node.js e gli strumenti di build:
   ```bash
   sudo pacman -S --needed nodejs npm git base-devel python
   ```
   `base-devel` e `python` servono perché `better-sqlite3` è un modulo
   nativo: se il binario precompilato scaricato da npm non è compatibile
   con il tuo sistema, questi strumenti permettono di ricompilarlo in
   locale (vedi la sezione "Risoluzione problemi" più sotto).

2. Crea un utente dedicato e clona il repository:
   ```bash
   sudo useradd -r -m -s /usr/bin/nologin wedding
   sudo git clone https://github.com/ndPPPhz/Wedding-Gallery.git /opt/wedding-gallery
   cd /opt/wedding-gallery
   sudo npm install --omit=dev
   sudo cp .env.example .env
   # modifica /opt/wedding-gallery/.env se vuoi cambiare titolo/porta
   sudo mkdir -p data
   sudo chown -R wedding:wedding /opt/wedding-gallery
   ```

   Se il repository è privato, clonalo via SSH invece che via HTTPS: genera
   una chiave sul server (`sudo -u wedding ssh-keygen -t ed25519`), aggiungila
   su GitHub in *Settings → SSH and GPG keys*, e usa
   `git@github.com:ndPPPhz/Wedding-Gallery.git` come URL.

3. Installa il servizio systemd:
   ```bash
   sudo cp deploy/wedding-gallery.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now wedding-gallery
   sudo systemctl status wedding-gallery
   ```

4. Il server ora ascolta su `http://127.0.0.1:3000` (solo in locale). Per
   esporlo su internet con dominio/HTTPS, usa nginx come reverse proxy —
   vedi `deploy/nginx.conf.example` per un esempio, poi:
   ```bash
   sudo pacman -S nginx certbot certbot-nginx
   sudo cp deploy/nginx.conf.example /etc/nginx/sites/wedding-gallery.conf   # adatta al tuo setup nginx
   sudo systemctl enable --now nginx
   sudo certbot --nginx -d gallery.tuodominio.it
   ```

5. Per aggiornare l'app dopo una modifica al repository, dal server:
   ```bash
   cd /opt/wedding-gallery
   sudo -u wedding git pull origin main
   sudo -u wedding npm install --omit=dev   # solo se sono cambiate le dipendenze
   sudo systemctl restart wedding-gallery
   ```
   La cartella `data/` (foto + database) è nel `.gitignore` e non viene mai
   toccata da `git pull`, quindi i contenuti già caricati restano al sicuro
   tra un aggiornamento e l'altro.

## Risoluzione problemi

**Il servizio non parte, e nei log (`journalctl -u wedding-gallery`) vedi
un errore di `better-sqlite3` che non trova il suo file `.node`:**
il binario nativo precompilato scaricato durante `npm install` non è
compatibile con il tuo sistema (succede più facilmente con versioni di
Node.js molto recenti). Ricompilalo in locale — richiede `base-devel` e
`python` installati (punto 1):
```bash
sudo pacman -S --needed base-devel python
cd /opt/wedding-gallery
sudo -u wedding npm rebuild better-sqlite3 --build-from-source
sudo systemctl restart wedding-gallery
```

## Note

- Le foto originali non vengono mai salvate su disco: solo le versioni
  compresse (thumbnail + full), generate al volo in memoria durante l'upload.
- Il database SQLite (`data/gallery.db`) e le foto (`data/uploads/`) sono
  l'unico stato persistente: basta fare un backup della cartella `data/`.
