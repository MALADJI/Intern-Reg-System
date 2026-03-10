# Backend Fix: Admin Department Assignment

## Problem
Super admin is creating admins but departments are not being assigned. The frontend is sending `departmentId` but the backend is not saving it.

---

## Frontend Status ✅
The frontend is **correctly** sending `departmentId`:
- Department field is **required** in the form
- Validation ensures department is selected
- `departmentId` is included in the request: `{ name, email, password, departmentId }`

---

## Backend Fixes Required

### Fix 1: Update Admin Creation Endpoint

**Endpoint:** `POST /api/super-admin/admins`

**Current Issue:** Backend is not saving `departmentId` to the database.

**Fix:**

```java
@PostMapping("/admins")
public ResponseEntity<?> createAdmin(@RequestBody CreateAdminRequest request) {
    // ✅ Validate departmentId is provided
    if (request.getDepartmentId() == null) {
        return ResponseEntity.badRequest()
            .body(new ErrorResponse("Department is required when creating an admin"));
    }
    
    // ✅ Verify department exists
    Department department = departmentRepository.findById(request.getDepartmentId())
        .orElseThrow(() -> new ResourceNotFoundException("Department not found"));
    
    // Create user first
    User user = new User();
    user.setEmail(request.getEmail());
    user.setPassword(passwordEncoder.encode(request.getPassword()));
    user.setRole(Role.ADMIN);
    user.setName(request.getName());
    user = userRepository.save(user);
    
    // Create admin and ✅ SET DEPARTMENT_ID
    Admin admin = new Admin();
    admin.setUser(user);
    admin.setName(request.getName());
    admin.setEmail(request.getEmail());
    admin.setDepartment(department); // ✅ CRITICAL: Set the department
    admin.setDepartmentId(department.getId()); // ✅ Also set departmentId for easy access
    admin.setActive(true);
    
    admin = adminRepository.save(admin);
    
    // ✅ Return department info in response
    AdminResponse response = new AdminResponse();
    response.setAdminId(admin.getId());
    response.setUserId(user.getId());
    response.setName(admin.getName());
    response.setEmail(admin.getEmail());
    response.setDepartmentId(admin.getDepartmentId()); // ✅ Include in response
    response.setDepartmentName(admin.getDepartment().getName()); // ✅ Include in response
    response.setActive(admin.isActive());
    response.setCreatedAt(admin.getCreatedAt());
    
    return ResponseEntity.ok(response);
}
```

### Fix 2: Update CreateAdminRequest DTO

**File:** `CreateAdminRequest.java`

```java
public class CreateAdminRequest {
    @NotBlank(message = "Name is required")
    private String name;
    
    @NotBlank(message = "Email is required")
    @Email(message = "Email must be valid")
    private String email;
    
    @NotBlank(message = "Password is required")
    @Size(min = 6, message = "Password must be at least 6 characters")
    private String password;
    
    @NotNull(message = "Department ID is required") // ✅ Add validation
    private Long departmentId; // ✅ Make sure this field exists
    
    private String signature; // Optional
    
    // Getters and setters
    public Long getDepartmentId() {
        return departmentId;
    }
    
    public void setDepartmentId(Long departmentId) {
        this.departmentId = departmentId;
    }
    
    // ... other getters/setters
}
```

### Fix 3: Update Admin Entity

**File:** `Admin.java` (Entity)

```java
@Entity
@Table(name = "admins")
public class Admin {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @OneToOne
    @JoinColumn(name = "user_id")
    private User user;
    
    private String name;
    private String email;
    
    // ✅ CRITICAL: Add department relationship
    @ManyToOne(fetch = FetchType.EAGER) // EAGER to load with admin
    @JoinColumn(name = "department_id")
    private Department department;
    
    @Column(name = "department_id", insertable = false, updatable = false)
    private Long departmentId; // For easy access without loading department
    
    private Boolean active = true;
    
    // Getters and setters
    public Department getDepartment() {
        return department;
    }
    
    public void setDepartment(Department department) {
        this.department = department;
        if (department != null) {
            this.departmentId = department.getId();
        }
    }
    
    public Long getDepartmentId() {
        return departmentId != null ? departmentId : 
               (department != null ? department.getId() : null);
    }
    
    public void setDepartmentId(Long departmentId) {
        this.departmentId = departmentId;
    }
    
    // ... other getters/setters
}
```

