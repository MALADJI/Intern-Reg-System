# 🔧 Complete Backend Implementation Guide: Admin Department & Field Management

## Overview
This guide provides complete backend implementation to ensure:
1. ✅ Admin's department (selected by super admin) is saved when creating admin
2. ✅ Admin's department is returned in login response
3. ✅ Fields created by admin are automatically connected to admin's department
4. ✅ Admin can only see/manage data from their assigned department

---

## 1. Admin Entity - Add Department Relationship

**File:** `Admin.java` or `Admin.java` entity

```java
package com.univen.internregister.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;

@Entity
@Table(name = "admin")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class Admin {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "admin_id")
    private Long adminId;
    
    @Column(name = "name", nullable = false)
    private String name;
    
    @Column(name = "email", nullable = false, unique = true)
    private String email;
    
    @OneToOne
    @JoinColumn(name = "user_id")
    private User user;
    
    // ✅ CRITICAL: Department relationship (selected by super admin)
    @ManyToOne(fetch = FetchType.EAGER) // EAGER to load department with admin
    @JoinColumn(name = "department_id")
    private Department department;
    
    @Column(name = "active", nullable = false)
    private Boolean active = true;
    
    @Column(name = "created_at")
    private LocalDateTime createdAt;
    
    // Getters and setters (if not using Lombok)
    public Department getDepartment() {
        return department;
    }
    
    public void setDepartment(Department department) {
        this.department = department;
    }
}
```

---

## 2. Admin Repository - Add Find Methods

**File:** `AdminRepository.java`

```java
package com.univen.internregister.repository;

import com.univen.internregister.model.Admin;
import com.univen.internregister.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface AdminRepository extends JpaRepository<Admin, Long> {
    
    Optional<Admin> findByEmail(String email);
    
    // ✅ CRITICAL: Find admin by userId (for login response)
    Optional<Admin> findByUserId(Long userId);
    
    // Alternative if using User relationship
    Optional<Admin> findByUser(User user);
    
    // Find admins by department
    List<Admin> findByDepartmentId(Long departmentId);
}
```

---

## 3. Super Admin Controller - Save Department When Creating Admin

**File:** `SuperAdminController.java`

