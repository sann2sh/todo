# General Server Handoff & Operations Manual

**Server Alias:** `gcp`  
**VM Name:** `server`  
**Host IPv4:** `35.211.34.4`  
**Cloud Provider:** Google Cloud Platform (GCP)  
**Project ID:** `gemini-dev-project-498118`  
**Datacenter Location:** `us-east1-b` (South Carolina, USA)  
**Tier:** 100% Google Cloud Always Free Tier ($0.00/month)  
**OS:** Ubuntu 24.04.5 LTS (x86_64)

---

## 1. Hardware, Capacity & Limits

| Component | Allocation | Operational Guidelines |
| :--- | :--- | :--- |
| **vCPU** | 2 vCPUs (`e2-micro`, burstable) | Handles low-to-medium background jobs, webhooks, and REST APIs. |
| **Physical RAM** | 1.0 GB | Tuned with low-memory configuration to prevent starvation. |
| **Swap Memory** | 2.0 GB SSD swap (`/swapfile`) | **Total virtual memory = 3.0 GB.** Protects the OS from OOM crashes. |
| **Disk Storage** | 30 GB Standard Persistent Disk (`pd-standard`) | Always Free limit is 30 GB. Keep disk usage $\le$ 25 GB. |
| **Free Outbound Bandwidth** | 200 GB / month (Standard Network Tier) | Sufficient for millions of API payloads or web pages. Ingress is unlimited. |

---

## 2. Connecting to the Server

### Fast SSH (From Your Laptop)
Your local `~/.ssh/config` is pre-configured with the alias `gcp`:
```bash
ssh gcp
```

### Direct SSH (Without Config File)
```bash
ssh -i ~/.ssh/google_compute_engine san@35.211.34.4
```

### Google Cloud CLI (From Any Authenticated Machine)
```bash
~/google-cloud-sdk/bin/gcloud compute ssh server --project=gemini-dev-project-498118 --zone=us-east1-b
```

---

## 3. Recommended Web & Application Stacks

This server is suited for hosting lightweight production websites, APIs, background worker bots, and databases.

### Recommended Stack A: Modern LEMP (Nginx + PHP 8.3 + MariaDB)
```bash
# Install LEMP stack
sudo apt update && sudo apt install -y nginx mariadb-server php-fpm php-mysql php-curl php-json php-mbstring php-xml php-zip php-bcmath php-apcu git unzip certbot python3-certbot-nginx

# Optimize MariaDB memory footprint (Essential for 1 GB RAM)
sudo tee /etc/mysql/mariadb.conf.d/99-low-memory.cnf << 'EOF'
[mysqld]
performance_schema = OFF
innodb_buffer_pool_size = 64M
innodb_log_buffer_size = 8M
max_connections = 50
key_buffer_size = 16M
EOF
sudo systemctl restart mariadb
```

### Recommended Stack B: Node.js / Python / Go Apps
```bash
# Node.js LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2

# Python
sudo apt install -y python3-pip python3-venv
```
*Tip: Always use `pm2` or `systemd` services to manage Node.js or Python background processes.*

---

## 4. Hosting Multiple Projects / Domains on this Server

You can host multiple independent projects (e.g. `site1.com`, `api.site2.com`, `admin.site3.com`) on this single server using Nginx Virtual Hosts (Server Blocks).

### Directory Standard
Keep projects organized in `/var/www/`:
```bash
sudo mkdir -p /var/www/project-one.com
sudo mkdir -p /var/www/project-two.com
sudo chown -R $USER:www-data /var/www/
sudo chmod -R 775 /var/www/
```

### Deploying a New Domain
1. **Point DNS:** Add an `A` record pointing `yourdomain.com` to `35.211.34.4` in Cloudflare / Namecheap / GoDaddy.
2. **Create Nginx Config (`/etc/nginx/sites-available/yourdomain.com`):**
   ```nginx
   server {
       listen 80;
       server_name yourdomain.com www.yourdomain.com;
       root /var/www/yourdomain.com;
       index index.php index.html;

       location / {
           try_files $uri $uri/ /index.php?$args;
       }

       location ~ \.php$ {
           include snippets/fastcgi-php.conf;
           fastcgi_pass unix:/var/run/php/php8.3-fpm.sock;
       }

       location ~ /\.ht {
           deny all;
       }
   }
   ```
3. **Enable & Reload:**
   ```bash
   sudo ln -s /etc/nginx/sites-available/yourdomain.com /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   ```
4. **Issue Free SSL (Let's Encrypt):**
   ```bash
   sudo certbot --nginx -d yourdomain.com
   ```

---

## 5. Security & Firewall Rules

Google Cloud VPC Firewall is currently open for:
- **Port 22:** SSH
- **Port 80:** HTTP
- **Port 443:** HTTPS

### Opening a Custom Port (e.g., 3000, 8080, 5000)
If you run a custom application on port `3000`, open it via `gcloud`:
```bash
~/google-cloud-sdk/bin/gcloud compute firewall-rules create allow-port-3000 \
    --project=gemini-dev-project-498118 \
    --network=default \
    --allow=tcp:3000 \
    --source-ranges=0.0.0.0/0
```

---

## 6. Server Health & Monitoring Cheat Sheet

```bash
# Check memory & active swap
free -h

# Check available disk storage (keep pd-standard under 25 GB)
df -h /

# Real-time CPU, RAM, and process activity
top
# or install htop:
sudo apt install -y htop && htop

# View Nginx error logs
sudo tail -f /var/log/nginx/error.log

# View MariaDB status
sudo systemctl status mariadb
```

---

## 7. Important Rules to Keep This Server Permanently Free

1. **Do NOT increase disk size above 30 GB:** Google Cloud's free allowance covers up to 30 GB total across your project.
2. **Do NOT change disk type to Balanced or SSD:** It must stay `pd-standard` (Standard Persistent Disk).
3. **Do NOT add extra instances:** Always Free gives 1 instance of `e2-micro`. Creating a 2nd VM will bill hourly for the second one.
4. **Keep Network Tier as `STANDARD`:** Provides 200 GB/month free outbound traffic.
