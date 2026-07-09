# Univen Intern Register System

A comprehensive web-based platform for managing intern registration, attendance tracking, and leave requests at the University of Venda.

## 🚀 Overview
The Univen Intern Register System streamlines the administration of internship programs. It provides a secure, roles-based environment for interns, supervisors, and administrators to collaborate and maintain accurate records of work activities.

## 📚 Documentation
Detailed documentation is available in the `docs/` directory:
- [**SRS.md**](docs/SRS.md): System Requirements Specification and user roles.
- [**ARCHITECTURE.md**](docs/ARCHITECTURE.md): Technical design, tech stack, and data flow.
- [**API_REFERENCE.md**](docs/API_REFERENCE.md): Backend REST API endpoints and data structures.

## 🛠️ Tech Stack
- **Frontend**: Angular 20, Bootstrap 5, Leaflet.js, StompJS.
- **Backend**: Spring Boot 3.3.3, Java 17, Spring Security (JWT), MySQL.
- **Real-time**: WebSockets (STOMP).

## 📥 Getting Started

### Prerequisites
- Node.js (v18+)
- Java JDK 17
- MySQL 8.x
- Maven 3.x

### Backend Setup
1. Navigate to the backend directory.
2. Configure your database in `src/main/resources/application.properties`.
3. Run the application:
   ```bash
   mvn spring-boot:run
   ```

### Frontend Setup
1. Navigate to the frontend directory.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm start
   ```
4. Access the app at `http://localhost:4200`.

## 🔒 Security
The application uses JWT (JSON Web Tokens) for authentication. Tokens are stored securely on the client and verified for every request. The system also supports single-session control to ensure account integrity.

## 🗺️ Geolocation Verification
Interns must be within a predefined radius of authorized University locations to sign in. The system uses the browser's Geolocation API and verifies the coordinates against authorized centers on the server.