```java
package com.univen.internregister.controller;

import com.univen.internregister.dto.AdminResponse;
import com.univen.internregister.dto.CreateAdminRequest;
import com.univen.internregister.model.Admin;
import com.univen.internregister.model.Department;
import com.univen.internregister.model.User;
import com.univen.internregister.model.Role;
import com.univen.internregister.repository.AdminRepository;
import com.univen.internregister.repository.DepartmentRepository;
import com.univen.internregister.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import jakarta.persistence.EntityNotFoundException;
import java.time.LocalDateTime;

@RestController
@RequestMapping("/api/super-admin")
public class SuperAdminController {
    
    @Autowired
    private AdminRepository adminRepository;
    
    @Autowired
    private UserRepository userRepository;
    
    @Autowired
    private DepartmentRepository departmentRepository;
    
    @Autowired
    private PasswordEncoder passwordEncoder;
    
    /**
     * ✅ CRITICAL: Create admin with department assignment
     * POST /api/super-admin/admins
     */
    @PostMapping("/admins")
    public ResponseEntity<AdminResponse> createAdmin(@RequestBody CreateAdminRequest request) {
        try {
            // Validate request
            if (request.getEmail() == null || request.getPassword() == null || request.getName() == null) {
                return ResponseEntity.badRequest().build();
            }
            
            // Check if email already exists
            if (userRepository.findByEmail(request.getEmail()).isPresent()) {
                return ResponseEntity.badRequest()
                    .body(null); // Or return error DTO
            }
            
            // Create User entity
            User user = new User();
            user.setEmail(request.getEmail());
            user.setUsername(request.getEmail()); // Use email as username
            user.setPassword(passwordEncoder.encode(request.getPassword()));
            user.setRole(Role.ADMIN);
            user.setActive(true);
            User savedUser = userRepository.save(user);
            
            // Create Admin entity
            Admin admin = new Admin();
            admin.setName(request.getName());
            admin.setEmail(request.getEmail());
            admin.setUser(savedUser);
            admin.setActive(true);
            admin.setCreatedAt(LocalDateTime.now());
            
            // ✅ CRITICAL FIX: Save departmentId if provided by super admin
            if (request.getDepartmentId() != null) {
                Department department = departmentRepository.findById(request.getDepartmentId())
                    .orElseThrow(() -> new EntityNotFoundException(
                        "Department with ID " + request.getDepartmentId() + " not found"));
                
                // ✅ Save the department relationship
                admin.setDepartment(department);
                
                System.out.println("✅ Admin created with department: " + department.getName() + " (ID: " + department.getDepartmentId() + ")");
            } else {
                System.out.println("⚠️ Admin created without department assignment");
            }
            
            // Save admin to database
            Admin savedAdmin = adminRepository.save(admin);
            
            // Build response
            AdminResponse response = new AdminResponse();
            response.setAdminId(savedAdmin.getAdminId());
            response.setUserId(savedUser.getId());
            response.setName(savedAdmin.getName());
            response.setEmail(savedAdmin.getEmail());
            response.setActive(savedAdmin.getActive());
            response.setCreatedAt(savedAdmin.getCreatedAt());
            
            // ✅ CRITICAL: Include department info in response
            if (savedAdmin.getDepartment() != null) {
                response.setDepartmentId(savedAdmin.getDepartment().getDepartmentId());
                response.setDepartmentName(savedAdmin.getDepartment().getName());
                System.out.println("✅ Response includes department: " + response.getDepartmentName());
            } else {
                response.setDepartmentId(null);
                response.setDepartmentName(null);
            }
            
            return ResponseEntity.ok(response);
            
        } catch (EntityNotFoundException e) {
            return ResponseEntity.badRequest().build();
        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.internalServerError().build();
        }
    }
    
    /**
     * Update admin (including department)
     * PUT /api/super-admin/admins/{adminId}
     */
    @PutMapping("/admins/{adminId}")
    public ResponseEntity<AdminResponse> updateAdmin(
            @PathVariable Long adminId,
            @RequestBody UpdateAdminRequest request) {
        
        Admin admin = adminRepository.findById(adminId)
            .orElseThrow(() -> new EntityNotFoundException("Admin not found"));
        
        // Update name and email
        if (request.getName() != null) {
            admin.setName(request.getName());
        }
        if (request.getEmail() != null) {
            admin.setEmail(request.getEmail());
        }
        
        // ✅ CRITICAL: Update department if provided
        if (request.getDepartmentId() != null) {
            Department department = departmentRepository.findById(request.getDepartmentId())
                .orElseThrow(() -> new EntityNotFoundException("Department not found"));
            admin.setDepartment(department);
        } else if (request.getDepartmentId() == null && request.isRemoveDepartment()) {
            // Remove department assignment
            admin.setDepartment(null);
        }
        
        Admin updatedAdmin = adminRepository.save(admin);
        
        // Build and return response with department info
        AdminResponse response = mapToAdminResponse(updatedAdmin);
        return ResponseEntity.ok(response);
    }
    
    private AdminResponse mapToAdminResponse(Admin admin) {
        AdminResponse response = new AdminResponse();
        response.setAdminId(admin.getAdminId());
        response.setUserId(admin.getUser().getId());
        response.setName(admin.getName());
        response.setEmail(admin.getEmail());
        response.setActive(admin.getActive());
        response.setCreatedAt(admin.getCreatedAt());
        
        if (admin.getDepartment() != null) {
            response.setDepartmentId(admin.getDepartment().getDepartmentId());
            response.setDepartmentName(admin.getDepartment().getName());
        }
        
        return response;
    }
}
```

---

## 4. Auth Controller - Return Department in Login Response

**File:** `AuthController.java`

