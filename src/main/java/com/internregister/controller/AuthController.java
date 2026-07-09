package com.internregister.controller;

import com.internregister.entity.User;
import com.internregister.entity.Intern;
import com.internregister.entity.Admin;
import com.internregister.entity.Department;
import com.internregister.entity.Supervisor;
import com.internregister.repository.UserRepository;
import com.internregister.repository.InternRepository;
import com.internregister.repository.AdminRepository;
import com.internregister.repository.DepartmentRepository;
import com.internregister.repository.SupervisorRepository;
import com.internregister.security.JwtTokenProvider;
import com.internregister.service.UserService;
import com.internregister.service.NotificationService;
import com.internregister.service.EmailVerificationService;
import com.internregister.service.ActivityLogService;
import com.internregister.security.PasswordValidator;
import com.internregister.security.RateLimitingService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import jakarta.servlet.http.HttpServletRequest;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@CrossOrigin(origins = "*")
@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final UserService userService;
    private final JwtTokenProvider jwtTokenProvider;
    private final UserRepository userRepository;
    private final InternRepository internRepository;
    private final AdminRepository adminRepository;
    private final DepartmentRepository departmentRepository;
    private final SupervisorRepository supervisorRepository;
    private final EmailVerificationService emailVerificationService;
    private final PasswordValidator passwordValidator;
    private final RateLimitingService rateLimitingService;
    private final NotificationService notificationService;
    private final ActivityLogService activityLogService;
    private final com.internregister.service.InternService internService;
    private final PasswordEncoder passwordEncoder;

    @org.springframework.beans.factory.annotation.Autowired
    private com.internregister.service.IdVerificationService idVerificationService;

    @org.springframework.beans.factory.annotation.Autowired
    private com.internregister.service.FaceDescriptorService faceDescriptorService;

    @org.springframework.beans.factory.annotation.Autowired
    private org.springframework.core.env.Environment env;

    public AuthController(UserService userService, JwtTokenProvider jwtTokenProvider, UserRepository userRepository,
            InternRepository internRepository, AdminRepository adminRepository,
            DepartmentRepository departmentRepository,
            SupervisorRepository supervisorRepository, EmailVerificationService emailVerificationService,
            PasswordValidator passwordValidator, RateLimitingService rateLimitingService,
            NotificationService notificationService, ActivityLogService activityLogService,
            com.internregister.service.InternService internService) {
        this.passwordEncoder = new BCryptPasswordEncoder();
        this.userService = userService;
        this.jwtTokenProvider = jwtTokenProvider;
        this.userRepository = userRepository;
        this.internRepository = internRepository;
        this.adminRepository = adminRepository;
        this.departmentRepository = departmentRepository;
        this.supervisorRepository = supervisorRepository;
        this.emailVerificationService = emailVerificationService;
        this.passwordValidator = passwordValidator;
        this.rateLimitingService = rateLimitingService;
        this.notificationService = notificationService;
        this.activityLogService = activityLogService;
        this.internService = internService;
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> body, HttpServletRequest request) {
        String username = body.get("username");
        String password = body.get("password");
        String clientIp = getClientIpAddress(request);

        // Check rate limiting
        if (rateLimitingService.isLockedOut(clientIp)) {
            long remainingSeconds = rateLimitingService.getRemainingLockoutSeconds(clientIp);
            System.out.println(
                    "⚠ Login blocked: IP " + clientIp + " is locked out. Remaining: " + remainingSeconds + " seconds");
            return ResponseEntity.status(429).body(Map.of(
                    "error",
                    "Too many failed login attempts. Please try again in " + (remainingSeconds / 60) + " minutes.",
                    "lockoutSeconds", remainingSeconds));
        }

        // Validate input
        if (username == null || username.trim().isEmpty() || password == null || password.trim().isEmpty()) {
            System.out.println("✗ Login attempt failed: Missing username or password");
            rateLimitingService.recordFailedAttempt(clientIp);
            return ResponseEntity.status(400).body(Map.of("error", "Username and password are required"));
        }

        // Find user by username or email
        String searchUsername = username.trim();
        User user = userService.findByUsername(searchUsername).orElse(null);

        // If not found by username, try by email
        if (user == null) {
            user = userService.findByEmail(searchUsername).orElse(null);
        }

        // If not found by email, try by staff number
        if (user == null) {
            user = userService.findByStaffNumber(searchUsername).orElse(null);
        }

        // If still not found and doesn't contain '@', try with default Univen domains
        // (e.g. for staff/student numbers)
        if (user == null && !searchUsername.contains("@")) {
            user = userService.findByUsername(searchUsername + "@univen.ac.za").orElse(null);
            if (user == null) {
                user = userService.findByUsername(searchUsername + "@mvula.univen.ac.za").orElse(null);
            }
            if (user == null) {
                user = userService.findByEmail(searchUsername + "@univen.ac.za").orElse(null);
            }
        }

        if (user == null) {
            System.out.println("🔍 User not found locally, trying Univen API fallback for: " + searchUsername);
            try {
                Map<String, Object> univenData = checkUnivenAuth(searchUsername, password);
                if (univenData != null) {
                    // Check if student API data is returned (Students must sign up first)
                    boolean isStudent = univenData.containsKey("student") && univenData.get("student") != null;
                    if (isStudent) {
                        System.out.println("⛔ Login denied: Student/Intern has not signed up - " + searchUsername);
                        rateLimitingService.recordFailedAttempt(clientIp);
                        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of(
                                "error", "Access Denied",
                                "message",
                                "Your Univen student credentials are valid, but you have not registered on this system yet. Please sign up/register first."));
                    }

                    user = provisionUserFromExternal(univenData, password);
                    if (user == null) {
                        // provisionUserFromExternal returned null = staff not pre-registered
                        System.out.println("⛔ Login denied: Staff not pre-registered - " + searchUsername);
                        rateLimitingService.recordFailedAttempt(clientIp);
                        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of(
                                "error", "Access Denied",
                                "message",
                                "Your Univen credentials are valid, but your account has not been set up in this system. Please contact your Super Admin to have your account created."));
                    }
                }
            } catch (Exception e) {
                System.err.println("❌ Univen API authentication error: " + e.getMessage());
            }
        } else if (!userService.checkPassword(password, user.getPassword())) {
            System.out.println("🔍 Local password mismatch, checking Univen API for recent updates: " + searchUsername);
            try {
                Map<String, Object> univenData = checkUnivenAuth(searchUsername, password);
                if (univenData != null) {
                    System.out.println("✅ Univen API verified password. Updating local password.");
                    user.setPassword(passwordEncoder.encode(password));

                    // ✅ Confirm and update profile from Univen data
                    updateProfileFromExternal(user, univenData);

                    userRepository.save(user);
                } else {
                    System.out.println("✗ Login attempt failed: Invalid password for user - " + username.trim());
                    rateLimitingService.recordFailedAttempt(clientIp);
                    return ResponseEntity.status(401).body(Map.of("error", "Invalid credentials"));
                }
            } catch (Exception e) {
                System.err.println("❌ Univen API authentication error during password sync: " + e.getMessage());
                rateLimitingService.recordFailedAttempt(clientIp);
                return ResponseEntity.status(401).body(Map.of("error", "Invalid credentials"));
            }
        }

        if (user == null) {
            System.out.println("✗ Login attempt failed: User not found - " + username.trim());
            rateLimitingService.recordFailedAttempt(clientIp);
            return ResponseEntity.status(401).body(Map.of("error", "Invalid credentials"));
        }

        // Check if user is active
        if (user.getActive() == null || !user.getActive()) {
            System.out.println("✗ Login attempt blocked: User account is inactive - " + username.trim());
            rateLimitingService.recordFailedAttempt(clientIp);
            return ResponseEntity.status(403).body(Map.of(
                    "error", "Account is inactive",
                    "message", "Your account has been deactivated. Please contact an administrator."));
        }

        // Successful login - clear rate limiting
        rateLimitingService.clearAttempts(clientIp);

        // Check for first-time login and notify accordingly
        if (user.getLastLoginAt() == null) {
            if (user.getRole() == User.Role.ADMIN) {
                String msg = "Admin " + user.getUsername() + " has logged in for the first time.";
                notificationService.notifySuperAdmins(msg, "/super-admin/super-admin-dashboard?section=admins",
                        "FIRST_LOGIN_" + user.getId());
            } else if (user.getRole() == User.Role.SUPERVISOR) {
                String msg = "Supervisor " + user.getUsername() + " has logged in for the first time.";
                notificationService.notifyAdmins(msg, "/admin/admin-dashboard?section=supervisors",
                        "FIRST_LOGIN_" + user.getId());
            }
        }

        // Update last login time and session ID
        String newSessionId = java.util.UUID.randomUUID().toString();
        user.setLastLoginAt(java.time.LocalDateTime.now());
        user.setCurrentSessionId(newSessionId);
        userRepository.save(user);

        // Only generate token if password is valid
        System.out.println("✓ Login successful: " + username.trim() + " (Role: " + user.getRole() + ")");
        String token = jwtTokenProvider.createToken(user);

        // Log successful login
        activityLogService.log(user.getUsername(), "LOGIN", "User logged in successfully", clientIp);

        // ✅ CRITICAL: Fetch department from database based on user role
        // Build response with user object (matching frontend expectations)
        Map<String, Object> userData = new java.util.HashMap<>();
        userData.put("id", user.getId());
        userData.put("username", user.getUsername());
        userData.put("email", user.getEmail() != null ? user.getEmail() : user.getUsername());
        userData.put("role", user.getRole().name());
        userData.put("requiresPasswordChange", user.getRequiresPasswordChange());
        if (user.getStaffNumber() != null) {
            userData.put("staffNumber", user.getStaffNumber());
        }

        // Include face enrollment status for interns
        if (user.getRole() == User.Role.INTERN) {
            boolean hasFace = internService.getInternEntityByEmail(user.getEmail())
                    .map(internService::hasFaceData)
                    .orElse(false);
            userData.put("hasFaceData", hasFace);
        }

        // ✅ Fetch department information from database
        fetchDepartmentInfo(user, userData);

        Map<String, Object> response = new java.util.HashMap<>();
        response.put("token", token);
        response.put("user", userData);

        return ResponseEntity.ok(response);
    }

    private String getClientIpAddress(HttpServletRequest request) {
        String xForwardedFor = request.getHeader("X-Forwarded-For");
        if (xForwardedFor != null && !xForwardedFor.isEmpty()) {
            return xForwardedFor.split(",")[0].trim();
        }
        String xRealIp = request.getHeader("X-Real-IP");
        if (xRealIp != null && !xRealIp.isEmpty()) {
            return xRealIp;
        }
        return request.getRemoteAddr();
    }

    @GetMapping("/me")
    public ResponseEntity<?> getCurrentUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated() ||
                "anonymousUser".equals(authentication.getPrincipal())) {
            return ResponseEntity.status(401).body(Map.of("error", "Not authenticated"));
        }

        String username = authentication.getName();
        Optional<User> userOpt = userService.findByUsername(username);

        if (userOpt.isEmpty()) {
            return ResponseEntity.status(404).body(Map.of("error", "User not found"));
        }

        User user = userOpt.get();

        // ✅ CRITICAL: Fetch department from database
        Map<String, Object> userData = new java.util.HashMap<>();
        userData.put("id", user.getId());
        userData.put("username", user.getUsername());
        userData.put("email", user.getEmail() != null ? user.getEmail() : user.getUsername());
        userData.put("role", user.getRole().name());
        userData.put("requiresPasswordChange", user.getRequiresPasswordChange());
        if (user.getStaffNumber() != null) {
            userData.put("staffNumber", user.getStaffNumber());
        }

        // Include face enrollment status for interns
        if (user.getRole() == User.Role.INTERN) {
            boolean hasFace = internService.getInternEntityByEmail(user.getEmail())
                    .map(internService::hasFaceData)
                    .orElse(false);
            userData.put("hasFaceData", hasFace);
        }

        // ✅ Fetch department information from database
        fetchDepartmentInfo(user, userData);

        return ResponseEntity.ok(userData);
    }

    @PostMapping("/check-email")
    public ResponseEntity<?> checkEmailExists(@RequestBody Map<String, String> request) {
        String email = request.get("email");
        if (email == null || email.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Email is required"));
        }
        String trimmedEmail = email.trim().toLowerCase();

        // Validate email domain
        if (!trimmedEmail.endsWith("@univen.ac.za")) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of(
                    "exists", false,
                    "error", "Invalid email domain",
                    "message",
                    "Only University of Venda (@univen.ac.za) email addresses are allowed for registration."));
        }

        boolean exists = userRepository.existsByUsername(trimmedEmail) ||
                (userRepository.existsByEmail(trimmedEmail));
        if (exists) {
            return ResponseEntity.ok(Map.of("exists", true, "message", "Email already registered"));
        } else {
            return ResponseEntity.ok(Map.of("exists", false, "message", "Email is available"));
        }
    }

    @PostMapping("/send-verification-code")
    public ResponseEntity<?> sendVerificationCode(@RequestBody Map<String, String> body) {
        String email = body.get("email");
        if (email == null || email.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Email is required"));
        }

        try {
            String code = emailVerificationService.generateAndStoreCode(email.trim());
            return ResponseEntity.ok(Map.of(
                    "message", "Verification code sent to " + email,
                    "code", code // Remove this in production - only for testing
            ));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", "Failed to send verification code"));
        }
    }

    @PostMapping("/verify-code")
    public ResponseEntity<?> verifyCode(@RequestBody Map<String, String> body) {
        String email = body.get("email");
        String code = body.get("code");

        if (email == null || code == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Email and code are required"));
        }

        boolean isValid = emailVerificationService.verifyCode(email.trim(), code.trim());
        if (isValid) {
            return ResponseEntity.ok(Map.of("valid", true, "message", "Code verified successfully"));
        } else {
            return ResponseEntity.status(400).body(Map.of("valid", false, "error", "Invalid verification code"));
        }
    }

    @PostMapping("/verify-id")
    public ResponseEntity<?> verifyIdNumber(@RequestBody Map<String, String> body) {
        String idNumber = body.get("idNumber");
        if (idNumber == null || idNumber.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("valid", false, "message", "ID number is required"));
        }
        Map<String, Object> verificationResult = idVerificationService.verifySouthAfricanId(idNumber.trim());
        if ((Boolean) verificationResult.get("valid")) {
            return ResponseEntity.ok(verificationResult);
        } else {
            return ResponseEntity.status(400).body(verificationResult);
        }
    }

    @PostMapping("/univen-data")
    public ResponseEntity<?> getUnivenData(@RequestBody Map<String, String> body) {
        String username = body.get("username");
        String password = body.get("password");

        if (username == null || password == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Username and password are required"));
        }

        try {
            // Use the existing AuthService logic to check external Univen API
            // I'll replicate the logic here or call a service
            Map<String, Object> univenData = checkUnivenAuth(username, password);
            if (univenData != null) {
                return ResponseEntity.ok(univenData);
            } else {
                return ResponseEntity.status(401).body(Map.of("error", "Invalid Univen credentials"));
            }
        } catch (Exception e) {
            return ResponseEntity.status(500)
                    .body(Map.of("error", "Failed to connect to Univen API: " + e.getMessage()));
        }
    }

    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody Map<String, Object> request) {
        try {
            String email = (String) request.get("username");
            String verificationCode = (String) request.get("verificationCode");
            String password = (String) request.get("password");
            String roleStr = (String) request.get("role");

            // Validate email
            if (email == null || email.trim().isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Email is required"));
            }

            // Validate email format
            if (!email.matches("^[A-Za-z0-9+_.-]+@(.+)$")) {
                return ResponseEntity.badRequest().body(Map.of("error", "Invalid email format"));
            }

            // Validate verification code
            if (verificationCode == null || verificationCode.trim().isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Verification code is required"));
            }

            // Verify the code (Bypass for Univen auto-provisioning)
            if (!"UNIVEN".equals(verificationCode.trim())) {
                if (!emailVerificationService.verifyCode(email.trim(), verificationCode.trim())) {
                    return ResponseEntity.status(400).body(Map.of("error", "Invalid verification code"));
                }
            }

            // Validate password
            if (password == null || password.trim().isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Password is required"));
            }

            // Validate role first (needed for role-based password validation)
            if (roleStr == null || roleStr.trim().isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Role is required"));
            }

            // Validate role format
            User.Role role;
            try {
                role = User.Role.valueOf(roleStr.toUpperCase());
            } catch (IllegalArgumentException e) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Invalid role. Must be SUPERVISOR or INTERN"));
            }

            // Restrict ADMIN and SUPERVISOR registration - Staff must be created by
            // SuperAdmin/Admin only
            if (role == User.Role.ADMIN || role == User.Role.SUPERVISOR) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN)
                        .body(Map.of("error",
                                "Staff registration is restricted. Please contact your Administrator to have your account created."));
            }

            // Secure Gate: Prevent automatic/bypassed student registration during login
            // fallback
            if (role == User.Role.INTERN && "UNIVEN".equals(verificationCode.trim())) {
                System.out
                        .println("⛔ SECURITY ALERT: Intern/Student registration via UNIVEN code blocked for: " + email);
                return ResponseEntity.status(HttpStatus.FORBIDDEN)
                        .body(Map.of("error", "Access Denied",
                                "message",
                                "Auto-registration is not allowed for students. Please register/sign up first using a verification code sent to your email."));
            }

            // Validate password strength (role-based validation)
            System.out.println("🔍 Validating password strength for role: " + role);
            PasswordValidator.PasswordValidationResult passwordValidation = passwordValidator.validate(password, role);
            if (!passwordValidation.isValid()) {
                System.out.println("❌ Password validation failed: " + passwordValidation.getErrorMessage());
                return ResponseEntity.badRequest().body(Map.of("error", passwordValidation.getErrorMessage()));
            }
            System.out.println("✅ Password strength validated");

            User user = new User();
            user.setUsername(email.trim());
            user.setEmail(email.trim());
            PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
            user.setPassword(passwordEncoder.encode(password));
            user.setRole(role);

            // Interns must be approved by Admin/Supervisor before they can log in
            if (role == User.Role.INTERN) {
                user.setActive(false);
                System.out.println("⚠ Intern account created as INACTIVE (Pending Approval)");
            } else {
                // Supervisors and others are active by default
                user.setActive(true);
            }

            System.out.println("🔍 Checking if username already exists: " + user.getUsername());
            if (userRepository.findByUsername(user.getUsername()).stream().findFirst().isPresent()) {
                System.out.println("❌ Registration failed: Username already exists");
                return ResponseEntity.badRequest().body(Map.of("error", "Username already exists"));
            }

            System.out.println("🔍 Saving user to database...");
            User savedUser = userService.saveUser(user);
            System.out.println("✓ New user registered and saved to database:");
            System.out.println("  Username: " + savedUser.getUsername());
            System.out.println("  Role: " + savedUser.getRole());
            System.out.println("  ID: " + savedUser.getId());

            // Log registration
            activityLogService.log(savedUser.getUsername(), "REGISTER", "New user registered as " + savedUser.getRole(),
                    request.get("clientIp") != null ? (String) request.get("clientIp") : "unknown");

            // Auto-create profile based on role
            if (savedUser.getRole() == User.Role.INTERN) {
                createInternProfile(savedUser, request);
            } else if (savedUser.getRole() == User.Role.SUPERVISOR) {
                createSupervisorProfile(savedUser, request);
            } else if (savedUser.getRole() == User.Role.ADMIN) {
                createAdminProfile(savedUser, request);
            }

            // Clear verification code after successful registration
            emailVerificationService.removeCode(email.trim());

            return ResponseEntity.ok(Map.of(
                    "message", "User registered successfully",
                    "userId", savedUser.getId().toString(),
                    "role", savedUser.getRole().name()));
        } catch (Exception e) {
            System.err.println("Error registering user: " + e.getMessage());
            e.printStackTrace();
            return ResponseEntity.status(500).body(Map.of("error", "Failed to register user: " + e.getMessage()));
        }
    }

    private void createInternProfile(User user, Map<String, Object> request) {
        try {
            // DEBUG: Log all request keys to see what's being sent
            System.out.println("🔍 DEBUG - Registration request keys: " + request.keySet());
            System.out.println("🔍 DEBUG - Full request data: " + request);

            // Check if intern already exists
            Optional<Intern> existingIntern = internRepository.findByEmail(user.getUsername()).stream().findFirst();
            if (existingIntern.isPresent()) {
                System.out.println("Intern profile already exists for: " + user.getUsername());
                return;
            }

            String name = (String) request.getOrDefault("name", user.getUsername().split("@")[0]);
            String surname = (String) request.getOrDefault("surname", "");
            String fullName = surname.isEmpty() ? name : name + " " + surname;

            // Get departmentId from request (preferred) or fallback to department name
            Department department;
            Object deptIdObj = request.get("departmentId");
            if (deptIdObj != null) {
                // Try to parse departmentId as number
                Long departmentId = null;
                if (deptIdObj instanceof Number) {
                    departmentId = ((Number) deptIdObj).longValue();
                } else if (deptIdObj instanceof String) {
                    try {
                        departmentId = Long.parseLong((String) deptIdObj);
                    } catch (NumberFormatException e) {
                        System.out.println("⚠ Invalid departmentId format: " + deptIdObj);
                    }
                }

                if (departmentId != null) {
                    Optional<Department> deptOpt = departmentRepository.findById(departmentId);
                    if (deptOpt.isPresent()) {
                        department = deptOpt.get();
                        System.out.println(
                                "✓ Found department by ID: " + department.getName() + " (ID: " + departmentId + ")");
                    } else {
                        System.out.println("⚠ Department not found with ID: " + departmentId);
                        // Fallback to department name
                        String departmentName = (String) request.getOrDefault("department", "ICT");
                        department = departmentRepository.findByName(departmentName)
                                .orElseGet(() -> {
                                    Department dept = new Department();
                                    dept.setName(departmentName);
                                    Department saved = departmentRepository.save(dept);
                                    System.out.println("✓ Created department: " + departmentName);
                                    return saved;
                                });
                    }
                } else {
                    // Fallback to department name
                    String departmentName = (String) request.getOrDefault("department", "ICT");
                    department = departmentRepository.findByName(departmentName)
                            .orElseGet(() -> {
                                Department dept = new Department();
                                dept.setName(departmentName);
                                Department saved = departmentRepository.save(dept);
                                System.out.println("✓ Created department: " + departmentName);
                                return saved;
                            });
                }
            } else {
                // Fallback to department name
                String departmentName = (String) request.getOrDefault("department", "ICT");
                department = departmentRepository.findByName(departmentName)
                        .orElseGet(() -> {
                            Department dept = new Department();
                            dept.setName(departmentName);
                            Department saved = departmentRepository.save(dept);
                            System.out.println("✓ Created department: " + departmentName);
                            return saved;
                        });
            }

            // Get field from request
            final String field;
            Object fieldObj = request.get("field");
            if (fieldObj != null) {
                String fieldValue = fieldObj.toString().trim();
                field = fieldValue.isEmpty() ? null : fieldValue;
            } else {
                field = null;
            }

            // Get employer from request (can be "employer" or "employerName")
            final String employer;
            Object employerObj = request.get("employer");
            System.out.println("🔍 DEBUG - employer key value: " + employerObj);
            if (employerObj == null) {
                employerObj = request.get("employerName"); // Try alternative property name
                System.out.println("🔍 DEBUG - employerName key value: " + employerObj);
            }
            if (employerObj != null) {
                String employerValue = employerObj.toString().trim();
                employer = employerValue.isEmpty() ? null : employerValue;
                System.out.println("🔍 DEBUG - Extracted employer value: '" + employer + "'");
            } else {
                employer = null;
                System.out.println(
                        "⚠️  WARNING - No employer found in request! Checked keys: 'employer' and 'employerName'");
            }

            // Get ID number from request
            final String idNumber;
            Object idNumberObj = request.get("idNumber");
            if (idNumberObj != null) {
                String idNumberValue = idNumberObj.toString().trim();
                idNumber = idNumberValue.isEmpty() ? null : idNumberValue;
            } else {
                idNumber = null;
            }

            // Get passport number from request (international interns)
            final String passportNumber;
            Object passportObj = request.get("passportNumber");
            if (passportObj != null) {
                String passportValue = passportObj.toString().trim();
                passportNumber = passportValue.isEmpty() ? null : passportValue;
            } else {
                passportNumber = null;
            }

            // Get start date from request
            java.time.LocalDate startDate = null;
            Object startDateObj = request.get("startDate");
            if (startDateObj != null) {
                if (startDateObj instanceof String) {
                    try {
                        startDate = java.time.LocalDate.parse((String) startDateObj);
                    } catch (Exception e) {
                        System.out.println("⚠ Invalid startDate format: " + startDateObj);
                    }
                }
            }

            // Get end date from request
            java.time.LocalDate endDate = null;
            Object endDateObj = request.get("endDate");
            if (endDateObj != null) {
                if (endDateObj instanceof String) {
                    try {
                        endDate = java.time.LocalDate.parse((String) endDateObj);
                    } catch (Exception e) {
                        System.out.println("⚠ Invalid endDate format: " + endDateObj);
                    }
                }
            }

            // ✅ AUTOMATIC SUPERVISOR ASSIGNMENT
            // Find supervisor based on department and field
            final Long finalDeptId = department.getDepartmentId();
            Supervisor supervisor = null;

            // Step 1: If field is specified, try to find supervisor with same field in same
            // department
            if (field != null && !field.isEmpty()) {
                Optional<Supervisor> supervisorOpt = supervisorRepository.findByDepartmentIdAndField(finalDeptId,
                        field).stream().findFirst();
                if (supervisorOpt.isPresent()) {
                    supervisor = supervisorOpt.get();
                    System.out.println("✓ Found supervisor with matching field: " + supervisor.getName() + " (Field: "
                            + field + ")");
                }
            }

            // Step 2: If no supervisor found by field, get first supervisor in department
            if (supervisor == null) {
                Optional<Supervisor> supervisorOpt = supervisorRepository.findByDepartmentIdOrdered(finalDeptId)
                        .stream().findFirst();
                if (supervisorOpt.isPresent()) {
                    supervisor = supervisorOpt.get();
                    System.out.println("✓ Found first supervisor in department: " + supervisor.getName());
                }
            }

            // Step 3: If still no supervisor, create default supervisor for the department
            if (supervisor == null) {
                Supervisor defaultSupervisor = new Supervisor();
                defaultSupervisor.setName("Default Supervisor - " + department.getName());
                String deptNameLower = department.getName().toLowerCase().replace(" ", "").replace("-", "");
                defaultSupervisor.setEmail("supervisor@" + deptNameLower + ".univen.ac.za");
                defaultSupervisor.setDepartment(department);
                if (field != null && !field.isEmpty()) {
                    defaultSupervisor.setField(field);
                }
                supervisor = supervisorRepository.save(defaultSupervisor);
                System.out.println("✓ Created default supervisor for department: " + department.getName() + " (Email: "
                        + defaultSupervisor.getEmail() + ")");
            }

            // Determine if profile is complete (Univen auto-provisioning needs more info)
            String verificationCode = (String) request.get("verificationCode");
            boolean isUniven = "UNIVEN".equals(verificationCode);

            // Create intern
            System.out.println("🔍 Creating Intern entity for: " + user.getUsername());
            Intern intern = new Intern();
            intern.setIsProfileComplete(!isUniven);
            intern.setName(fullName);
            intern.setEmail(user.getUsername());
            intern.setDepartment(department);
            intern.setSupervisor(supervisor);
            if (field != null && !field.isEmpty()) {
                intern.setField(field);
            }
            if (employer != null && !employer.isEmpty()) {
                intern.setEmployer(employer);
            }
            if (idNumber != null && !idNumber.isEmpty()) {
                intern.setIdNumber(idNumber);
            }
            if (passportNumber != null && !passportNumber.isEmpty()) {
                intern.setPassportNumber(passportNumber);
                System.out.println("✓ Assigned passport number for international intern: " + passportNumber);
            }
            if (startDate != null) {
                intern.setStartDate(startDate);
            }
            if (endDate != null) {
                intern.setEndDate(endDate);
            }

            // Get contract agreement from request
            Object contractAgreementObj = request.get("contractAgreement");
            if (contractAgreementObj != null) {
                String contractAgreementValue = contractAgreementObj.toString().trim();
                if (!contractAgreementValue.isEmpty()) {
                    com.internregister.entity.InternContract contract = new com.internregister.entity.InternContract();
                    contract.setIntern(intern);
                    contract.setContractAgreement(contractAgreementValue);
                    intern.setContractDocument(contract);
                    System.out.println("✓ Assigned contract agreement base64 string.");
                }
            }

            // New intern profiles are inactive by default until approved
            intern.setActive(false);

            Intern savedIntern = internRepository.save(intern);
            System.out.println("✓ Intern profile created and saved to database:");
            System.out.println("  Name: " + savedIntern.getName());
            System.out.println("  Email: " + savedIntern.getEmail());
            System.out.println("  Department: " + department.getName() + " (ID: " + department.getDepartmentId() + ")");
            System.out
                    .println("  Field: " + (savedIntern.getField() != null ? savedIntern.getField() : "Not specified"));
            System.out.println(
                    "  Employer: " + (savedIntern.getEmployer() != null ? savedIntern.getEmployer() : "Not specified"));
            System.out.println("  Supervisor: " + supervisor.getName());
            System.out.println("  Intern ID: " + savedIntern.getInternId());

            // Notify Admins
            notificationService.notifyAdmins("New Intern registered: " + savedIntern.getName(),
                    "/admin/admin-dashboard?section=interns", "NEW_INTERN_" + savedIntern.getInternId());

            // Notify Supervisor
            if (savedIntern.getSupervisor() != null) {
                java.util.List<Supervisor> supervisors = new java.util.ArrayList<>();
                supervisors.add(savedIntern.getSupervisor());
                notificationService.notifySupervisors(supervisors, "New Intern registered: " + savedIntern.getName(),
                        "/supervisor/supervisor-dashboard?section=interns", "NEW_INTERN_" + savedIntern.getInternId());
            }
        } catch (Exception e) {
            System.err.println("Error creating intern profile: " + e.getMessage());
            e.printStackTrace();
        }
    }

    private void createSupervisorProfile(User user, Map<String, Object> request) {
        try {
            // Check if supervisor already exists (by email or staff number)
            Optional<Supervisor> existingSupervisor = supervisorRepository.findByEmail(user.getUsername()).stream()
                    .findFirst();
            if (existingSupervisor.isEmpty() && user.getStaffNumber() != null) {
                existingSupervisor = supervisorRepository.findByStaffNumber(user.getStaffNumber()).stream().findFirst();
            }

            if (existingSupervisor.isPresent()) {
                System.out.println("Supervisor profile already exists for: " + user.getUsername() +
                        (user.getStaffNumber() != null ? " (Staff: " + user.getStaffNumber() + ")" : ""));
                return;
            }

            String name = (String) request.getOrDefault("name", user.getUsername().split("@")[0]);
            String surname = (String) request.getOrDefault("surname", "");
            String fullName = surname.isEmpty() ? name : name + " " + surname;

            // Get departmentId from request (preferred) or fallback to department name
            Department department = null;
            Object deptIdObj = request.get("departmentId");
            if (deptIdObj != null) {
                // Try to parse departmentId as number
                Long departmentId = null;
                if (deptIdObj instanceof Number) {
                    departmentId = ((Number) deptIdObj).longValue();
                } else if (deptIdObj instanceof String) {
                    try {
                        departmentId = Long.parseLong((String) deptIdObj);
                    } catch (NumberFormatException e) {
                        System.out.println("⚠ Invalid departmentId format: " + deptIdObj);
                    }
                }

                if (departmentId != null) {
                    Optional<Department> deptOpt = departmentRepository.findById(departmentId);
                    if (deptOpt.isPresent()) {
                        department = deptOpt.get();
                        System.out.println(
                                "✓ Found department by ID: " + department.getName() + " (ID: " + departmentId + ")");
                    } else {
                        System.out.println("⚠ Department not found with ID: " + departmentId);
                    }
                }
            }

            // Fallback to department name if departmentId not provided or not found
            if (department == null) {
                String departmentName = (String) request.getOrDefault("department", "ICT");
                department = departmentRepository.findByName(departmentName)
                        .orElseGet(() -> {
                            Department dept = new Department();
                            dept.setName(departmentName);
                            Department saved = departmentRepository.save(dept);
                            System.out.println("✓ Created department: " + departmentName);
                            return saved;
                        });
            }

            // Get field from request
            String field = null;
            Object fieldObj = request.get("field");
            if (fieldObj != null) {
                field = fieldObj.toString().trim();
                if (field.isEmpty()) {
                    field = null;
                }
            }

            // Create supervisor
            Supervisor supervisor = new Supervisor();
            supervisor.setName(fullName);
            supervisor.setEmail(user.getUsername());
            supervisor.setDepartment(department);
            if (user.getStaffNumber() != null) {
                supervisor.setStaffNumber(user.getStaffNumber());
            }
            if (field != null && !field.isEmpty()) {
                supervisor.setField(field);
            }

            Supervisor savedSupervisor = supervisorRepository.save(supervisor);
            System.out.println("✓ Supervisor profile created and saved to database:");
            System.out.println("  Name: " + savedSupervisor.getName());
            System.out.println("  Email: " + savedSupervisor.getEmail());
            System.out.println("  Department: " + department.getName());
            System.out.println("  Supervisor ID: " + savedSupervisor.getSupervisorId());
        } catch (Exception e) {
            System.err.println("Error creating supervisor profile: " + e.getMessage());
            e.printStackTrace();
        }
    }

    private void createAdminProfile(User user, Map<String, Object> request) {
        try {
            // Check if admin already exists (by email or staff number)
            Optional<Admin> existingAdmin = adminRepository.findByEmail(user.getUsername()).stream().findFirst();
            if (existingAdmin.isEmpty() && user.getStaffNumber() != null) {
                existingAdmin = adminRepository.findByStaffNumber(user.getStaffNumber()).stream().findFirst();
            }

            if (existingAdmin.isPresent()) {
                System.out.println("Admin profile already exists for: " + user.getUsername() +
                        (user.getStaffNumber() != null ? " (Staff: " + user.getStaffNumber() + ")" : ""));
                return;
            }

            String name = (String) request.getOrDefault("name", user.getUsername().split("@")[0]);
            String surname = (String) request.getOrDefault("surname", "");
            String fullName = surname.isEmpty() ? name : name + " " + surname;

            // Get department from request
            Department department = null;
            String departmentName = (String) request.get("department");
            if (departmentName != null && !departmentName.trim().isEmpty()) {
                department = departmentRepository.findByName(departmentName.trim())
                        .orElseGet(() -> {
                            Department dept = new Department();
                            dept.setName(departmentName.trim());
                            Department saved = departmentRepository.save(dept);
                            System.out.println("✓ Created department: " + departmentName.trim());
                            return saved;
                        });
            }

            // Create admin
            Admin admin = new Admin();
            admin.setName(fullName);
            admin.setEmail(user.getUsername());
            admin.setDepartment(department);
            if (user.getStaffNumber() != null) {
                admin.setStaffNumber(user.getStaffNumber());
            }

            Admin savedAdmin = adminRepository.save(admin);
            System.out.println("✓ Admin profile created and saved to database:");
            System.out.println("  Name: " + savedAdmin.getName());
            System.out.println("  Email: " + savedAdmin.getEmail());
            System.out.println("  Department: " + (department != null ? department.getName() : "None"));
            System.out.println("  Admin ID: " + savedAdmin.getAdminId());

            // ✅ Auto-create default supervisor if department is set and has no supervisor
            if (department != null) {
                java.util.List<com.internregister.entity.Supervisor> deptSups = supervisorRepository
                        .findByDepartmentId(department.getDepartmentId());
                if (deptSups.isEmpty()) {
                    String deptCleanName = department.getName().toLowerCase().replaceAll("[^a-zA-Z0-9]", "");
                    String supervisorEmail = "supervisor_" + deptCleanName + "@univen.ac.za";

                    // Default supervisor email for standard ICT department
                    if ("ictdepartment".equals(deptCleanName)) {
                        supervisorEmail = "supervisor@univen.ac.za";
                    }

                    if (userRepository.findByUsername(supervisorEmail).isEmpty()) {
                        // Create User account
                        User supUser = new User();
                        supUser.setUsername(supervisorEmail);
                        supUser.setEmail(supervisorEmail);
                        supUser.setPassword(passwordEncoder.encode("supervisor123"));
                        supUser.setRole(User.Role.SUPERVISOR);
                        supUser.setActive(true);
                        userRepository.save(supUser);

                        // Create Supervisor profile
                        Supervisor supervisor = new Supervisor();
                        supervisor.setName("Default Supervisor - " + department.getName());
                        supervisor.setEmail(supervisorEmail);
                        supervisor.setStaffNumber("SUP-" + department.getDepartmentId() + "-DFT");
                        supervisor.setDepartment(department);
                        supervisor.setField("Software Development");
                        supervisorRepository.save(supervisor);
                        System.out.println("✓ Auto-created default Supervisor user/profile for department: "
                                + department.getName() + " (Email: " + supervisorEmail + ", Password: supervisor123)");
                    }
                }
            }
        } catch (Exception e) {
            System.err.println("Error creating admin profile: " + e.getMessage());
            e.printStackTrace();
        }
    }

    @PostMapping("/forgot-password")
    public ResponseEntity<?> forgotPassword(@RequestBody Map<String, String> body) {
        String email = body.get("email");

        if (email == null || email.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Email is required"));
        }

        String trimmedEmail = email.trim().toLowerCase();

        // Validate email domain
        if (!trimmedEmail.endsWith("@univen.ac.za")) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of(
                    "error", "Invalid email domain",
                    "message", "Only University of Venda (@univen.ac.za) email addresses are allowed."));
        }

        // Generate and send verification code (always generate for testing, even if
        // user doesn't exist)
        try {
            String code = emailVerificationService.generateAndStoreCode(trimmedEmail);
            System.out.println("===========================================");
            System.out.println("PASSWORD RESET CODE FOR: " + trimmedEmail);
            System.out.println("CODE: " + code);
            System.out.println("===========================================");

            // Use HashMap to ensure proper JSON structure
            Map<String, Object> response = new HashMap<>();
            response.put("message", "If the email exists, a verification code has been sent.");
            response.put("code", code); // Always include code for testing (remove in production)

            // Log forgot password request
            activityLogService.log(trimmedEmail, "FORGOT_PASSWORD_REQUEST", "User requested password reset code", null);

            return ResponseEntity.ok(response);
        } catch (Exception e) {
            System.err.println("Error generating verification code: " + e.getMessage());
            e.printStackTrace();
            return ResponseEntity.status(500).body(Map.of("error", "Failed to send verification code"));
        }
    }

    @PostMapping("/reset-password")
    public ResponseEntity<?> resetPassword(@RequestBody Map<String, String> body) {
        try {
            String email = body.get("email");
            String code = body.get("code");
            String newPassword = body.get("newPassword");

            System.out.println("===========================================");
            System.out.println("RESET PASSWORD ATTEMPT:");
            System.out.println("Raw email: " + email);
            System.out.println("Raw code: " + code);
            System.out.println("Raw newPassword: " + (newPassword != null ? "***" : "null"));
            System.out.println("===========================================");

            if (email == null || code == null || newPassword == null) {
                System.out.println("❌ Missing required fields - email: " + (email != null) + ", code: " + (code != null)
                        + ", password: " + (newPassword != null));
                return ResponseEntity.badRequest().body(Map.of("error", "Email, code, and new password are required"));
            }

            String trimmedEmail = email.trim().toLowerCase();
            String trimmedCode = code.trim();

            System.out.println("Trimmed email: " + trimmedEmail);
            System.out.println("Trimmed code: '" + trimmedCode + "' (length: " + trimmedCode.length() + ")");

            // Validate email domain
            if (!trimmedEmail.endsWith("@univen.ac.za")) {
                System.out.println("❌ Invalid email domain: " + trimmedEmail);
                return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of(
                        "error", "Invalid email domain",
                        "message", "Only University of Venda (@univen.ac.za) email addresses are allowed."));
            }

            // Verify code
            System.out.println("🔍 Verifying code...");
            boolean isValid = emailVerificationService.verifyCode(trimmedEmail, trimmedCode);
            System.out.println("Code verification result: " + isValid);

            if (!isValid) {
                System.out.println("❌ Code verification failed for: " + trimmedEmail);
                return ResponseEntity.status(400).body(Map.of(
                        "error", "Invalid or expired verification code",
                        "message", "The verification code is invalid or has expired. Please request a new code.",
                        "errorCode", "INVALID_CODE"));
            }

            System.out.println("✅ Code verified successfully for: " + trimmedEmail);

            // Find user - try both username and email lookup
            System.out.println("🔍 Looking up user by username: " + trimmedEmail);
            Optional<User> userOpt = userRepository.findByUsername(trimmedEmail).stream().findFirst();

            if (userOpt.isEmpty()) {
                System.out.println("⚠️ User not found by username, trying email lookup: " + trimmedEmail);
                userOpt = userRepository.findByEmail(trimmedEmail).stream().findFirst();
            }

            if (userOpt.isEmpty()) {
                System.out.println("❌ User not found by username or email: " + trimmedEmail);
                return ResponseEntity.status(404).body(Map.of("error", "User not found"));
            }

            User user = userOpt.get();
            System.out.println("✅ User found: " + user.getUsername() + " (Email: " + user.getEmail() + ", Role: "
                    + user.getRole() + ")");

            // Validate password strength (role-based validation)
            System.out.println("🔍 Validating password strength for role: " + user.getRole());
            PasswordValidator.PasswordValidationResult passwordValidation = passwordValidator.validate(newPassword,
                    user.getRole());
            if (!passwordValidation.isValid()) {
                System.out.println("❌ Password validation failed: " + passwordValidation.getErrorMessage());
                return ResponseEntity.badRequest().body(Map.of("error", passwordValidation.getErrorMessage()));
            }

            System.out.println("✅ Password validation passed");

            // Update password
            System.out.println("🔍 Hashing and updating password...");
            PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
            String hashedPassword = passwordEncoder.encode(newPassword);
            user.setPassword(hashedPassword);
            userRepository.save(user);

            System.out.println("✅ Password reset successful for: " + trimmedEmail);
            System.out.println("===========================================");

            // Log password reset success
            activityLogService.log(trimmedEmail, "PASSWORD_RESET_SUCCESS", "User successfully reset their password",
                    null);

            return ResponseEntity.ok(Map.of("message", "Password reset successfully"));
        } catch (Exception e) {
            System.err.println("❌ EXCEPTION in resetPassword: " + e.getMessage());
            e.printStackTrace();
            return ResponseEntity.status(500).body(Map.of(
                    "error", "An error occurred while resetting password",
                    "message", e.getMessage()));
        }
    }

    private void fetchDepartmentInfo(User user, Map<String, Object> userData) {
        User.Role role = user.getRole();
        String email = user.getEmail() != null ? user.getEmail() : user.getUsername();
        String staffNumber = user.getStaffNumber();

        try {
            if (role == User.Role.ADMIN) {
                // ✅ Fetch admin with department (try staff number first, then email)
                Optional<Admin> adminOpt = Optional.empty();
                if (staffNumber != null && !staffNumber.trim().isEmpty()) {
                    adminOpt = adminRepository.findByStaffNumberWithDepartment(staffNumber).stream().findFirst();
                }

                if (adminOpt.isEmpty()) {
                    adminOpt = adminRepository.findByEmailWithDepartment(email).stream().findFirst();
                }

                if (adminOpt.isPresent()) {
                    Admin admin = adminOpt.get();
                    // ✅ Add name to response
                    userData.put("name", admin.getName());

                    if (admin.getDepartment() != null) {
                        userData.put("department", admin.getDepartment().getName());
                        userData.put("departmentId", admin.getDepartment().getDepartmentId());
                        System.out.println("✅ Admin department loaded: " + admin.getDepartment().getName() + " (ID: "
                                + admin.getDepartment().getDepartmentId() + ")");
                    } else {
                        System.out.println("⚠️ Admin has no department assigned (ID: " + user.getId() + ")");
                    }
                }
            } else if (role == User.Role.SUPERVISOR) {
                // ✅ Fetch supervisor with department (try staff number first, then email)
                Optional<Supervisor> supervisorOpt = Optional.empty();
                if (staffNumber != null && !staffNumber.trim().isEmpty()) {
                    supervisorOpt = supervisorRepository.findByStaffNumberWithDepartment(staffNumber).stream()
                            .findFirst();
                }

                if (supervisorOpt.isEmpty()) {
                    supervisorOpt = supervisorRepository.findByEmailWithDepartment(email).stream().findFirst();
                }

                if (supervisorOpt.isPresent()) {
                    Supervisor supervisor = supervisorOpt.get();
                    // ✅ Add name to response
                    userData.put("name", supervisor.getName());

                    if (supervisor.getDepartment() != null) {
                        userData.put("department", supervisor.getDepartment().getName());
                        userData.put("departmentId", supervisor.getDepartment().getDepartmentId());
                        if (supervisor.getField() != null) {
                            userData.put("field", supervisor.getField());
                        }
                        System.out.println("✅ Supervisor department loaded: " + supervisor.getDepartment().getName()
                                + " (ID: " + supervisor.getDepartment().getDepartmentId() + ")");
                    }
                }
            } else if (role == User.Role.INTERN) {
                // ✅ Fetch intern with department and location
                Optional<Intern> internOpt = internRepository.findByEmailWithDepartment(email).stream().findFirst();
                if (internOpt.isPresent()) {
                    Intern intern = internOpt.get();
                    // ✅ Add name to response
                    userData.put("name", intern.getName());

                    if (intern.getDepartment() != null) {
                        userData.put("department", intern.getDepartment().getName());
                        userData.put("departmentId", intern.getDepartment().getDepartmentId());
                    }
                    if (intern.getSupervisor() != null) {
                        userData.put("supervisorEmail", intern.getSupervisor().getEmail());
                        userData.put("supervisorId", intern.getSupervisor().getSupervisorId());
                    }
                    // ✅ Add field if available
                    if (intern.getField() != null && !intern.getField().trim().isEmpty()) {
                        userData.put("field", intern.getField());
                    }
                    // ✅ Add location information if available
                    if (intern.getLocation() != null) {
                        userData.put("locationId", intern.getLocation().getLocationId());
                        userData.put("locationName", intern.getLocation().getName());
                        userData.put("locationLatitude", intern.getLocation().getLatitude());
                        userData.put("locationLongitude", intern.getLocation().getLongitude());
                        userData.put("locationRadius", intern.getLocation().getRadius());
                        System.out.println("✅ Intern location loaded: " + intern.getLocation().getName() + " (ID: "
                                + intern.getLocation().getLocationId() + ")");
                    }

                    // ✅ Add extra profile fields
                    if (intern.getEmployer() != null)
                        userData.put("employer", intern.getEmployer());
                    if (intern.getIdNumber() != null)
                        userData.put("idNumber", intern.getIdNumber());
                    if (intern.getStartDate() != null)
                        userData.put("startDate", intern.getStartDate().toString());
                    if (intern.getEndDate() != null)
                        userData.put("endDate", intern.getEndDate().toString());

                    System.out.println("✅ Intern department loaded: "
                            + (intern.getDepartment() != null ? intern.getDepartment().getName() : "N/A") + " (ID: "
                            + (intern.getDepartment() != null ? intern.getDepartment().getDepartmentId() : "N/A")
                            + "), Field: " + (intern.getField() != null ? intern.getField() : "N/A"));
                }
            }
        } catch (Exception e) {
            System.err.println("❌ Error fetching department info for " + role + " (" + email + "): " + e.getMessage());
            e.printStackTrace();
        }
    }

    /**
     * ✅ Provision a user from Univen API data
     */
    private User provisionUserFromExternal(Map<String, Object> data, String password) {
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> userData = (Map<String, Object>) data.get("user");
            String username = (String) userData.get("username");

            @SuppressWarnings("unchecked")
            Map<String, Object> staffData = (Map<String, Object>) data.get("staff");
            @SuppressWarnings("unchecked")
            Map<String, Object> studentData = (Map<String, Object>) data.get("student");
            @SuppressWarnings("unchecked")
            Map<String, Object> commData = (Map<String, Object>) data.get("communication");

            String email = null;
            if (commData != null) {
                email = (String) commData.get("communicationNumber");
            }
            if (email == null) {
                email = username.contains("@") ? username : username + "@univen.ac.za";
            }

            String name = "";
            String surname = "";
            String staffNumber = null;
            User.Role role = User.Role.INTERN;
            String departmentName = null;
            String field = null;

            if (staffData != null) {
                name = (String) staffData.get("firstname");
                surname = (String) staffData.get("surname");
                staffNumber = (String) staffData.get("staffNumber");
                departmentName = (String) staffData.get("departmentName");
                field = (String) staffData.get("postName");

                String fullName = (name == null) ? ""
                        : (surname == null || surname.isEmpty() ? name : name + " " + surname);

                // ✅ Robust check: Staff must be pre-registered by an Admin/SuperAdmin
                boolean preCreatedAdmin = (email != null
                        && adminRepository.findByEmail(email).stream().findFirst().isPresent())
                        || (staffNumber != null
                                && adminRepository.findByStaffNumber(staffNumber).stream().findFirst().isPresent())
                        || (fullName.trim().length() > 3
                                && !adminRepository.findByNameContainingIgnoreCase(fullName.trim()).isEmpty());

                boolean preCreatedSupervisor = (email != null
                        && supervisorRepository.findByEmail(email).stream().findFirst().isPresent())
                        || (staffNumber != null && supervisorRepository.findByStaffNumber(staffNumber).stream()
                                .findFirst().isPresent());

                if (preCreatedAdmin) {
                    role = User.Role.ADMIN;
                    System.out.println(
                            "✅ Provisioning Staff: " + username + " as ADMIN (Found pre-registered Admin profile)");
                } else if (preCreatedSupervisor) {
                    role = User.Role.SUPERVISOR;
                    System.out.println("✅ Provisioning Staff: " + username
                            + " as SUPERVISOR (Found pre-registered Supervisor profile)");
                } else {
                    // Critical security gate: If not pre-added, deny access
                    System.out.println("⛔ SECURITY ALERT: Provisioning BLOCKED for Staff: " + username);
                    System.out.println("   Reason: No pre-registered Admin or Supervisor record found.");
                    System.out.println(
                            "   Identity Data: Email=" + email + ", StaffNumber=" + staffNumber + ", Name=" + fullName);
                    return null;
                }
            } else if (studentData != null) {
                // Students/Interns MUST register (sign up) first, they cannot be automatically
                // provisioned on login
                System.out.println("⛔ SECURITY ALERT: Auto-provisioning BLOCKED for Student: " + username);
                System.out.println("   Reason: Students/Interns must sign up/register first.");
                return null;
            }

            // Create new User
            User newUser = new User();
            newUser.setUsername(username);
            newUser.setEmail(email);
            newUser.setPassword(passwordEncoder.encode(password));
            newUser.setRole(role);
            newUser.setActive(true);
            newUser.setRequiresPasswordChange(false);
            newUser.setStaffNumber(staffNumber);

            User savedUser = userRepository.save(newUser);
            System.out.println("✅ Local User account created for: " + username);

            // Create Profile
            Map<String, Object> profileRequest = new java.util.HashMap<>();
            profileRequest.put("name", name);
            profileRequest.put("surname", surname);
            profileRequest.put("department", departmentName);
            profileRequest.put("field", field);

            if (role == User.Role.ADMIN) {
                createAdminProfile(savedUser, profileRequest);
            } else if (role == User.Role.SUPERVISOR) {
                createSupervisorProfile(savedUser, profileRequest);
            } else if (role == User.Role.INTERN) {
                createInternProfile(savedUser, profileRequest);
            }

            // ✅ Ensure profile is updated with the latest external data
            updateProfileFromExternal(savedUser, data);

            return savedUser;
        } catch (Exception e) {
            System.err.println("❌ Error provisioning user from external data: " + e.getMessage());
            e.printStackTrace();
            return null;
        }
    }

    /**
     * ✅ Update profile data (Admin or Supervisor) from external Univen data
     */
    private void updateProfileFromExternal(User user, Map<String, Object> data) {
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> staffData = (Map<String, Object>) data.get("staff");
            if (staffData == null)
                return;

            String name = (String) staffData.get("firstname");
            String surname = (String) staffData.get("surname");
            String fullName = surname == null || surname.isEmpty() ? name : name + " " + surname;
            String staffNumber = (String) staffData.get("staffNumber");

            if (user.getRole() == User.Role.ADMIN) {
                Optional<Admin> adminOpt = adminRepository.findByEmail(user.getEmail()).stream().findFirst();
                if (adminOpt.isEmpty())
                    adminOpt = adminRepository.findByEmail(user.getUsername()).stream().findFirst();
                // 🔍 Fallback to name-based lookup
                if (adminOpt.isEmpty())
                    adminOpt = adminRepository.findByNameContainingIgnoreCase(fullName).stream().findFirst();

                if (adminOpt.isPresent()) {
                    Admin admin = adminOpt.get();
                    // Update email if it was linked by name but email is different
                    if (admin.getEmail() == null || admin.getEmail().isEmpty()) {
                        admin.setEmail(user.getEmail());
                    }
                    // Update name if it's empty or generically set
                    if (admin.getName() == null || admin.getName().isEmpty()
                            || admin.getName().toLowerCase().contains("admin")) {
                        admin.setName(fullName);
                    }
                    // Update staff number if missing
                    if (admin.getStaffNumber() == null) {
                        admin.setStaffNumber(staffNumber);
                    }
                    adminRepository.save(admin);
                    System.out.println("✅ Admin profile confirmed and updated from Univen API: " + user.getEmail());
                }
            } else if (user.getRole() == User.Role.SUPERVISOR) {
                Optional<Supervisor> supervisorOpt = supervisorRepository.findByEmail(user.getEmail()).stream()
                        .findFirst();
                if (supervisorOpt.isEmpty())
                    supervisorOpt = supervisorRepository.findByEmail(user.getUsername()).stream().findFirst();
                // 🔍 Fallback to name-based lookup
                if (supervisorOpt.isEmpty())
                    supervisorOpt = supervisorRepository.findByNameContainingIgnoreCase(fullName).stream().findFirst();

                if (supervisorOpt.isPresent()) {
                    Supervisor supervisor = supervisorOpt.get();
                    if (supervisor.getEmail() == null || supervisor.getEmail().isEmpty()) {
                        supervisor.setEmail(user.getEmail());
                    }
                    if (supervisor.getName() == null || supervisor.getName().isEmpty()) {
                        supervisor.setName(fullName);
                    }
                    if (supervisor.getStaffNumber() == null) {
                        supervisor.setStaffNumber(staffNumber);
                    }
                    supervisorRepository.save(supervisor);
                    System.out
                            .println("✅ Supervisor profile confirmed and updated from Univen API: " + user.getEmail());
                }
            }

            // Also update the User record's staffNumber if missing
            if (user.getStaffNumber() == null) {
                user.setStaffNumber(staffNumber);
                userRepository.save(user);
            }
        } catch (Exception e) {
            System.err.println("❌ Error updating profile from external data: " + e.getMessage());
        }
    }

    /**
     * ✅ Validate credentials and fetch profile data from external Univen API
     */
    private Map<String, Object> checkUnivenAuth(String username, String password) throws Exception {
        String id = username.contains("@") ? username.split("@")[0] : username;
        String url = "https://univenproduction-integration.azuremicroservices.io/api/user/" + id;

        String auth = id + ":" + password;
        String encodedAuth = java.util.Base64.getEncoder().encodeToString(auth.getBytes());

        java.net.http.HttpClient client = java.net.http.HttpClient.newHttpClient();
        java.net.http.HttpRequest request = java.net.http.HttpRequest.newBuilder()
                .uri(java.net.URI.create(url))
                .header("Authorization", "Basic " + encodedAuth)
                .header("Accept", "application/json")
                .timeout(java.time.Duration.ofSeconds(10))
                .GET()
                .build();

        System.out.println("🔍 Calling Univen API for pre-fill: " + url);
        java.net.http.HttpResponse<String> response = client.send(request,
                java.net.http.HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() == 200) {
            System.out.println("✅ Univen API returned 200 OK");
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            // Register JavaTimeModule to handle LocalDate if necessary, but here we just
            // want a Map
            return mapper.readValue(response.body(),
                    new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {
                    });
        } else {
            System.out.println("❌ Univen API returned status: " + response.statusCode());
            return null;
        }
    }

    @PostMapping("/update-department")
    public ResponseEntity<?> updateDepartment(@RequestBody Map<String, Object> body) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()
                || "anonymousUser".equals(authentication.getPrincipal())) {
            return ResponseEntity.status(401).body(Map.of("error", "Not authenticated"));
        }

        String username = authentication.getName();

        // Try to find user by username first, then by email
        Optional<User> userOpt = userService.findByUsername(username);
        if (userOpt.isEmpty()) {
            userOpt = userService.findByEmail(username);
        }
        if (userOpt.isEmpty()) {
            return ResponseEntity.status(404).body(Map.of("error", "User not found"));
        }
        User user = userOpt.get();

        Long departmentId;
        Object deptIdObj = body.get("departmentId");
        if (deptIdObj instanceof Number) {
            departmentId = ((Number) deptIdObj).longValue();
        } else if (deptIdObj instanceof String) {
            try {
                departmentId = Long.parseLong((String) deptIdObj);
            } catch (NumberFormatException e) {
                return ResponseEntity.badRequest().body(Map.of("error", "Invalid departmentId"));
            }
        } else {
            return ResponseEntity.badRequest().body(Map.of("error", "departmentId is required"));
        }

        Optional<Department> deptOpt = departmentRepository.findById(departmentId);
        if (deptOpt.isEmpty()) {
            return ResponseEntity.status(404).body(Map.of("error", "Department not found"));
        }
        Department department = deptOpt.get();

        if (user.getRole() == User.Role.ADMIN) {
            // Try find by email first, then by staff number (username)
            Optional<Admin> adminOpt = adminRepository.findByEmail(user.getEmail()).stream().findFirst();
            if (adminOpt.isEmpty()) {
                adminOpt = adminRepository.findByEmail(user.getUsername()).stream().findFirst();
            }
            if (adminOpt.isEmpty() && user.getStaffNumber() != null) {
                adminOpt = adminRepository.findByStaffNumber(user.getStaffNumber()).stream().findFirst();
            }
            if (adminOpt.isPresent()) {
                Admin admin = adminOpt.get();
                admin.setDepartment(department);
                adminRepository.save(admin);
                System.out.println("✅ Admin department updated to: " + department.getName());
            } else {
                System.err.println("⚠️ Admin profile not found for user: " + username);
                return ResponseEntity.status(404).body(Map.of("error", "Admin profile not found"));
            }
        } else if (user.getRole() == User.Role.SUPERVISOR) {
            Optional<Supervisor> supOpt = supervisorRepository.findByEmail(user.getEmail()).stream().findFirst();
            if (supOpt.isEmpty()) {
                supOpt = supervisorRepository.findByEmail(user.getUsername()).stream().findFirst();
            }
            if (supOpt.isEmpty() && user.getStaffNumber() != null) {
                supOpt = supervisorRepository.findByStaffNumber(user.getStaffNumber()).stream().findFirst();
            }
            if (supOpt.isPresent()) {
                Supervisor sup = supOpt.get();
                sup.setDepartment(department);
                supervisorRepository.save(sup);
                System.out.println("✅ Supervisor department updated to: " + department.getName());
            } else {
                System.err.println("⚠️ Supervisor profile not found for user: " + username);
                return ResponseEntity.status(404).body(Map.of("error", "Supervisor profile not found"));
            }
        } else {
            return ResponseEntity.status(403)
                    .body(Map.of("error", "Only Admins and Supervisors can switch departments via this endpoint"));
        }

        // Return updated token so the frontend can persist the departmentId immediately
        Map<String, Object> userData = new java.util.HashMap<>();
        userData.put("id", user.getId());
        userData.put("username", user.getUsername());
        userData.put("email", user.getEmail() != null ? user.getEmail() : user.getUsername());
        userData.put("role", user.getRole().name());
        userData.put("requiresPasswordChange", user.getRequiresPasswordChange());
        if (user.getStaffNumber() != null) {
            userData.put("staffNumber", user.getStaffNumber());
        }
        userData.put("departmentId", department.getDepartmentId());
        userData.put("department", department.getName());

        String newToken = jwtTokenProvider.createToken(user);

        return ResponseEntity.ok(Map.of(
                "message", "Department updated successfully",
                "departmentId", department.getDepartmentId(),
                "departmentName", department.getName(),
                "token", newToken,
                "user", userData));
    }

    /**
     * Verify an intern's face against their stored profile using local face-api.js.
     * POST /api/auth/face-verify
     * Body: { "descriptor": [float array], "email": "<intern email>" }
     */
    @PostMapping("/face-verify")
    public ResponseEntity<?> verifyFace(@RequestBody Map<String, Object> body) {
        try {
            String email = (String) body.get("email");
            List<Double> liveDescriptor = (List<Double>) body.get("descriptor");

            if (email == null || email.isBlank() || liveDescriptor == null || liveDescriptor.size() != 128) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "email and a valid 128-dimensional descriptor are required"));
            }

            // Fetch the intern's stored face descriptor JSON
            Optional<com.internregister.entity.Intern> internOpt = internRepository.findByEmail(email).stream()
                    .findFirst();
            if (internOpt.isEmpty()) {
                return ResponseEntity.status(404).body(Map.of("error", "No intern profile found for this email"));
            }

            String storedFaceData = internOpt.get().getFaceData();
            if (storedFaceData == null || storedFaceData.isBlank()) {
                return ResponseEntity.status(404).body(Map.of("error", "No face profile enrolled for this intern"));
            }

            // Parse stored JSON descriptor array
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            List<Double> storedDescriptor = mapper.readValue(storedFaceData,
                    new com.fasterxml.jackson.core.type.TypeReference<List<Double>>() {
                    });

            // Compare using Euclidean distance
            // ── SECURITY: Threshold tightened to 0.32 (strict match required) ──────
            // face-api.js descriptors: 0.0 = identical, 0.6+ = clearly different person
            // 0.4 (old default) was too lenient and allowed partial matches.
            // 0.32 requires a high-confidence match — only the enrolled face passes.
            double threshold = Double.parseDouble(env.getProperty("face.descriptor.threshold", "0.32"));
            double distance = faceDescriptorService.calculateDistance(storedDescriptor, liveDescriptor);
            boolean verified = distance <= threshold;

            // Accurate confidence percentage:
            // distance=0.0 → 100%, distance=0.32 (threshold) → ~47%, distance=0.6+ → 0%
            // We scale so 0.0=100% and threshold=50% to give meaningful UI feedback
            double confidence = Math.max(0, Math.min(100, (1.0 - (distance / 0.6)) * 100));

            Map<String, Object> response = new HashMap<>();
            response.put("verified", verified);
            response.put("confidence", confidence);
            response.put("distance", distance);

            return ResponseEntity.ok(response);

        } catch (Exception e) {
            e.printStackTrace();
            String msg = e.getMessage() != null ? e.getMessage() : "Unknown error";
            return ResponseEntity.status(500).body(Map.of(
                    "error", "Face verification failed",
                    "message", msg,
                    "verified", false,
                    "confidence", 0));
        }
    }
}
