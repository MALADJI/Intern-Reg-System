# Backend Updates for Department-Based Admin Filtering

This document outlines the backend changes required to support department-based filtering for admins created by super admins.

## Overview

When a super admin creates an admin and assigns them to a department, that admin should:
1. Only see interns from their assigned department
2. Only see supervisors from their assigned department
3. Only manage fields within their assigned department
4. Only see leave requests from interns in their department

## Required Backend Changes

### 1. Admin Entity/Model Updates

**Ensure the Admin entity includes `departmentId`:**
```java
@Entity
public class Admin {
    // ... existing fields ...
    
    @ManyToOne
    @JoinColumn(name = "department_id")
    private Department department;
    
    // OR if using departmentId directly:
    @Column(name = "department_id")
    private Long departmentId;
    
    // ... rest of fields ...
}
```

### 2. Authentication/Login Response Updates

**Update the login response to include `departmentId` for admins:**

When an admin logs in, the response should include:
```json
{
  "token": "...",
  "user": {
    "id": 1,
    "username": "admin@univen.ac.za",
    "email": "admin@univen.ac.za",
    "role": "ADMIN",
    "name": "Admin Name",
    "department": "ICT",
    "departmentId": 1,  // ← ADD THIS
    "field": null
  }
}
```

**Endpoint:** `POST /api/auth/login`

**Implementation:**
```java
@PostMapping("/login")
public ResponseEntity<LoginResponse> login(@RequestBody LoginRequest request) {
    // Authenticate user
    Authentication authentication = authenticationManager.authenticate(
        new UsernamePasswordAuthenticationToken(request.getEmail(), request.getPassword())
    );
    
    // Get user details
    UserDetails userDetails = (UserDetails) authentication.getPrincipal();
    User user = userRepository.findByEmail(request.getEmail())
        .orElseThrow(() -> new EntityNotFoundException("User not found"));
    
    // Generate token
    String token = jwtTokenProvider.generateToken(authentication);
    
    // Build user response
    UserResponse userResponse = new UserResponse();
    userResponse.setId(user.getId());
    userResponse.setUsername(user.getUsername());
    userResponse.setEmail(user.getEmail());
    userResponse.setRole(user.getRole());
    userResponse.setName(user.getName());
    
    // CRITICAL: If user is ADMIN, fetch department from Admin entity
    if (user.getRole() == Role.ADMIN) {
        Admin admin = adminRepository.findByUserId(user.getId())
            .orElse(null);
        
        if (admin != null && admin.getDepartment() != null) {
            // Set department name and ID from the actual Admin entity
            userResponse.setDepartment(admin.getDepartment().getName());
            userResponse.setDepartmentId(admin.getDepartment().getId());
        } else {
            // No department assigned
            userResponse.setDepartment(null);
            userResponse.setDepartmentId(null);
        }
    }
    
    LoginResponse response = new LoginResponse();
    response.setToken(token);
    response.setUser(userResponse);
    
    return ResponseEntity.ok(response);
}
```

**⚠️ CRITICAL:** 
- **DO NOT** hardcode or default to "ICT" or any other department
- **DO** fetch the actual department from the Admin entity in the database
- If admin has no department, return `null` for both `department` and `departmentId`
- The department must match what was saved when the admin was created

### 3. Intern Endpoints - Add Department Filtering

**Update:** `GET /api/interns`

**Current:** Returns all interns
**Updated:** Should accept optional `departmentId` query parameter

**Request:**
```
GET /api/interns?departmentId=1
```

**Response:** Only return interns where `intern.departmentId == departmentId`

**Implementation:**
```java
@GetMapping("/interns")
public ResponseEntity<List<InternResponse>> getAllInterns(
    @RequestParam(required = false) Long departmentId,
    Authentication authentication
) {
    // If user is ADMIN and has departmentId, filter by it
    if (authentication.getAuthorities().contains("ROLE_ADMIN")) {
        // Get admin's departmentId from authentication/user context
        Long adminDepartmentId = getAdminDepartmentId(authentication);
        if (adminDepartmentId != null) {
            // Force filter by admin's department (security)
            departmentId = adminDepartmentId;
        }
    }
    
    List<Intern> interns;
    if (departmentId != null) {
        interns = internService.findByDepartmentId(departmentId);
    } else {
        interns = internService.findAll();
    }
    
    return ResponseEntity.ok(interns.stream()
        .map(this::mapToInternResponse)
        .collect(Collectors.toList()));
}
```

### 4. Supervisor Endpoints - Add Department Filtering