```java
package com.univen.internregister.controller;

import com.univen.internregister.dto.LoginRequest;
import com.univen.internregister.dto.LoginResponse;
import com.univen.internregister.dto.UserResponse;
import com.univen.internregister.model.Admin;
import com.univen.internregister.model.Role;
import com.univen.internregister.model.User;
import com.univen.internregister.repository.AdminRepository;
import com.univen.internregister.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    
    @Autowired
    private AuthenticationManager authenticationManager;
    
    @Autowired
    private UserRepository userRepository;
    
    @Autowired
    private AdminRepository adminRepository;
    
    @Autowired
    private JwtTokenProvider jwtTokenProvider;
    
    /**
     * ✅ CRITICAL: Login endpoint - Return department for ADMIN users
     * POST /api/auth/login
     */
    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@RequestBody LoginRequest request) {
        try {
            // Authenticate user
            Authentication authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(
                    request.getEmail(), 
                    request.getPassword()
                )
            );
            
            // Get user from database
            User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new EntityNotFoundException("User not found"));
            
            // Generate JWT token
            String token = jwtTokenProvider.generateToken(authentication);
            
            // Build user response
            UserResponse userResponse = new UserResponse();
            userResponse.setId(user.getId());
            userResponse.setUsername(user.getUsername());
            userResponse.setEmail(user.getEmail());
            userResponse.setRole(user.getRole());
            userResponse.setName(user.getName());
            userResponse.setSurname(user.getSurname());
            
            // ✅ CRITICAL FIX: If ADMIN, fetch department from Admin entity
            // This department was selected by super admin when creating the admin
            if (user.getRole() == Role.ADMIN) {
                // Find admin by userId or email
                Admin admin = adminRepository.findByUserId(user.getId())
                    .orElse(adminRepository.findByEmail(user.getEmail()).orElse(null));
                
                if (admin != null) {
                    // ✅ Get department from Admin entity (selected by super admin)
                    if (admin.getDepartment() != null) {
                        userResponse.setDepartment(admin.getDepartment().getName());
                        userResponse.setDepartmentId(admin.getDepartment().getDepartmentId());
                        
                        System.out.println("✅ Admin login - Department: " + admin.getDepartment().getName() + 
                                         " (ID: " + admin.getDepartment().getDepartmentId() + ")");
                    } else {
                        // No department assigned
                        userResponse.setDepartment(null);
                        userResponse.setDepartmentId(null);
                        System.out.println("⚠️ Admin login - No department assigned");
                    }
                } else {
                    // Admin entity not found
                    userResponse.setDepartment(null);
                    userResponse.setDepartmentId(null);
                    System.out.println("⚠️ Admin login - Admin entity not found for user: " + user.getEmail());
                }
            } else if (user.getRole() == Role.SUPERVISOR) {
                // For supervisor, get department from Supervisor entity
                Supervisor supervisor = supervisorRepository.findByUserId(user.getId())
                    .orElse(supervisorRepository.findByEmail(user.getEmail()).orElse(null));
                
                if (supervisor != null && supervisor.getDepartment() != null) {
                    userResponse.setDepartment(supervisor.getDepartment().getName());
                    userResponse.setDepartmentId(supervisor.getDepartment().getDepartmentId());
                    userResponse.setField(supervisor.getField());
                }
            } else if (user.getRole() == Role.INTERN) {
                // For intern, get department from Intern entity
                Intern intern = internRepository.findByUserId(user.getId())
                    .orElse(internRepository.findByEmail(user.getEmail()).orElse(null));
                
                if (intern != null && intern.getDepartment() != null) {
                    userResponse.setDepartment(intern.getDepartment().getName());
                    userResponse.setDepartmentId(intern.getDepartment().getDepartmentId());
                    userResponse.setField(intern.getField());
                }
            }
            
            // Build login response
            LoginResponse response = new LoginResponse();
            response.setToken(token);
            response.setUser(userResponse);
            
            return ResponseEntity.ok(response);
            
        } catch (BadCredentialsException e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.internalServerError().build();
        }
    }
}
```

---

## 5. Department Controller - Verify Admin Owns Department When Creating Fields

**File:** `DepartmentController.java`

