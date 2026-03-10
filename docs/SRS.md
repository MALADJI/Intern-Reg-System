# System Requirements Specification (SRS) - Univen Intern Register System

## 1. Introduction
The Univen Intern Register System is a comprehensive platform designed to manage and track the registration, attendance, and leave requests of interns at the University of Venda.

## 2. Roles and User Profiles

### 2.1 Intern
- **Goal**: Register and maintain an accurate record of their internship activities.
- **Key Responsibilities**:
    - Account registration and login.
    - Daily sign-in and sign-out with geolocation verification.
    - Submission of leave requests.
    - Profile management (contact details, field of study, etc.).
    - Attendance history review.

### 2.2 Supervisor
- **Goal**: Monitor and approve the activities of interns under their supervision.
- **Key Responsibilities**:
    - Monitor intern attendance in real-time.
    - Review and approve/decline leave requests.
    - Generate attendance reports for their department.
    - Maintain communication with interns.

### 2.3 Admin
- **Goal**: Manage departmental resources and user accounts.
- **Key Responsibilities**:
    - Registration of Supervisors.
    - Departmental management (creating/editing departments).
    - Advanced reporting and data export (PDF/Excel).
    - Oversight of all interns within their primary department.

### 2.4 Super Admin (Strategic Admin)
- **Goal**: System-wide administration and configuration.
- **Key Responsibilities**:
    - Management of Admin accounts.
    - System-wide settings configuration.
    - Access to global reports and analytics.

## 3. Functional Requirements

### 3.1 Authentication and Authorization
- Secure JWT-based authentication.
- Role-based access control (RBAC) to restrict interface access based on user type.
- Account verification and password recovery mechanisms.

### 3.2 Attendance Management
- Geolocation-restricted sign-in to ensure interns are at authorized locations.
- Real-time attendance tracking via WebSockets.
- Support for digital signatures for attendance verification.

### 3.3 Leave Management
- Application workflow for various leave types.
- Multi-level approval/notification system.

### 3.4 Reporting and Analytics
- Generation of monthly attendance reports.
- Data export in Excel and PDF formats for compliance and archival.

## 4. Non-functional Requirements

### 4.1 Security
- Encrypted data transmission (TLS/SSL).
- Secure password hashing (BCrypt).
- Protection against unauthorized API access.

### 4.2 Performance
- Responsive user interface with sub-second response times for common actions.
- Scalable backend architecture to handle hundreds of concurrent users.

### 4.3 Usability
- Modern, intuitive UI design using Bootstrap and Vanilla CSS.
- Mobile-responsive layout for on-the-go access.
