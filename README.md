# 🌊 Flow Kanban — Personal Task Manager

A fast, lightweight, and password-protected personal Kanban Todo website. Designed specifically to run reliably on resource-constrained servers like **Google Cloud Platform (GCP) `e2-micro`** instances (1 vCPU, 1 GB RAM).

Built with **pure Vanilla HTML/CSS/JS** on the frontend and a **Node.js Express** backend that persists all tasks directly in a clean **CSV file**.

---

## ✨ Features

- 📋 **Visual Kanban Workflow**: Three intuitive columns: **To Do**, **In Progress**, and **Completed**.
- 🖱️ **Drag & Drop + Mobile Controls**: Full HTML5 drag-and-drop between columns, plus accessible one-tap "← Move" buttons for smartphones and touchscreens.
- ⚡ **Lightweight CSV Persistence**:
  - All tasks stored in `data/tasks.csv`.
  - **Atomic write system** (`.tmp` write + atomic rename) prevents file corruption on server crashes.
  - **Spreadsheet Formula Injection Defense**: Sanitizes symbols (`=`, `+`, `-`, `@`) when opening CSVs in Excel/Google Sheets.
- 🔒 **Security & Authentication**:
  - **Password Protection**: Hashed using Node.js built-in `scrypt` with cryptographic salts (timing-safe verification).
  - **Session Management**: Cryptographically secure 256-bit session tokens stored in `httpOnly` cookies.
  - **Brute-Force Rate Limiting**: Automatically locks out IP addresses after 5 failed login attempts for 10 minutes.
  - **Change Password**: In-app UI to rotate your master password anytime.
- 🔍 **Realtime Search & Filtering**: Instant search across titles & descriptions, plus filter by priority (High 🔥, Medium ⚡, Low 🌿).
- 💾 **Instant Backup**: One-click "Export CSV" button to download a timestamped backup of your data.
- 🎨 **Modern Aesthetics**: Rich glassmorphic dark theme, Google Fonts (`Outfit` & `Plus Jakarta Sans`), subtle glowing accents, and micro-animations.

---

## 🚀 Quick Start (Local)

### 1. Install dependencies
```bash
npm install
```

### 2. Configure password in `.env`
Edit `.env` (or copy from `.env.example`):
```env
PORT=3000
ADMIN_PASSWORD=admin123
NODE_ENV=development
```

### 3. Start the server
```bash
npm start
# or
node server.js
```

Open [http://localhost:3000](http://localhost:3000) in your browser and log in with your password (`admin123`).

---

## ☁️ Deploying to GCP `e2-micro`

A GCP `e2-micro` has **1 GB RAM** and shared CPU. Flow Kanban consumes only **~30MB of RAM**, making it an ideal choice for this tier.

### 1. Connect to your GCP VM
```bash
gcloud compute ssh <YOUR_INSTANCE_NAME> --zone=<YOUR_ZONE>
```

### 2. Install Node.js (v20+ LTS)
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git nginx certbot python3-certbot-nginx
```

### 3. Clone or copy your code
```bash
git clone <YOUR_REPO_URL> /home/youruser/todo
cd /home/youruser/todo
npm install --production
```

### 4. Create your `.env`
```bash
cp .env.example .env
nano .env
# Set ADMIN_PASSWORD to your secret password
# Set NODE_ENV=production
```

### 5. Setup Systemd Service (Auto-restart on reboot)
Copy the included service file:
```bash
sudo cp todo.service /etc/systemd/system/todo.service
# Edit user path if needed: sudo nano /etc/systemd/system/todo.service
sudo systemctl daemon-reload
sudo systemctl enable todo
sudo systemctl start todo
sudo systemctl status todo
```

### 6. Setup Nginx Reverse Proxy with SSL

Create an Nginx configuration file:
```bash
sudo nano /etc/nginx/sites-available/todo
```

Paste the following (replace `todo.yourdomain.com` with your domain or external IP):
```nginx
server {
    listen 80;
    server_name todo.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable site and restart Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/todo /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

Obtain a free SSL certificate via Let's Encrypt:
```bash
sudo certbot --nginx -d todo.yourdomain.com
```

### 7. Configure GCP Firewall
Ensure your GCP VPC firewall allows incoming traffic on port `80` (HTTP) and `443` (HTTPS).

---

## 📂 Project Structure

```
todo/
├── data/
│   └── tasks.csv          # Persistent CSV database
├── public/
│   ├── index.html         # Modern Kanban UI shell
│   ├── style.css          # Dark glassmorphism & responsive styles
│   └── app.js             # Drag-drop, authentication & API calls
├── .env                   # Configuration & secrets
├── .env.example           # Environment template
├── package.json           # Dependencies
├── server.js              # Express API & secure CSV handler
├── todo.service           # Systemd unit file for GCP e2-micro
└── README.md              # Documentation
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `N` | Open New Task modal |
| `/` | Focus search bar |
| `Esc` | Close any open modal |
| `Double Click` (Card) | Quick edit card |