```java
package com.univen.internregister.controller;

import com.univen.internregister.model.Admin;
import com.univen.internregister.model.Department;
import com.univen.internregister.repository.AdminRepository;
import com.univen.internregister.repository.DepartmentRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/departments")
public class DepartmentController {
    
    @Autowired
    private DepartmentRepository departmentRepository;
    
    @Autowired
    private AdminRepository adminRepository;
    
    /**
     * ✅ CRITICAL: Add field to department - Verify admin owns the department
     * POST /api/departments/{departmentId}/fields
     */
    @PostMapping("/{departmentId}/fields")
    public ResponseEntity<DepartmentResponse> addField(
            @PathVariable Long departmentId,
            @RequestBody FieldRequest request,
            Authentication authentication) {
        
        // Get current user from authentication
        String userEmail = authentication.getName();
        
        // ✅ CRITICAL: If user is ADMIN, verify they own this department
        if (authentication.getAuthorities().stream()
            .anyMatch(a -> a.getAuthority().equals("ROLE_ADMIN"))) {
            
            // Find admin by email
            Admin admin = adminRepository.findByEmail(userEmail)
                .orElse(null);
            
            if (admin == null) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
            }
            
            // ✅ Verify admin's department matches the department they're trying to modify
            if (admin.getDepartment() == null) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(null); // Admin has no department assigned
            }
            
            if (!admin.getDepartment().getDepartmentId().equals(departmentId)) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(null); // Admin can only manage their own department
            }
        }
        
        // Find department
        Department department = departmentRepository.findById(departmentId)
            .orElseThrow(() -> new EntityNotFoundException("Department not found"));
        
        // Add field to department
        Field field = new Field();
        field.setName(request.getName());
        field.setDepartment(department);
        field.setActive(true);
        
        // Save field (assuming you have a Field entity and repository)
        fieldRepository.save(field);
        
        // Reload department with fields
        department = departmentRepository.findById(departmentId)
            .orElseThrow(() -> new EntityNotFoundException("Department not found"));
        
        // Return updated department
        DepartmentResponse response = mapToDepartmentResponse(department);
        return ResponseEntity.ok(response);
    }
    
    /**
     * Update field - Verify admin owns the department
     * PUT /api/departments/{departmentId}/fields/{fieldId}
     */
    @PutMapping("/{departmentId}/fields/{fieldId}")
    public ResponseEntity<DepartmentResponse> updateField(
            @PathVariable Long departmentId,
            @PathVariable Long fieldId,
            @RequestBody FieldRequest request,
            Authentication authentication) {
        
        // ✅ Verify admin owns this department (same logic as above)
        if (authentication.getAuthorities().stream()
            .anyMatch(a -> a.getAuthority().equals("ROLE_ADMIN"))) {
            
            Admin admin = adminRepository.findByEmail(authentication.getName())
                .orElse(null);
            
            if (admin == null || admin.getDepartment() == null || 
                !admin.getDepartment().getDepartmentId().equals(departmentId)) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
            }
        }
        
        // Update field logic...
        // ...
        
        return ResponseEntity.ok(response);
    }
    
    /**
     * Delete/Deactivate field - Verify admin owns the department
     */
    @PutMapping("/{departmentId}/fields/{fieldId}/deactivate")
    public ResponseEntity<DepartmentResponse> deactivateField(
            @PathVariable Long departmentId,
            @PathVariable Long fieldId,
            Authentication authentication) {
        
        // ✅ Verify admin owns this department
        if (authentication.getAuthorities().stream()
            .anyMatch(a -> a.getAuthority().equals("ROLE_ADMIN"))) {
            
            Admin admin = adminRepository.findByEmail(authentication.getName())
                .orElse(null);
            
            if (admin == null || admin.getDepartment() == null || 
                !admin.getDepartment().getDepartmentId().equals(departmentId)) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
            }
        }
        
        // Deactivate field logic...
        // ...
        
        return ResponseEntity.ok(response);
    }
}
```

---

## 6. DTOs - Request/Response Classes

**File:** `CreateAdminRequest.java`

```java
package com.univen.internregister.dto;

import lombok.Data;

@Data
public class CreateAdminRequest {
    private String name;
    private String email;
    private String password;
    private Long departmentId; // ✅ Department ID selected by super admin
}
```

**File:** `AdminResponse.java`

```java
package com.univen.internregister.dto;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class AdminResponse {
    private Long adminId;
    private Long userId;
    private String name;
    private String email;
    private Long departmentId; // ✅ Department ID
    private String departmentName; // ✅ Department name
    private Boolean active;
    private LocalDateTime createdAt;
    private Boolean hasSignature;
}
```

**File:** `UserResponse.java` (for login response)

