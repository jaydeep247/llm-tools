# 🚀 Deployment Guide

This guide covers deploying Contentlytics to production environments.

---

## 📋 Prerequisites

### System Requirements
- **OS**: Ubuntu 20.04+ / CentOS 8+ / Windows Server 2019+
- **RAM**: Minimum 4GB (8GB+ recommended)
- **CPU**: 2+ cores (4+ recommended)
- **Disk**: 20GB+ free space
- **Network**: Stable internet connection

### Software Requirements
- **Node.js**: 18.x or higher
- **Python**: 3.8 or higher
- **PostgreSQL**: 12.x or higher
- **Redis**: 6.x or higher (optional, for SEO queue)
- **Nginx**: Latest stable (for reverse proxy)
- **PM2**: Latest (for process management)

---

## 🔧 Production Setup

### 1. Server Preparation

#### Update System
```bash
sudo apt update && sudo apt upgrade -y
```

#### Install Node.js
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
```

#### Install Python
```bash
sudo apt install -y python3 python3-pip python3-venv
```

#### Install PostgreSQL
```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

#### Install Redis (Optional)
```bash
sudo apt install -y redis-server
sudo systemctl start redis
sudo systemctl enable redis
```

#### Install Nginx
```bash
sudo apt install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

---

### 2. Database Setup

#### Create Database and User
```bash
sudo -u postgres psql

CREATE DATABASE contentlytics;
CREATE USER contentlytics_user WITH ENCRYPTED PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE contentlytics TO contentlytics_user;
\q
```

#### Run Migrations
```bash
cd /path/to/contentlytics
npm run db:init
```

---

### 3. Application Deployment

#### Clone Repository
```bash
cd /var/www
git clone <your-repo-url> contentlytics
cd contentlytics
```

#### Install Dependencies
```bash
# Node.js dependencies
npm install --production

# Python dependencies
cd aeo-api
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
deactivate
cd ..
```

#### Configure Environment Variables

**Create `.env` file:**
```bash
cp .env.example .env
nano .env
```

**Update with production values:**
```bash
# Server
PORT=3004
NODE_ENV=production
CORS_ORIGIN=https://yourdomain.com

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=contentlytics
DB_USER=contentlytics_user
DB_PASSWORD=your_secure_password

# Authentication
JWT_SECRET=$(openssl rand -base64 32)
JWT_REFRESH_SECRET=$(openssl rand -base64 32)

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
MAIL_FROM=noreply@yourdomain.com

# APIs
PSI_API_KEY=your_google_psi_key
PY_API_BASE=http://localhost:8001
```

**Create `aeo-api/.env` file:**
```bash
cp aeo-api/.env.example aeo-api/.env
nano aeo-api/.env
```

---

### 4. Build Application

```bash
# Build TypeScript
npm run build

# Build frontend (if separate)
npm run build:frontend
```

---

### 5. Process Management with PM2

#### Install PM2
```bash
sudo npm install -g pm2
```

#### Create PM2 Ecosystem File
```bash
nano ecosystem.config.js
```

**Add configuration:**
```javascript
module.exports = {
  apps: [
    {
      name: 'contentlytics-server',
      script: 'dist/server.js',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3004
      },
      error_file: 'logs/server-error.log',
      out_file: 'logs/server-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: 'aeo-api',
      script: 'aeo-api/venv/bin/uvicorn',
      args: 'app.main:app --host 0.0.0.0 --port 8001',
      interpreter: 'none',
      env: {
        PYTHONPATH: '/var/www/contentlytics/aeo-api'
      },
      error_file: 'logs/aeo-error.log',
      out_file: 'logs/aeo-out.log'
    }
  ]
};
```

#### Start Applications
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

---

### 6. Nginx Configuration

#### Create Nginx Config
```bash
sudo nano /etc/nginx/sites-available/contentlytics
```

**Add configuration:**
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Main application
    location / {
        proxy_pass http://localhost:3004;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # AEO API
    location /aeo/ {
        proxy_pass http://localhost:8001/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # SSE endpoint
    location /events {
        proxy_pass http://localhost:3004/events;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;
    }

    # Static files
    location /static/ {
        alias /var/www/contentlytics/dist-frontend/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

#### Enable Site
```bash
sudo ln -s /etc/nginx/sites-available/contentlytics /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

### 7. SSL Certificate (Let's Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

---

## 🔒 Security Hardening

### Firewall Configuration
```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### PostgreSQL Security
```bash
sudo nano /etc/postgresql/12/main/pg_hba.conf
# Change: local all all peer
# To: local all all md5
sudo systemctl restart postgresql
```

### Disable Root SSH
```bash
sudo nano /etc/ssh/sshd_config
# Set: PermitRootLogin no
sudo systemctl restart sshd
```

---

## 📊 Monitoring

### PM2 Monitoring
```bash
pm2 monit
pm2 logs
pm2 status
```

### Application Logs
```bash
tail -f logs/server-out.log
tail -f logs/aeo-out.log
```

### Database Monitoring
```bash
sudo -u postgres psql -d contentlytics -c "SELECT * FROM pg_stat_activity;"
```

---

## 🔄 Updates & Maintenance

### Update Application
```bash
cd /var/www/contentlytics
git pull origin main
npm install --production
npm run build
pm2 restart all
```

### Database Backup
```bash
pg_dump -U contentlytics_user contentlytics > backup_$(date +%Y%m%d).sql
```

### Database Restore
```bash
psql -U contentlytics_user contentlytics < backup_20260101.sql
```

---

## 🆘 Troubleshooting

### Application Won't Start
```bash
# Check logs
pm2 logs

# Check environment variables
cat .env

# Check database connection
psql -U contentlytics_user -d contentlytics -h localhost
```

### High Memory Usage
```bash
# Restart PM2 processes
pm2 restart all

# Check memory
free -h
pm2 monit
```

### Database Connection Issues
```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Check connections
sudo -u postgres psql -c "SELECT count(*) FROM pg_stat_activity;"
```

**Last Updated:** 2026-01-01
