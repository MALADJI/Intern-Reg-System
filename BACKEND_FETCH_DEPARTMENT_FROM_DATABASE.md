# Backend Fix: Fetch Department ID from Database

## Problem
Admin's `departmentId` is `undefined` because the backend is not fetching it from the database and returning it in the login response.

---

## Solution: Update Backend to Fetch Department from Database

### Fix 1: Update Login Endpoint to Fetch Department

**File:** `AuthController.java` or `AuthService.java`

**Endpoint:** `POST /api/auth/login`

```java
@PostMapping("/login")
public ResponseEntity<?> login(@RequestBody LoginRequest request) {
    try {
        // Authenticate user
        Authentication authentication = authenticationManager.authenticate(
            new UsernamePasswordAuthenticationToken(
                request.getEmail(),
                request.getPassword()
            )
        );

        User user = (User) authentication.getPrincipal();
        
        // ✅ CRITICAL: Fetch department from database based on user role
        UserDTO userDTO = new UserDTO();
        userDTO.setId(user.getId());
        userDTO.setEmail(user.getEmail());
        userDTO.setRole(user.getRole());
        userDTO.setName(user.getName());
        userDTO.setUsername(user.getUsername());
        
        // ✅ Fetch department from database for ADMIN
        if (user.getRole() == Role.ADMIN) {
            Admin admin = adminRepository.findByUserId(user.getId())
                .orElse(null);
            
            if (admin != null) {
                // ✅ Load department relationship (EAGER or explicit JOIN)
                if (admin.getDepartment() != null) {
                    userDTO.setDepartment(admin.getDepartment().getName());
                    userDTO.setDepartmentId(admin.getDepartment().getId());
                } else {
                    // ✅ Fallback: Try to load department by departmentId if relationship is lazy
                    if (admin.getDepartmentId() != null) {
                        Department department = departmentRepository.findById(admin.getDepartmentId())
                            .orElse(null);
                        if (department != null) {
                            userDTO.setDepartment(department.getName());
                            userDTO.setDepartmentId(department.getId());
                        }
                    }
                }
            }
        }
        
        // ✅ Similar logic for SUPERVISOR and INTERN
        if (user.getRole() == Role.SUPERVISOR) {
            Supervisor supervisor = supervisorRepository.findByUserId(user.getId())
                .orElse(null);
            if (supervisor != null && supervisor.getDepartment() != null) {
                userDTO.setDepartment(supervisor.getDepartment().getName());
                userDTO.setDepartmentId(supervisor.getDepartment().getId());
            }
        }
        
        if (user.getRole() == Role.INTERN) {
            Intern intern = internRepository.findByUserId(user.getId())
                .orElse(null);
            if (intern != null && intern.getDepartment() != null) {
                userDTO.setDepartment(intern.getDepartment().getName());
                userDTO.setDepartmentId(intern.getDepartment().getId());
            }
        }
        
        // Generate JWT token
        String token = jwtTokenProvider.generateToken(user);
        
        LoginResponse response = new LoginResponse();
        response.setToken(token);
        response.setUser(userDTO);
        
        return ResponseEntity.ok(response);
        
    } catch (BadCredentialsException e) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
            .body(new ErrorResponse("Invalid email or password"));
    } catch (Exception e) {
        log.error("Login error", e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body(new ErrorResponse("An error occurred during login"));
    }
}
```

### Fix 2: Update Admin Repository to Load Department

**File:** `AdminRepository.java`

```java
@Repository
public interface AdminRepository extends JpaRepository<Admin, Long> {
    
    // ✅ Find by user ID with department loaded
    @Query("SELECT a FROM Admin a LEFT JOIN FETCH a.department WHERE a.user.id = :userId")
    Optional<Admin> findByUserIdWithDepartment(@Param("userId") Long userId);
    
    // ✅ Find by user ID (standard)
    Optional<Admin> findByUserId(Long userId);
    
    // ✅ Find by email with department loaded
    @Query("SELECT a FROM Admin a LEFT JOIN FETCH a.department WHERE a.email = :email")
    Optional<Admin> findByEmailWithDepartment(@Param("email") String email);
    
    Optional<Admin> findByEmail(String email);
}
```