```java
package com.univen.internregister.dto;

import lombok.Data;
import com.univen.internregister.model.Role;

@Data
public class UserResponse {
    private Long id;
    private String username;
    private String email;
    private Role role;
    private String name;
    private String surname;
    private String department; // ✅ Department name
    private Long departmentId; // ✅ Department ID
    private String field; // For supervisor/intern
}
```

---

## 7. Database Migration (If Needed)

**File:** `V2__add_department_to_admin.sql` (if using Flyway) or run manually:

```sql
-- Check if column exists
SELECT COLUMN_NAME 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'admin' 
AND COLUMN_NAME = 'department_id'
AND TABLE_SCHEMA = DATABASE();

-- If it doesn't exist, add it
ALTER TABLE admin 
ADD COLUMN department_id BIGINT NULL;

-- Add foreign key constraint
ALTER TABLE admin 
ADD CONSTRAINT fk_admin_department 
    FOREIGN KEY (department_id) 
    REFERENCES department(department_id)
    ON DELETE SET NULL;

-- Add index for faster lookups
CREATE INDEX idx_admin_department_id ON admin(department_id);
```

---

## 8. Testing Checklist

### Test 1: Create Admin with Department
```bash
POST /api/super-admin/admins
{
  "name": "Test Admin",
  "email": "testadmin@univen.ac.za",
  "password": "password123",
  "departmentId": 2
}
```

**Expected:**
- ✅ Admin saved with `department_id = 2` in database
- ✅ Response includes `departmentId: 2` and `departmentName: "HR"`

### Test 2: Login as Admin
```bash
POST /api/auth/login
{
  "email": "testadmin@univen.ac.za",
  "password": "password123"
}
```

**Expected:**
- ✅ Response includes `user.department: "HR"` and `user.departmentId: 2`
- ✅ Department matches what super admin selected

### Test 3: Create Field (as Admin)
```bash
POST /api/departments/2/fields
Authorization: Bearer <admin_token>
{
  "name": "Software Development"
}
```

**Expected:**
- ✅ Field created successfully
- ✅ Field is connected to department ID 2 (admin's department)
- ✅ If admin tries to create field in different department, returns 403 Forbidden

### Test 4: Verify Database
```sql
-- Check admin has department
SELECT a.admin_id, a.name, a.email, a.department_id, d.name as department_name
FROM admin a
LEFT JOIN department d ON a.department_id = d.department_id
WHERE a.email = 'testadmin@univen.ac.za';

-- Check fields are in admin's department
SELECT f.field_id, f.name, f.department_id, d.name as department_name
FROM field f
JOIN department d ON f.department_id = d.department_id
WHERE f.department_id = 2;
```

---

## 9. Common Issues & Solutions

### Issue 1: Department not saved
**Solution:** Ensure `admin.setDepartment(department)` is called before `adminRepository.save(admin)`

### Issue 2: Login returns null department
**Solution:** 
- Check Admin entity has `@ManyToOne` relationship with Department
- Ensure `FetchType.EAGER` or department is loaded
- Verify `adminRepository.findByUserId()` method exists

### Issue 3: Admin can create fields in wrong department
**Solution:** Always verify `admin.getDepartment().getDepartmentId().equals(departmentId)` before allowing field creation

### Issue 4: Foreign key constraint error
**Solution:** Ensure department exists before assigning:
```java
Department department = departmentRepository.findById(departmentId)
    .orElseThrow(() -> new EntityNotFoundException("Department not found"));
```

---

## 10. Security Best Practices

1. **Always verify department ownership** - Don't trust frontend, verify on backend
2. **Use authentication context** - Get admin from `Authentication` object, not request body
3. **Return 403 Forbidden** - If admin tries to access other departments
4. **Log department operations** - For audit trail
5. **Validate department exists** - Before assigning to admin

---

## Summary

After implementing these changes:

✅ **Super admin creates admin** → Department is saved to `admin.department_id`
✅ **Admin logs in** → Login response includes department from `Admin` entity
✅ **Admin creates field** → Field is automatically connected to admin's department
✅ **Security** → Admin can only manage fields in their assigned department

All department information flows from the super admin's selection when creating the admin, through the login response, to field creation.

