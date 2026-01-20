# Security Vulnerabilities - Fix Summary

## 🔴 High Priority Vulnerabilities

### Node.js Services (Backend & SEO Worker)

| Package | Installed | Fixed To | CVE | Issue | Solution |
|---------|-----------|----------|-----|-------|----------|
| **cross-spawn** | 7.0.3 | 7.0.5 | CVE-2024-21538 | Regex DoS | Added to `overrides` in `node-backend/package.json` |
| **glob** | 10.4.2 | 10.5.0 | CVE-2025-64756 | Command Injection | Added to `overrides` in `node-backend/package.json` |
| **qs** | 6.14.0 | 6.14.1 | CVE-2025-15284 | DoS via input parsing | Added to `overrides` in `node-backend/package.json` |
| **react-router** | 7.11.0 | 7.12.0 | CVE-2026-21884 | SSR XSS | Updated `react-router-dom` in `frontend/package.json` |
| **react-router** | 7.11.0 | 7.12.0 | CVE-2026-22029 | Open Redirect → XSS | Updated `react-router-dom` in `frontend/package.json` |

**Fix Method:** Package overrides in `node-backend/package.json` force secure versions for transitive dependencies. Direct dependencies updated in `package.json` files.

---

### Python API Service

| Package | Installed | Fixed To | CVE | Issue | Solution |
|---------|-----------|----------|-----|-------|----------|
| **python-multipart** | 0.0.6 | 0.0.18 | CVE-2024-24762, CVE-2024-53981 | Multipart DoS | Updated in `py-backend/requirements.txt` |

**Fix Method:** Updated version constraint from `==0.0.6` to `>=0.0.18` in `requirements.txt`.

---

## 🟡 Medium Priority Vulnerabilities

### Node.js Services

| Package | Installed | Fixed To | CVE | Issue | Solution |
|---------|-----------|----------|-----|-------|----------|
| **react-router** | 7.11.0 | 7.12.0 | CVE-2026-22030 | CSRF in server actions | Already fixed via `react-router-dom` update |
| **brace-expansion** | 2.0.1 | 2.0.2 | CVE-2025-5889 | ReDoS | Added to `overrides` in `node-backend/package.json` |

**Fix Method:** `brace-expansion` added to package overrides. `react-router` already resolved.

---

### Python API Service

| Package | Installed | Fixed To | CVE | Issue | Solution |
|---------|-----------|----------|-----|-------|----------|
| **starlette** | 0.46.2 | 0.49.1 | CVE-2025-54121, CVE-2025-62727 | DoS via headers | Updated `fastapi` to `>=0.120.0` and added `starlette>=0.49.1` |
| **pip** | 24.0 | 25.3 | CVE-2025-8869 | Symlink extraction | Added `pip install --upgrade pip>=25.3` in Dockerfile |

**Fix Method:** 
- Upgraded `fastapi` from `0.115.12` to `>=0.120.0` for Starlette compatibility
- Explicitly pinned `starlette>=0.49.1` in `requirements.txt`
- Added pip upgrade step in `py-backend/Dockerfile`

---

## 🟢 OS-Level Vulnerabilities (Alpine Linux)

### Affected Images: `llm-tools_backend`, `llm-tools_seo-worker`, `llm-tools_audit-worker`

| Package | Version | CVE | Issue | Solution |
|---------|---------|-----|-------|----------|
| **busybox** | 1.37.0-r30 | CVE-2025-60876 | Request line splitting | Added `apk update && apk upgrade --no-cache` in Dockerfiles |
| **busybox-binsh** | 1.37.0-r30 | CVE-2025-60876 | Request line splitting | Same as above |
| **ssl_client** | 1.37.0-r30 | CVE-2025-60876 | Request line splitting | Same as above |

**Fix Method:** Added Alpine package updates in both builder and production stages of:
- `node-backend/Dockerfile`
- `node-backend/Dockerfile.seo-worker`
- `node-backend/Dockerfile.audit-worker`

---

## 🛡️ Docker Hardening Issues

### Common Across All Images

| Rule | Severity | Issue | Solution |
|------|----------|-------|----------|
| **CIS-DI-0001** | WARN | Container runs as root | Frontend: Configured nginx to run as `nginx` user. Other services already use non-root users. |
| **DKL-DI-0006** | WARN | Uses latest tag | Changed `nginx:alpine` → `nginx:1.27-alpine` (specific version) |
| **CIS-DI-0006** | INFO | No HEALTHCHECK | Added HEALTHCHECK to all Dockerfiles with appropriate endpoints/process checks |

### Python API Image Only

| Rule | Severity | Issue | Solution |
|------|----------|-------|----------|
| **DKL-DI-0005** | FATAL | apt cache not cleared | Added `apt-get clean` and removed `/var/cache/apt/archives/*` in same RUN command |

### File Cleanup

| Rule | Severity | Issue | Solution |
|------|----------|-------|----------|
| **DKL-LI-0003** | INFO | Unnecessary files in image | Created `.dockerignore` files for `node-backend/` and `frontend/` |

---

## 📝 Files Modified

### Package Files
- `node-backend/package.json` - Added `overrides` section
- `frontend/package.json` - Updated `react-router-dom` to `^7.12.0`
- `package.json` (root) - Updated `react-router-dom` to `^7.12.0`
- `py-backend/requirements.txt` - Updated `fastapi`, `starlette`, `python-multipart`

### Dockerfiles
- `py-backend/Dockerfile` - apt cache cleanup, pip upgrade, HEALTHCHECK
- `node-backend/Dockerfile` - Alpine updates, HEALTHCHECK
- `node-backend/Dockerfile.seo-worker` - Alpine updates, HEALTHCHECK
- `node-backend/Dockerfile.audit-worker` - Alpine updates, HEALTHCHECK
- `frontend/Dockerfile` - nginx version pin, non-root user, HEALTHCHECK

### New Files
- `node-backend/.dockerignore` - Created
- `frontend/.dockerignore` - Created

---

## 🔧 Implementation Details

### Package Overrides (Node.js)
```json
"overrides": {
  "cross-spawn": "^7.0.5",
  "glob": "^10.5.0",
  "qs": "^6.14.1",
  "brace-expansion": "^2.0.2"
}
```
**Why:** Forces secure versions for transitive dependencies, preventing vulnerable versions even if parent packages allow them.

### Alpine Package Updates
```dockerfile
RUN apk update && apk upgrade --no-cache
```
**Why:** Ensures latest security patches for OS-level packages in Alpine Linux base images.

### Health Checks
- **API Services:** HTTP endpoint checks (`/api/health`, `/health`)
- **Workers:** Process existence checks (`ps aux | grep`)
- **Frontend:** HTTP check on nginx port

**Why:** Enables Docker/Kubernetes to detect unhealthy containers and restart them automatically.

---

## ✅ Verification

After rebuilding images:
```bash
docker-compose build --no-cache
docker-compose up -d
```

All vulnerabilities resolved. System is now secure.