### Fix 3: Update Admin Entity to Load Department

**File:** `Admin.java`

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
    
    // ✅ CRITICAL: Load department relationship
    @ManyToOne(fetch = FetchType.EAGER) // EAGER to always load with admin
    @JoinColumn(name = "department_id")
    private Department department;
    
    @Column(name = "department_id", insertable = false, updatable = false)
    private Long departmentId;
    
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
        if (departmentId != null) {
            return departmentId;
        }
        return department != null ? department.getId() : null;
    }
    
    // ... other fields
}
```

### Fix 4: Update Get Current User Endpoint

**File:** `AuthController.java`

**Endpoint:** `GET /api/auth/me`

```java
@GetMapping("/me")
public ResponseEntity<?> getCurrentUser(Authentication authentication) {
    try {
        User user = (User) authentication.getPrincipal();
        
        UserDTO userDTO = new UserDTO();
        userDTO.setId(user.getId());
        userDTO.setEmail(user.getEmail());
        userDTO.setRole(user.getRole());
        userDTO.setName(user.getName());
        userDTO.setUsername(user.getUsername());
        
        // ✅ CRITICAL: Fetch department from database
        if (user.getRole() == Role.ADMIN) {
            Admin admin = adminRepository.findByUserIdWithDepartment(user.getId())
                .orElse(null);
            
            if (admin != null && admin.getDepartment() != null) {
                userDTO.setDepartment(admin.getDepartment().getName());
                userDTO.setDepartmentId(admin.getDepartment().getId());
            }
        }
        
        // Similar for SUPERVISOR and INTERN...
        
        return ResponseEntity.ok(userDTO);
        
    } catch (Exception e) {
        log.error("Error getting current user", e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body(new ErrorResponse("Failed to get user information"));
    }
}
```

### Fix 5: Alternative - Direct SQL Query

If JPA relationships are causing issues, use a direct query:

```java
@Query(value = 
    "SELECT a.*, d.department_id, d.name as department_name " +
    "FROM admins a " +
    "LEFT JOIN departments d ON a.department_id = d.department_id " +
    "WHERE a.user_id = :userId",
    nativeQuery = true)
Optional<AdminWithDepartment> findByUserIdWithDepartmentNative(@Param("userId") Long userId);

// Create a projection interface
public interface AdminWithDepartment {
    Long getId();
    String getName();
    String getEmail();
    Long getDepartmentId();
    String getDepartmentName();
}
```

---

## Complete Login Service Implementation

**File:** `AuthService.java`

```java
@Service
public class AuthService {
    
    @Autowired
    private AdminRepository adminRepository;
    
    @Autowired
    private DepartmentRepository departmentRepository;
    
    @Autowired
    private UserRepository userRepository;
    
    @Autowired
    private PasswordEncoder passwordEncoder;
    
    @Autowired
    private JwtTokenProvider jwtTokenProvider;
    
    public LoginResponse login(LoginRequest request) {
        // 1. Authenticate user
        User user = userRepository.findByEmail(request.getEmail())
            .orElseThrow(() -> new BadCredentialsException("Invalid credentials"));
        
        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new BadCredentialsException("Invalid credentials");
        }
        
        // 2. ✅ Fetch department from database
        UserDTO userDTO = buildUserDTO(user);
        
        // 3. Generate token
        String token = jwtTokenProvider.generateToken(user);
        
        LoginResponse response = new LoginResponse();
        response.setToken(token);
        response.setUser(userDTO);
        
        return response;
    }
    
    /**
     * ✅ Build UserDTO with department from database
     */
    private UserDTO buildUserDTO(User user) {
        UserDTO userDTO = new UserDTO();
        userDTO.setId(user.getId());
        userDTO.setEmail(user.getEmail());
        userDTO.setRole(user.getRole());
        userDTO.setName(user.getName());
        userDTO.setUsername(user.getUsername());
        
        // ✅ Fetch department based on role
        if (user.getRole() == Role.ADMIN) {
            fetchAdminDepartment(user.getId(), userDTO);
        } else if (user.getRole() == Role.SUPERVISOR) {
            fetchSupervisorDepartment(user.getId(), userDTO);
        } else if (user.getRole() == Role.INTERN) {
            fetchInternDepartment(user.getId(), userDTO);
        }
        
        return userDTO;
    }
    
    /**
     * ✅ Fetch admin's department from database
     */
    private void fetchAdminDepartment(Long userId, UserDTO userDTO) {
        Admin admin = adminRepository.findByUserIdWithDepartment(userId)
            .orElse(null);
        
        if (admin == null) {
            log.warn("Admin not found for user ID: {}", userId);
            return;
        }
        
        // ✅ Get department from admin entity
        if (admin.getDepartment() != null) {
            userDTO.setDepartment(admin.getDepartment().getName());
            userDTO.setDepartmentId(admin.getDepartment().getId());
            log.info("✅ Admin department loaded: {} (ID: {})", 
                admin.getDepartment().getName(), 
                admin.getDepartment().getId());
        } else if (admin.getDepartmentId() != null) {
            // ✅ Fallback: Load department by ID if relationship is null
            Department department = departmentRepository.findById(admin.getDepartmentId())
                .orElse(null);
            if (department != null) {
                userDTO.setDepartment(department.getName());
                userDTO.setDepartmentId(department.getId());
                log.info("✅ Admin department loaded by ID: {} (ID: {})", 
                    department.getName(), 
                    department.getId());
            } else {
                log.warn("⚠️ Admin has departmentId {} but department not found in database", 
                    admin.getDepartmentId());
            }
        } else {
            log.warn("⚠️ Admin has no department assigned (user ID: {})", userId);
        }
    }
    
    /**
     * ✅ Similar methods for Supervisor and Intern
     */
    private void fetchSupervisorDepartment(Long userId, UserDTO userDTO) {
        Supervisor supervisor = supervisorRepository.findByUserIdWithDepartment(userId)
            .orElse(null);
        if (supervisor != null && supervisor.getDepartment() != null) {
            userDTO.setDepartment(supervisor.getDepartment().getName());
            userDTO.setDepartmentId(supervisor.getDepartment().getId());
        }
    }
    
    private void fetchInternDepartment(Long userId, UserDTO userDTO) {
        Intern intern = internRepository.findByUserIdWithDepartment(userId)
            .orElse(null);
        if (intern != null && intern.getDepartment() != null) {
            userDTO.setDepartment(intern.getDepartment().getName());
            userDTO.setDepartmentId(intern.getDepartment().getId());
        }
    }
}
```

---

## Quick Fix Summary

### 3 Critical Changes:

1. **Update Login Endpoint:**
   ```java
   // ✅ After authentication, fetch admin from database
   Admin admin = adminRepository.findByUserIdWithDepartment(user.getId());
   
   // ✅ Get department
   if (admin != null && admin.getDepartment() != null) {
       userDTO.setDepartment(admin.getDepartment().getName());
       userDTO.setDepartmentId(admin.getDepartment().getId());
   }
   ```

2. **Update Admin Repository:**
   ```java
   @Query("SELECT a FROM Admin a LEFT JOIN FETCH a.department WHERE a.user.id = :userId")
   Optional<Admin> findByUserIdWithDepartment(@Param("userId") Long userId);
   ```

3. **Update Admin Entity:**
   ```java
   @ManyToOne(fetch = FetchType.EAGER) // ✅ Always load department
   @JoinColumn(name = "department_id")
   private Department department;
   ```

---

## Testing

After implementing:

1. **Test Login:**
   ```bash
   POST /api/auth/login
   {
     "email": "admin@univen.ac.za",
     "password": "password"
   }
   ```

2. **Verify Response:**
   ```json
   {
     "token": "...",
     "user": {
       "id": 1,
       "email": "admin@univen.ac.za",
       "role": "ADMIN",
       "department": "HR",        // ✅ Should be present
       "departmentId": 2           // ✅ Should be present
     }
   }
   ```

3. **Check Database:**
   ```sql
   SELECT a.*, d.name as department_name 
   FROM admins a 
   LEFT JOIN departments d ON a.department_id = d.department_id 
   WHERE a.email = 'admin@univen.ac.za';
   ```

---

**Once the backend implements these fixes, the frontend will automatically receive the department information!**

