# Backend Implementation: Supervisor Password Update

## Overview
The frontend now sends password updates when editing supervisor details. The backend needs to handle password updates in the `PUT /api/supervisors/{id}` endpoint.

## Current Frontend Implementation

### What the Frontend Sends
When updating a supervisor, the frontend sends a PUT request to `/api/supervisors/{id}` with the following data structure:

```json
{
  "name": "Supervisor Name",
  "email": "supervisor@univen.ac.za",
  "departmentId": 1,
  "field": "Field Name",
  "password": "newPassword123"  // ✅ Only included if user wants to change password
}
```

**Important Notes:**
- `password` is **optional** - only sent if the admin enters a new password
- If `password` is not included in the request, the current password should remain unchanged
- Password is sent in **plain text** from frontend (must be hashed on backend)

## Required Backend Changes

### 1. Update Supervisor DTO/Request Class

Add `password` field to the supervisor update DTO:

**Java Example:**
```java
public class SupervisorUpdateRequest {
    private String name;
    private String email;
    private Long departmentId;
    private String field;
    private String password;  // ✅ Add this field
    
    // Getters and setters
    public String getPassword() {
        return password;
    }
    
    public void setPassword(String password) {
        this.password = password;
    }
}
```

### 2. Update Supervisor Controller

Modify the `PUT /api/supervisors/{id}` endpoint to handle password updates:

**Java Example:**
```java
@PutMapping("/{id}")
public ResponseEntity<SupervisorResponse> updateSupervisor(
        @PathVariable Long id,
        @RequestBody SupervisorUpdateRequest request,
        Authentication authentication) {
    
    // Get supervisor from database
    Supervisor supervisor = supervisorRepository.findById(id)
        .orElseThrow(() -> new ResourceNotFoundException("Supervisor not found"));
    
    // Update basic fields
    if (request.getName() != null) {
        supervisor.setName(request.getName());
    }
    if (request.getEmail() != null) {
        supervisor.setEmail(request.getEmail());
    }
    if (request.getDepartmentId() != null) {
        Department department = departmentRepository.findById(request.getDepartmentId())
            .orElseThrow(() -> new ResourceNotFoundException("Department not found"));
        supervisor.setDepartment(department);
    }
    if (request.getField() != null) {
        supervisor.setField(request.getField());
    }
    
    // ✅ Handle password update (only if provided)
    if (request.getPassword() != null && !request.getPassword().trim().isEmpty()) {
        // Hash the password before saving
        String hashedPassword = passwordEncoder.encode(request.getPassword());
        supervisor.setPassword(hashedPassword);
    }
    
    // Save updated supervisor
    Supervisor updatedSupervisor = supervisorRepository.save(supervisor);
    
    // Convert to response DTO
    SupervisorResponse response = convertToResponse(updatedSupervisor);
    
    return ResponseEntity.ok(response);
}
```

### 3. Password Hashing

**Important:** Always hash passwords before saving to the database!

**Java Example (using BCryptPasswordEncoder):**
```java
@Autowired
private PasswordEncoder passwordEncoder;

// In your update method:
if (request.getPassword() != null && !request.getPassword().trim().isEmpty()) {
    String hashedPassword = passwordEncoder.encode(request.getPassword());
    supervisor.setPassword(hashedPassword);
}
```

### 4. Validation

Add validation to ensure password meets requirements:

**Java Example:**
```java
if (request.getPassword() != null && !request.getPassword().trim().isEmpty()) {
    // Validate password length (frontend already checks, but backend should too)
    if (request.getPassword().length() < 6) {
        throw new BadRequestException("Password must be at least 6 characters long");
    }
    
    // Hash and save
    String hashedPassword = passwordEncoder.encode(request.getPassword());
    supervisor.setPassword(hashedPassword);
}
```

## Database Schema

Ensure the `supervisors` table has a `password` column:

```sql
ALTER TABLE supervisors 
ADD COLUMN password VARCHAR(255) NOT NULL DEFAULT '' 
AFTER email;
```

**Note:** If supervisors are created with passwords initially, this column should already exist.

## Security Considerations

1. **Never return password in response** - Always exclude password from response DTOs
2. **Hash passwords** - Never store plain text passwords
3. **Validate password strength** - Enforce minimum length and complexity
4. **Log password changes** - Consider logging when passwords are updated for security auditing

## Testing

### Test Cases:

1. **Update supervisor without password** - Should update other fields, keep current password
2. **Update supervisor with new password** - Should update password in database (hashed)
3. **Update supervisor with empty password** - Should keep current password
4. **Update supervisor with short password** - Should return validation error
5. **Update non-existent supervisor** - Should return 404 error

### Example Test Request:

```bash
# Update supervisor with new password
PUT /api/supervisors/1
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Updated Name",
  "email": "updated@univen.ac.za",
  "departmentId": 2,
  "field": "New Field",
  "password": "newSecurePassword123"
}
```

## Response Format

The response should **NOT** include the password:

```json
{
  "id": 1,
  "name": "Updated Name",
  "email": "updated@univen.ac.za",
  "department": "ICT",
  "departmentId": 2,
  "field": "New Field",
  "active": true
  // ❌ NO password field in response
}
```

## Summary

✅ **Frontend is ready** - Sends password in update request when provided
⚠️ **Backend needs implementation** - Must:
1. Accept `password` field in PUT request
2. Hash password before saving
3. Only update password if provided (optional field)
4. Never return password in response

## Quick Checklist

- [ ] Add `password` field to SupervisorUpdateRequest DTO
- [ ] Update PUT endpoint to handle password updates
- [ ] Hash password using PasswordEncoder before saving
- [ ] Add password validation (minimum length)
- [ ] Ensure password is NOT returned in response
- [ ] Test password update functionality
- [ ] Test that password is optional (can update without changing password)

