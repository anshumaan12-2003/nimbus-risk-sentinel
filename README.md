# 🌩️ Nimbus Risk Sentinel

> *"See the risk before the breach."*

**Cloud Security Posture Management (CSPM) Platform** — Real-time AWS misconfiguration detection, blast radius visualization, and AI-powered one-click remediation.

![License](https://img.shields.io/badge/License-MIT-blue.svg)
![React](https://img.shields.io/badge/Frontend-React%20%7C%20Vite-61DAFB?logo=react&logoColor=white)
![FastAPI](https://img.shields.io/badge/Backend-FastAPI%20%7C%20Python-009688?logo=fastapi&logoColor=white)
![Generative AI](https://img.shields.io/badge/Intelligence-Google%20Gemini-4285F4?logo=google&logoColor=white)

---

## ✨ Features

- **Live Cloud Scanning:** Dynamically fetches and analyzes actual AWS configurations (S3, IAM, EC2, RDS) using asynchronous background tasks.
- **AI Security Copilot:** Powered by Google Gemini, the built-in AI analyst translates complex cloud vulnerabilities into business risk and generates exact AWS CLI/Terraform remediation scripts.
- **Real-Time Telemetry:** Fast, seamless UI updates powered by WebSockets to stream audit logs and scan progress live.
- **Shift-Left CI/CD CLI:** Includes a native developer CLI tool (`nimbus-cli`) to scan Terraform infrastructure locally before code is even committed.
- **Zero-Trust Blast Radius Engine:** Graph-based risk calculation to determine exactly what resources are compromised in the event of a breach.

---

## 🚀 Quick Start

### 1. Clone & Configure
```bash
git clone https://github.com/your-username/nimbus-risk-sentinel
cd nimbus-risk-sentinel

# Copy the environment template
cp .env.example .env

# Open .env and add your AWS Credentials & Gemini API Key
```

### 2. Start Everything (Docker)
The easiest way to run the entire stack (Postgres, Redis, FastAPI, Celery, React):
```bash
docker-compose up -d --build
```

### 3. Access the Platform
| Service     | URL                          |
|-------------|------------------------------|
| Dashboard   | http://localhost:3000        |
| Backend API | http://localhost:8000        |
| API Docs    | http://localhost:8000/docs   |

---

## 🛠️ Developer CLI Tool

Nimbus includes a powerful local CLI tool for developers to run static analysis on their Infrastructure as Code (IaC) before deploying.

```bash
# Make it executable
chmod +x cli/nimbus_cli.py

# Run a local scan on your Terraform directory
python cli/nimbus_cli.py scan iac ./infrastructure/terraform
```
*If a `CRITICAL` vulnerability is detected, the CLI automatically blocks the build pipeline.*

---

## 🏗️ Architecture

- **Frontend:** React 18, Vite, Lucide Icons, Recharts (Modern Glassmorphism UI)
- **Backend:** Python 3.11, FastAPI, SQLAlchemy, Alembic
- **Intelligence:** `google-genai` (Gemini Flash Model)
- **Background Jobs:** Native FastAPI `BackgroundTasks` (with Celery/Redis failover support)
- **Database:** SQLite (local dev) / PostgreSQL (production)

---

## 🔍 Supported Scan Engines

| Service | Rules |
|---------|-------|
| **S3**  | Public access block, encryption, versioning, logging, public policy |
| **IAM** | Root MFA, user MFA, admin permissions, old access keys, inactive users |
| **EC2** | Open SSH/RDP, unencrypted EBS volumes, public instances |
| **RDS** | Public accessibility, encryption, backups, default usernames |
| **IaC** | Terraform HCL static analysis (`tfsec` / custom rules engine) |
