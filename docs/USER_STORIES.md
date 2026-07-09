# User Stories - Univen Intern Register System

This document outlines the user stories for the Intern Register System, categorized by user role. Each story follows the standard format: **"As a [role], I want to [feature], so that [benefit]."**

## 1. Epic: Authentication & Profile Management

### 1.1 Intern
- **US-1.1**: As an **Intern**, I want to **register an account using my university email**, so that I can access the system securely.
- **US-1.2**: As an **Intern**, I want to **login with my credentials**, so that I can view my dashboard and record my attendance.
- **US-1.3**: As an **Intern**, I want to **reset my password via email verification**, so that I can recover my account if I forget my credentials.
- **US-1.4**: As an **Intern**, I want to **view my profile details (Department, Supervisor, Contract End Date)**, so that I can verify my employment information is correct.

### 1.2 Supervisor
- **US-1.5**: As a **Supervisor**, I want to **be automatically linked to my department**, so that I can manage the correct group of interns.

### 1.3 Admin
- **US-1.6**: As an **Admin**, I want to **manage user accounts (deactivate/activate)**, so that I can secure the system when staff members leave.

### 1.4 Super Admin (Strategic Admin)
- **US-1.7**: As a **Super Admin**, I want to **register and manage Admin accounts**, so that I can delegate departmental responsibilities.
- **US-1.8**: As a **Super Admin**, I want to **configure system-wide settings (e.g., global leave policies)**, so that the system adapts to university regulations.

## 2. Epic: Attendance Management (The Digital Logbook)

### 2.1 Intern
- **US-2.1**: As an **Intern**, I want to **sign in daily using my device**, so that my attendance is recorded.
- **US-2.2**: As an **Intern**, I want to **have my GPS location automatically verified**, so that I can prove I am physically at the workplace.
- **US-2.3**: As an **Intern**, I want to **sign out at the end of the day**, so that my total hours worked are calculated correctly.
- **US-2.4**: As an **Intern**, I want to **digitally sign my attendance record**, so that it is valid for payroll processing.
- **US-2.5**: As an **Intern**, I want to **view my attendance history**, so that I can keep track of my working days.

### 2.2 Supervisor
- **US-2.6**: As a **Supervisor**, I want to **receive real-time notifications when my interns sign in**, so that I know who is present.
- **US-2.7**: As a **Supervisor**, I want to **view a list of all present interns today**, so that I can monitor daily operations.
- **US-2.8**: As a **Supervisor**, I want to **view the location map of where an intern signed in**, so that I can verify they are at the correct site.

## 3. Epic: Leave Management

### 3.1 Intern
- **US-3.1**: As an **Intern**, I want to **submit a leave request (Sick, Study, Annual, Family)**, so that I can get approval for my absence.
- **US-3.2**: As an **Intern**, I want to **attach supporting documents (e.g., medical certificates)**, so that I can provide evidence for my leave.
- **US-3.3**: As an **Intern**, I want to **view the status of my leave requests**, so that I know if they have been approved or declined.

### 3.2 Supervisor
- **US-3.4**: As a **Supervisor**, I want to **view pending leave requests**, so that I can take action on them.
- **US-3.5**: As a **Supervisor**, I want to **approve or decline leave requests**, so that the intern's record is updated.
- **US-3.6**: As a **Supervisor**, I want to **add a comment when declining leave**, so that the intern understands the reason.

## 4. Epic: Reporting & Analytics

### 4.1 Supervisor
- **US-4.1**: As a **Supervisor**, I want to **generate a monthly timesheet for an intern**, so that I can sign it off for stipend payment.
- **US-4.2**: As a **Supervisor**, I want to **download reports in PDF format**, so that they can be printed and filed.

### 4.2 Admin
- **US-4.3**: As an **Admin**, I want to **view a dashboard of total interns per department**, so that I can monitor the distribution of resources.
- **US-4.4**: As an **Admin**, I want to **export all attendance data to Excel**, so that I can perform further analysis or import it into the payroll system.

### 4.3 Super Admin
- **US-4.5**: As a **Super Admin**, I want to **view global system analytics (e.g., total users across all departments)**, so that I can track overall system adoption.
- **US-4.6**: As a **Super Admin**, I want to **audit system logs**, so that I can investigate security incidents or data discrepancies.
