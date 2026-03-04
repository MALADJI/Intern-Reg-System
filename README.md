# 🎓 Intern Register System — Frontend

A modern Angular web application for managing university internship programs. It provides role-based dashboards for **Interns**, **Supervisors**, **Admins**, and **Super Admins**, with features like attendance tracking, leave management, real-time notifications, and report generation.

---

## 📋 Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Available Scripts](#available-scripts)
- [User Roles](#user-roles)
- [Environment & Backend](#environment--backend)

---

## ✨ Features

- 🔐 **Authentication** — Login, forgot password, and reset password flows
- 📊 **Role-Based Dashboards** — Separate dashboards for Intern, Supervisor, Admin, and Super Admin
- 🕐 **Attendance Tracking** — Digital sign-in/sign-out with real-time status updates
- 📝 **Leave Management** — Interns submit leave requests; supervisors/admins approve or decline
- 🔔 **Real-Time Notifications** — WebSocket-powered chat and push notifications via STOMP/SockJS
- 📄 **Report Generation** — Export reports as PDF or Excel (XLSX)
- 🗺️ **Location Services** — Leaflet map integration for location-aware features
- ✍️ **Digital Signatures** — Signature pad support for sign-off workflows
- 👤 **Profile Management** — Update personal info and change password

---

## 🛠️ Tech Stack

| Technology | Version | Purpose |
|---|---|---|
| **Angular** | ^20.3.0 | Core frontend framework |
| **TypeScript** | ~5.9.2 | Type-safe development |
| **Bootstrap** | ^5.3.8 | UI components & layout |
| **Bootstrap Icons** | ^1.13.1 | Icon library |
| **RxJS** | ~7.8.0 | Reactive state & async operations |
| **@stomp/stompjs** | ^7.2.1 | WebSocket messaging (STOMP protocol) |
| **SockJS Client** | ^1.6.1 | WebSocket fallback transport |
| **Leaflet** | ^1.9.4 | Interactive maps |
| **jsPDF** | ^3.0.3 | PDF report generation |
| **jspdf-autotable** | ^5.0.2 | Table-format PDF exports |
| **XLSX** | ^0.18.5 | Excel report generation |
| **SweetAlert2** | ^11.26.3 | Beautiful alert dialogs |
| **Signature Pad** | ^5.1.1 | Digital signature capture |

---

## 📁 Project Structure

```
src/
├── app/
│   ├── admin/                  # Admin dashboard module
│   ├── auth/                   # Login, forgot & reset password
│   │   ├── login/
│   │   ├── forgot-password/
│   │   └── reset-password/
│   ├── guards/                 # Auth & role-based route guards
│   ├── intern/                 # Intern dashboard module
│   ├── profile/                # User profile & settings
│   ├── services/               # All API & business logic services
│   │   ├── auth.service.ts
│   │   ├── attendance.service.ts
│   │   ├── leave-request.service.ts
│   │   ├── notification.service.ts
│   │   ├── websocket.service.ts
│   │   └── ...
│   ├── shared/                 # Shared components (navbar, footer, loading)
│   ├── sign-up/                # Intern registration
│   ├── super-admin/            # Super Admin dashboard module
│   └── supervisor/             # Supervisor dashboard module
├── assets/                     # Images and static assets
├── index.html
├── main.ts
└── styles.css
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** v18+ ([nodejs.org](https://nodejs.org))
- **npm** v9+
- **Angular CLI** v20+

```bash
npm install -g @angular/cli
```

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/MALADJI/Intern-Reg-System.git
cd Intern-Reg-System

# 2. Switch to the frontend branch
git checkout front-end

# 3. Install dependencies
npm install

# 4. Start the development server
npm start
```

The app will be available at **http://localhost:4200**

> ⚠️ The backend API must be running for the app to function. See [Environment & Backend](#environment--backend).

---

## 📜 Available Scripts

| Command | Description |
|---|---|
| `npm start` | Start dev server on `0.0.0.0:4200` (LAN accessible) |
| `npm run build` | Build for production (output in `dist/`) |
| `npm test` | Run unit tests via Karma |
| `npm run watch` | Build in watch mode for development |

---

## 👥 User Roles

| Role | Access |
|---|---|
| **Intern** | View own attendance, submit leave requests, sign in/out, view notifications |
| **Supervisor** | Monitor assigned interns, approve/decline leave requests, view reports |
| **Admin** | Manage interns & supervisors within a department, generate reports |
| **Super Admin** | Full system access — manage all departments, admins, and system settings |

---

## 🌐 Environment & Backend

This frontend connects to a **Spring Boot** REST API backend via HTTP and WebSocket.

By default, the API base URL is configured in the service files (e.g., `src/app/services/api.service.ts`).

Make sure the backend is running and accessible before starting the frontend. Update the API URL in the service files if your backend runs on a different host or port.

---

## 📄 License

This project was developed as part of a university internship programme at the **University of Venda (UNIVEN)**.

---

*Built with ❤️ by the Intern Register System team.*