**Update:** `GET /api/supervisors`

**Current:** Returns all supervisors
**Updated:** Should accept optional `departmentId` query parameter

**Request:**
```
GET /api/supervisors?departmentId=1
```

**Response:** Only return supervisors where `supervisor.departmentId == departmentId`

**Implementation:**
```java
@GetMapping("/supervisors")
public ResponseEntity<List<SupervisorResponse>> getAllSupervisors(
    @RequestParam(required = false) Long departmentId,
    Authentication authentication
) {
    // If user is ADMIN and has departmentId, filter by it
    if (authentication.getAuthorities().contains("ROLE_ADMIN")) {
        Long adminDepartmentId = getAdminDepartmentId(authentication);
        if (adminDepartmentId != null) {
            departmentId = adminDepartmentId;
        }
    }
    
    List<Supervisor> supervisors;
    if (departmentId != null) {
        supervisors = supervisorService.findByDepartmentId(departmentId);
    } else {
        supervisors = supervisorService.findAll();
    }
    
    return ResponseEntity.ok(supervisors.stream()
        .map(this::mapToSupervisorResponse)
        .collect(Collectors.toList()));
}
```

### 5. Leave Request Endpoints - Add Department Filtering

**Update:** `GET /api/leave`

**Current:** Returns all leave requests
**Updated:** Should accept optional `departmentId` query parameter

**Request:**
```
GET /api/leave?departmentId=1
```

**Response:** Only return leave requests from interns in the specified department

**Implementation:**
```java
@GetMapping("/leave")
public ResponseEntity<List<LeaveRequestResponse>> getAllLeaveRequests(
    @RequestParam(required = false) String status,
    @RequestParam(required = false) Long departmentId,
    Authentication authentication
) {
    // If user is ADMIN and has departmentId, filter by it
    if (authentication.getAuthorities().contains("ROLE_ADMIN")) {
        Long adminDepartmentId = getAdminDepartmentId(authentication);
        if (adminDepartmentId != null) {
            departmentId = adminDepartmentId;
        }
    }
    
    List<LeaveRequest> leaveRequests;
    if (departmentId != null) {
        // Filter by department - get interns in department, then their leave requests
        leaveRequests = leaveRequestService.findByDepartmentId(departmentId);
    } else if (status != null) {
        leaveRequests = leaveRequestService.findByStatus(status);
    } else {
        leaveRequests = leaveRequestService.findAll();
    }
    
    return ResponseEntity.ok(leaveRequests.stream()
        .map(this::mapToLeaveRequestResponse)
        .collect(Collectors.toList()));
}
```

### 6. Field Management Endpoints - Restrict to Admin's Department

**Update:** All field management endpoints should verify admin has access to the department

**Endpoints to secure:**
- `POST /api/departments/{departmentId}/fields` - Add field
- `PUT /api/departments/{departmentId}/fields/{fieldId}` - Update field
- `DELETE /api/departments/{departmentId}/fields/{fieldId}` - Delete field
- `PUT /api/departments/{departmentId}/fields/{fieldId}/deactivate` - Deactivate field
- `PUT /api/departments/{departmentId}/fields/{fieldId}/activate` - Activate field

**Implementation:**
```java
@PostMapping("/departments/{departmentId}/fields")
public ResponseEntity<DepartmentResponse> addField(
    @PathVariable Long departmentId,
    @RequestBody FieldRequest request,
    Authentication authentication
) {
    // Verify admin has access to this department
    if (authentication.getAuthorities().contains("ROLE_ADMIN")) {
        Long adminDepartmentId = getAdminDepartmentId(authentication);
        if (adminDepartmentId != null && !adminDepartmentId.equals(departmentId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(null); // Admin can only manage their own department
        }
    }
    
    // Proceed with field creation
    Department department = departmentService.addField(departmentId, request.getName());
    return ResponseEntity.ok(mapToDepartmentResponse(department));
}
```

### 7. Helper Method to Get Admin Department ID

**Add this helper method to your controller or service:**

```java
private Long getAdminDepartmentId(Authentication authentication) {
    if (authentication == null || authentication.getPrincipal() == null) {
        return null;
    }
    
    // Get user details from authentication
    UserDetails userDetails = (UserDetails) authentication.getPrincipal();
    String username = userDetails.getUsername();
    
    // Find admin by username/email
    Admin admin = adminRepository.findByEmail(username)
        .orElse(null);
    
    if (admin == null) {
        return null;
    }
    
    // Return department ID
    return admin.getDepartment() != null 
        ? admin.getDepartment().getId() 
        : (admin.getDepartmentId() != null ? admin.getDepartmentId() : null);
}
```

