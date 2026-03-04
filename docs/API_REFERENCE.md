# API Reference - Univen Intern Register System

## 1. Authentication (`/api/auth`)

### 1.1 Login
- **Endpoint**: `POST /api/auth/login`
- **Request Body**:
  ```json
  {
    "username": "user@univen.ac.za",
    "password": "Password123!"
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "token": "JWT_TOKEN_HERE",
    "user": {
      "id": 1,
      "username": "user@univen.ac.za",
      "email": "user@univen.ac.za",
      "role": "INTERN",
      "department": "ICT"
    }
  }
  ```

### 1.2 Registration
- **Endpoint**: `POST /api/auth/register`
- **Request Body**:
  ```json
  {
    "username": "newuser@univen.ac.za",
    "password": "Password123!",
    "verificationCode": "123456",
    "role": "INTERN",
    "name": "Thabiso",
    "surname": "Mulaudzi",
    "departmentId": 1
  }
  ```

### 1.3 Verification
- **Endpoint**: `POST /api/auth/send-verification-code`
- **Request Body**: `{"email": "user@univen.ac.za"}`
- **Endpoint**: `POST /api/auth/verify-code`
- **Request Body**: `{"email": "user@univen.ac.za", "code": "123456"}`

## 2. Attendance (`/api/attendance`)

### 2.1 Sign-In
- **Endpoint**: `POST /api/attendance/signin`
- **Headers**: `Authorization: Bearer <token>`
- **Request Body**:
  ```json
  {
    "internId": 1,
    "location": "Thohoyandou Main Campus",
    "latitude": -22.978,
    "longitude": 30.444
  }
  ```

### 2.2 Sign-Out
- **Endpoint**: `PUT /api/attendance/signout/{attendanceId}`
- **Headers**: `Authorization: Bearer <token>`
- **Request Body**: `{"location": "Optional", "latitude": 0.0, "longitude": 0.0}`

### 2.3 History
- **Endpoint**: `GET /api/attendance/intern/{internId}`
- **Response**: Array of attendance records.

## 3. Leave Requests (`/api/leave-requests`)

### 3.1 Submit Request
- **Endpoint**: `POST /api/leave-requests`
- **Request Body**:
  ```json
  {
    "internId": 1,
    "leaveType": "SICK_LEAVE",
    "startDate": "2024-03-01",
    "endDate": "2024-03-02",
    "reason": "Doctor appointment"
  }
  ```

### 3.2 Update Status (Supervisor/Admin)
- **Endpoint**: `PUT /api/leave-requests/{id}/status`
- **Request Body**: `{"status": "APPROVED", "reason": "Approved by supervisor"}`

## 4. Departments (`/api/departments`)
- **GET /api/departments**: List all departments (Public).
- **POST /api/departments**: Create new department (Admin).

## 5. Reports (`/api/reports`)
- **GET /api/reports/monthly**: Returns aggregated data for the current month.
- **GET /api/reports/export/pdf**: Generates and downloads a PDF report.
- **GET /api/reports/export/excel**: Generates and downloads an Excel report.
