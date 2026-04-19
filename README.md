# FilePhoenix

AI-powered file repair service. Upload any corrupted document, image, video, or archive — get a working file back in seconds.

---

## Tech Stack

- **Backend** — Node.js + Express
- **File handling** — Multer (multipart uploads)
- **Repair engine** — Custom binary analysis (no external dependencies)
- **Frontend** — Vanilla HTML / CSS / JS (zero frameworks)

---

## Local Setup

```bash
# 1. Clone or unzip the project
cd filephoenix

# 2. Install dependencies
npm install

# 3. Copy the env file
cp .env.example .env

# 4. Start the dev server (auto-reload)
npm run dev

# OR start in production mode
npm start
```

Open http://localhost:3000

---

## Project Structure

```
filephoenix/
├── server.js          ← Express server + repair engine
├── package.json
├── .env.example
├── .gitignore
├── uploads/           ← Temp upload dir (auto-created, auto-cleaned)
├── repaired/          ← Repaired files (auto-created, auto-cleaned)
└── public/
    ├── index.html     ← Full frontend
    ├── style.css      ← All styles
    └── main.js        ← Upload UI + polling logic
```

---

## Deployment

### Render (free tier)

1. Push code to a GitHub repo
2. Go to https://render.com → New → Web Service
3. Connect your repo, set:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Environment:** Node
4. Add env var: `PORT=10000` (Render assigns this automatically)
5. Deploy — your site will be live at `https://your-app.onrender.com`

### Railway

```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

### VPS / DigitalOcean / Hetzner

```bash
# On the server
git clone <your-repo> filephoenix
cd filephoenix
npm install
cp .env.example .env
# edit .env if needed

# Run with PM2 (keeps it alive)
npm install -g pm2
pm2 start server.js --name filephoenix
pm2 save
pm2 startup
```

Put Nginx in front for SSL:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 500M;
    }
}
```

Then use Certbot for free HTTPS:

```bash
sudo certbot --nginx -d yourdomain.com
```

---

## What Gets Repaired

| Format | Repairs applied |
|--------|-----------------|
| PDF | Missing `%PDF-` header, missing `%%EOF`, null-byte corruption in stream data |
| JPEG | Missing SOI/EOI markers, premature EOI markers inside data |
| PNG | Corrupted signature bytes, missing IEND chunk |
| ZIP / DOCX / XLSX / PPTX | Missing PK local header, missing end-of-central-directory record |
| MP3 | Missing ID3 header, missing MPEG sync word |
| Generic | Null-byte corruption blocks (common in partially overwritten files) |

---

## API Endpoints

```
POST   /api/upload           Upload a file, returns { jobId }
GET    /api/status/:jobId    Poll repair progress
GET    /api/download/:jobId  Download the repaired file
```

---

## Notes

- Uploaded files are **deleted immediately** after repair processing
- Repaired files are **deleted 1 hour** after creation
- All traffic should go through HTTPS in production (use Nginx + Certbot)
- Max file size is 500MB by default — adjust `limits.fileSize` in `server.js`