### 8. Super Admin Admin Creation - Ensure Department Assignment

**⚠️ CRITICAL FIX:** This is the main issue causing admins to show wrong departments!

**Update:** `POST /api/super-admin/admins`

**Ensure:** When creating an admin, the `departmentId` is properly saved to the database

**Request Body:**
```json
{
  "name": "Admin Name",
  "email": "admin@univen.ac.za",
  "password": "password123",
  "departmentId": 1  // ← CRITICAL: This MUST be saved to the admin table
}
```

**Response:** Should include `departmentId` and `departmentName` in the response

```json
{
  "adminId": 1,
  "userId": 1,
  "name": "Admin Name",
  "email": "admin@univen.ac.za",
  "departmentId": 1,
  "departmentName": "HR",  // ← Must match the actual department name
  "createdAt": "2024-01-01T00:00:00",
  "active": true
}
```

**Implementation:**
```java
@PostMapping("/admins")
public ResponseEntity<AdminResponse> createAdmin(@RequestBody CreateAdminRequest request) {
    // Create admin entity
    Admin admin = new Admin();
    admin.setName(request.getName());
    admin.setEmail(request.getEmail());
    // ... set other fields ...
    
    // CRITICAL: Save departmentId if provided
    if (request.getDepartmentId() != null) {
        Department department = departmentRepository.findById(request.getDepartmentId())
            .orElseThrow(() -> new EntityNotFoundException("Department not found"));
        admin.setDepartment(department);
        // OR if using departmentId directly:
        // admin.setDepartmentId(request.getDepartmentId());
    }
    
    Admin savedAdmin = adminRepository.save(admin);
    
    // Build response with department info
    AdminResponse response = new AdminResponse();
    response.setAdminId(savedAdmin.getId());
    response.setName(savedAdmin.getName());
    response.setEmail(savedAdmin.getEmail());
    
    // CRITICAL: Include department info in response
    if (savedAdmin.getDepartment() != null) {
        response.setDepartmentId(savedAdmin.getDepartment().getId());
        response.setDepartmentName(savedAdmin.getDepartment().getName());
    }
    
    return ResponseEntity.ok(response);
}
```

**Common Issues:**
- ❌ **NOT saving departmentId** - The departmentId is received but not persisted to database
- ❌ **Wrong department in login response** - Login returns hardcoded or default department instead of actual assigned department
- ❌ **Department not loaded from database** - When building login response, department is not fetched from Admin entity

## Security Considerations

1. **Always verify department access on the backend** - Don't rely solely on frontend filtering
2. **For ADMIN role, automatically filter by their department** - Even if they don't pass `departmentId`, restrict to their department
3. **For SUPER_ADMIN role, allow access to all departments** - No filtering
4. **Validate department ownership** - When admins try to modify fields, verify they own that department

## Database Migration

If the `department_id` column doesn't exist in the `admin` table:

```sql
ALTER TABLE admin 
ADD COLUMN department_id BIGINT NULL,
ADD CONSTRAINT fk_admin_department 
    FOREIGN KEY (department_id) 
    REFERENCES department(department_id);
```

## Testing Checklist

- [ ] Admin with department can only see interns from their department
- [ ] Admin with department can only see supervisors from their department
- [ ] Admin with department can only see leave requests from their department
- [ ] Admin can only manage fields in their assigned department
- [ ] Admin cannot access other departments' data
- [ ] Super admin can still see all data (no filtering)
- [ ] Login response includes `departmentId` for admins
- [ ] Admin creation by super admin properly assigns department

## API Endpoint Summary

| Endpoint | Method | New Parameter | Description |
|----------|--------|---------------|-------------|
| `/api/interns` | GET | `departmentId` (optional) | Filter interns by department |
| `/api/supervisors` | GET | `departmentId` (optional) | Filter supervisors by department |
| `/api/leave` | GET | `departmentId` (optional) | Filter leave requests by department |
| `/api/departments/{id}/fields` | POST/PUT/DELETE | - | Verify admin owns department |
| `/api/auth/login` | POST | - | Include `departmentId` in response |
| `/api/super-admin/admins` | POST | `departmentId` in body | Save department assignment |

## Notes

- All filtering should be done on the backend for security
- Frontend filtering is a secondary layer but backend is the source of truth
- Admins without a department assigned should see empty results (or handle gracefully)
- Consider adding a migration script to assign existing admins to departments if needed