### Fix 4: Update Login Response to Include Department

**File:** `AuthController.java` or `AuthService.java`

**Endpoint:** `POST /api/auth/login`

```java
@PostMapping("/login")
public ResponseEntity<?> login(@RequestBody LoginRequest request) {
    // ... authentication logic ...
    
    User user = userRepository.findByEmail(request.getEmail())
        .orElseThrow(() -> new BadCredentialsException("Invalid credentials"));
    
    // Build login response
    LoginResponse response = new LoginResponse();
    response.setToken(jwtTokenProvider.generateToken(user));
    
    UserDTO userDTO = new UserDTO();
    userDTO.setId(user.getId());
    userDTO.setEmail(user.getEmail());
    userDTO.setRole(user.getRole());
    userDTO.setName(user.getName());
    
    // ✅ CRITICAL: If user is ADMIN, get department from Admin entity
    if (user.getRole() == Role.ADMIN) {
        Admin admin = adminRepository.findByUserId(user.getId())
            .orElse(null);
        
        if (admin != null && admin.getDepartment() != null) {
            userDTO.setDepartment(admin.getDepartment().getName()); // ✅ Department name
            userDTO.setDepartmentId(admin.getDepartment().getId()); // ✅ Department ID
        }
    }
    
    // If user is SUPERVISOR or INTERN, get their department similarly
    // ... (similar logic for other roles)
    
    response.setUser(userDTO);
    return ResponseEntity.ok(response);
}
```

### Fix 5: Update AdminResponse DTO

**File:** `AdminResponse.java`

```java
public class AdminResponse {
    private Long adminId;
    private Long userId;
    private String name;
    private String email;
    private Long departmentId; // ✅ Include in response
    private String departmentName; // ✅ Include in response
    private Boolean active;
    private LocalDateTime createdAt;
    
    // Getters and setters
    public Long getDepartmentId() {
        return departmentId;
    }
    
    public void setDepartmentId(Long departmentId) {
        this.departmentId = departmentId;
    }
    
    public String getDepartmentName() {
        return departmentName;
    }
    
    public void setDepartmentName(String departmentName) {
        this.departmentName = departmentName;
    }
    
    // ... other getters/setters
}
```

### Fix 6: Database Migration (If Needed)

**Check if `department_id` column exists in `admins` table:**

```sql
-- Check if column exists
DESCRIBE admins;

-- If department_id column doesn't exist, add it:
ALTER TABLE admins 
ADD COLUMN department_id BIGINT NULL;

-- Add foreign key constraint
ALTER TABLE admins 
ADD CONSTRAINT fk_admin_department 
    FOREIGN KEY (department_id) 
    REFERENCES departments(department_id) 
    ON DELETE SET NULL 
    ON UPDATE CASCADE;

-- Add index for better performance
CREATE INDEX idx_admin_department_id ON admins(department_id);
```

---

## Testing Checklist

After implementing fixes:

- [ ] Create admin with department → Check database: `SELECT * FROM admins WHERE email = 'test@univen.ac.za';`
- [ ] Verify `department_id` is saved in database
- [ ] Login as created admin → Check login response includes `department` and `departmentId`
- [ ] Admin dashboard shows department in sidebar
- [ ] Admin can only see data from their department

---

## Quick Fix Summary

**3 Critical Backend Changes:**

1. **Save departmentId when creating admin:**
   ```java
   admin.setDepartment(department);
   admin.setDepartmentId(department.getId());
   ```

2. **Return department in admin creation response:**
   ```java
   response.setDepartmentId(admin.getDepartmentId());
   response.setDepartmentName(admin.getDepartment().getName());
   ```

3. **Include department in login response:**
   ```java
   if (user.getRole() == Role.ADMIN) {
       Admin admin = adminRepository.findByUserId(user.getId());
       if (admin != null && admin.getDepartment() != null) {
           userDTO.setDepartment(admin.getDepartment().getName());
           userDTO.setDepartmentId(admin.getDepartment().getId());
       }
   }
   ```

---

## Frontend Verification

The frontend is already correct. To verify:

1. Open browser console when creating admin
2. Look for log: `✅ Creating admin with department assignment:`
3. Check Network tab → Request payload should include `departmentId`
4. Check Network tab → Response should include `departmentId` and `departmentName`

---

**That's it!** Once the backend implements these fixes, admins will properly inherit their assigned departments.

