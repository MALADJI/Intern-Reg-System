# Backend Review and Fix Guide

## 🔴 Critical Issue: 401 Authentication Errors

The frontend is receiving **401 Unauthorized** errors on all API calls after login. This indicates a **backend JWT authentication configuration problem**.

---

## 🔍 Root Cause Analysis

### Current Symptoms:
- ✅ Login succeeds and returns JWT token
- ✅ Token is stored correctly in frontend (168 characters, HS256 algorithm)
- ❌ All subsequent API calls return 401 Unauthorized
- ❌ Backend rejects the Authorization header

### Most Likely Causes:
1. **JWT Secret Mismatch** - Backend uses different secret to validate than to sign
2. **Token Validation Filter** - Not properly configured or missing
3. **CORS Configuration** - Authorization header not allowed
4. **Security Filter Chain** - Incorrectly configured authentication filters

---

## 📋 Required Backend Endpoints Review

Based on frontend API calls, ensure these endpoints exist and are properly secured:

### 1. Authentication Endpoints ✅
```
POST /api/auth/login
  Request: { username: string, password: string } OR { email: string, password: string }
  Response: { token: string, user: { id, name, email, role, ... } }
  
  ⚠️ IMPORTANT: Backend should accept EITHER username OR email
  - Frontend sends username field (which contains email address)
  - Backend should check both username and email fields
  - If backend only accepts 'email', frontend will also send email field
  
POST /api/auth/register
  Request: { name, surname, email, password, departmentId, field, role }
  Response: { message: string, code?: string }
  
POST /api/auth/send-verification-code
  Request: { email: string }
  Response: { message: string, code: string }
  
  ⚠️ IMPORTANT: Verification codes MUST expire after 15 minutes (900 seconds)
  - Frontend expects codes to be valid for 15 minutes
  - Backend should set expiration to 900 seconds (15 minutes)
  
POST /api/auth/forgot-password
  Request: { email: string }
  Response: { message: string, code: string }
  
  ⚠️ IMPORTANT: Verification codes MUST expire after 15 minutes (900 seconds)
  - Frontend expects codes to be valid for 15 minutes
  - Backend should set expiration to 900 seconds (15 minutes)
  
POST /api/auth/reset-password
  Request: { email: string, code: string, newPassword: string }
  Response: { message: string }
  
  ⚠️ IMPORTANT: Verification codes MUST expire after 15 minutes (900 seconds)
  - Frontend expects codes to be valid for 15 minutes
  - Backend should set expiration to 900 seconds (15 minutes)
```

### 2. Intern Endpoints ❌ (401 Errors)
```
GET /api/interns
  Headers: Authorization: Bearer <token>
  Response: InternResponse[]
  
GET /api/interns/{id}
  Headers: Authorization: Bearer <token>
  Response: InternResponse
  
GET /api/interns/search?name={name}&page={page}&size={size}
  Headers: Authorization: Bearer <token>
  Response: Page<InternResponse>
  
POST /api/interns
  Headers: Authorization: Bearer <token>
  Request: { name, email, departmentId, supervisorId?, employer? }
  Response: InternResponse
  
PUT /api/interns/{id}
  Headers: Authorization: Bearer <token>
  Request: { field?, status?, supervisorId? }
  Response: InternResponse
  
PUT /api/interns/{id}/activate
  Headers: Authorization: Bearer <token>
  Response: InternResponse
  
PUT /api/interns/{id}/deactivate
  Headers: Authorization: Bearer <token>
  Response: InternResponse
  
DELETE /api/interns/{id}
  Headers: Authorization: Bearer <token>
  Response: void
```

### 3. Supervisor Endpoints ❌ (401 Errors)
```
GET /api/supervisors
  Headers: Authorization: Bearer <token>
  Response: Supervisor[]
  
GET /api/supervisors/{id}
  Headers: Authorization: Bearer <token>
  Response: Supervisor
  
POST /api/supervisors
  Headers: Authorization: Bearer <token>
  Request: { name, email, departmentId, field? }
  Response: Supervisor
  
PUT /api/supervisors/{id}
  Headers: Authorization: Bearer <token>
  Request: { name?, email?, departmentId?, field? }
  Response: Supervisor
  
DELETE /api/supervisors/{id}
  Headers: Authorization: Bearer <token>
  Response: void
```

### 4. Department Endpoints ❌ (401 Errors)
```
GET /api/departments
  Headers: Authorization: Bearer <token>
  Response: Department[]
  
POST /api/departments
  Headers: Authorization: Bearer <token>
  Request: { name: string }
  Response: Department
  
PUT /api/departments/{id}
  Headers: Authorization: Bearer <token>
  Request: { name: string }
  Response: Department
  
DELETE /api/departments/{id}
  Headers: Authorization: Bearer <token>
  Response: void
```

### 5. Leave Request Endpoints ❌ (401 Errors)
```
GET /api/leave
  Headers: Authorization: Bearer <token>
  Response: LeaveRequest[]
  
GET /api/leave/intern/{internId}
  Headers: Authorization: Bearer <token>
  Response: LeaveRequest[]
  
POST /api/leave
  Headers: Authorization: Bearer <token>
  Request: { internId, leaveType, startDate, endDate, reason, document? }
  Response: LeaveRequest
  
PUT /api/leave/approve/{id}
  Headers: Authorization: Bearer <token>
  Response: LeaveRequest
  
PUT /api/leave/reject/{id}
  Headers: Authorization: Bearer <token>
  Request: { declineReason: string }
  Response: LeaveRequest
```

### 6. Attendance Endpoints
```
GET /api/attendance
  Headers: Authorization: Bearer <token>
  Response: Attendance[]
  
GET /api/attendance/intern/{internId}
  Headers: Authorization: Bearer <token>
  Response: Attendance[]
  
POST /api/attendance/signin
  Headers: Authorization: Bearer <token>
  Request: { internId, date, timeIn, location, latitude, longitude, signature? }
  Response: Attendance
  
PUT /api/attendance/signout/{id}
  Headers: Authorization: Bearer <token>
  Request: { timeOut: string, signature? }
  Response: Attendance
```

### 7. Settings/Profile Endpoints
```
GET /api/settings/profile
  Headers: Authorization: Bearer <token>
  Response: { name, surname, email, role, department?, field?, ... }
  
PUT /api/settings/profile
  Headers: Authorization: Bearer <token>
  Request: { name: string, surname: string }
  Response: { name, surname, email, role, ... }
  
PUT /api/settings/password
  Headers: Authorization: Bearer <token>
  Request: { currentPassword: string, newPassword: string }
  Response: { message: string }
```

### 8. Report Endpoints
```
GET /api/reports/attendance/pdf?startDate={date}&endDate={date}
  Headers: Authorization: Bearer <token>
  Response: Blob (PDF file)
  
GET /api/reports/attendance/excel?startDate={date}&endDate={date}
  Headers: Authorization: Bearer <token>
  Response: Blob (Excel file)
```

---

## 🔧 Backend Fix Checklist

### 1. JWT Configuration ✅ CRITICAL
```java
// application.properties or application.yml
jwt.secret=your-secret-key-here  // MUST match between sign and validate
jwt.expiration=86400000  // 24 hours in milliseconds

// JwtTokenProvider.java - Verify these methods:
public String generateToken(Authentication authentication) {
    // Uses jwt.secret to SIGN token
}

public boolean validateToken(String token) {
    // Uses SAME jwt.secret to VALIDATE token
    // MUST return true for valid tokens
}
```

**Check:**
- [ ] JWT secret is the same in both `generateToken()` and `validateToken()`
- [ ] Secret is loaded from `application.properties` (not hardcoded)
- [ ] Token expiration is reasonable (24 hours recommended)
- [ ] Algorithm matches (HS256 based on frontend token)

### 2. Security Configuration ✅ CRITICAL
```java
@Configuration
@EnableWebSecurity
public class SecurityConfig {
    
    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable())  // For API, CSRF can be disabled
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/auth/**").permitAll()  // Public endpoints
                .requestMatchers("/api/**").authenticated()    // All other API endpoints require auth
            )
            .sessionManagement(session -> 
                session.sessionCreationPolicy(SessionCreationPolicy.STATELESS)
            )
            .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);
        
        return http.build();
    }
    
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(Arrays.asList("http://localhost:4200"));
        configuration.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(Arrays.asList("*"));
        configuration.setExposedHeaders(Arrays.asList("Authorization"));
        configuration.setAllowCredentials(true);
        
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}
```

**Check:**
- [ ] CORS allows `Authorization` header
- [ ] CORS allows origin `http://localhost:4200`
- [ ] JWT filter is added BEFORE `UsernamePasswordAuthenticationFilter`
- [ ] `/api/auth/**` is public (permitAll)
- [ ] `/api/**` requires authentication

### 3. JWT Authentication Filter ✅ CRITICAL
```java
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {
    
    @Autowired
    private JwtTokenProvider tokenProvider;
    
    @Autowired
    private UserDetailsService userDetailsService;
    
    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        
        try {
            String token = getTokenFromRequest(request);
            
            if (token != null && tokenProvider.validateToken(token)) {
                String username = tokenProvider.getUsernameFromToken(token);
                UserDetails userDetails = userDetailsService.loadUserByUsername(username);
                
                UsernamePasswordAuthenticationToken authentication = 
                    new UsernamePasswordAuthenticationToken(
                        userDetails, null, userDetails.getAuthorities()
                    );
                authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                
                SecurityContextHolder.getContext().setAuthentication(authentication);
            }
        } catch (Exception e) {
            logger.error("Cannot set user authentication", e);
            // Don't fail here - let it continue and return 401 if needed
        }
        
        filterChain.doFilter(request, response);
    }
    
    private String getTokenFromRequest(HttpServletRequest request) {
        String bearerToken = request.getHeader("Authorization");
        if (bearerToken != null && bearerToken.startsWith("Bearer ")) {
            return bearerToken.substring(7);  // Remove "Bearer " prefix
        }
        return null;
    }
}
```

**Check:**
- [ ] Filter extracts token from `Authorization: Bearer <token>` header
- [ ] Filter validates token using `tokenProvider.validateToken()`
- [ ] Filter sets authentication in `SecurityContextHolder`
- [ ] Filter doesn't throw exceptions (handles gracefully)

### 4. Controller Security Annotations
```java
@RestController
@RequestMapping("/api/interns")
@PreAuthorize("hasAnyRole('ADMIN', 'SUPERVISOR')")  // Or appropriate role
public class InternController {
    
    @GetMapping
    public ResponseEntity<List<InternResponse>> getAllInterns() {
        // Implementation
    }
    
    // ... other endpoints
}
```

**Check:**
- [ ] Controllers have appropriate `@PreAuthorize` annotations
- [ ] Role names match frontend expectations (ADMIN, SUPERVISOR, INTERN)
- [ ] Public endpoints (auth) don't have security annotations

### 5. Response DTOs Match Frontend Expectations
```java
// InternResponse.java - MUST match frontend interface
public class InternResponse {
    private Long id;
    private String name;
    private String email;
    private String departmentName;  // Frontend expects this
    private Long departmentId;
    private String supervisorName;  // Frontend expects this
    private Long supervisorId;
    private String employer;
    private String field;
    private String status;  // "PRESENT", "ABSENT", "ON_LEAVE"
    private Boolean active;
    
    // Getters and setters
}
```

**Check:**
- [ ] Response DTOs match frontend TypeScript interfaces
- [ ] Field names match exactly (camelCase)
- [ ] Nested objects are properly serialized
- [ ] Null values are handled correctly

---

## 🐛 Common Issues and Fixes

### Issue 1: 401 on All Authenticated Endpoints
**Symptoms:** Login works, but all other API calls return 401

**Possible Causes:**
1. JWT secret mismatch
2. Token validation failing
3. Security filter not configured
4. CORS blocking Authorization header

**Fix:**
```java
// 1. Verify JWT secret is consistent
@Value("${jwt.secret}")
private String jwtSecret;  // Use @Value to inject from properties

// 2. Add debug logging
public boolean validateToken(String token) {
    try {
        Jwts.parserBuilder()
            .setSigningKey(jwtSecret)
            .build()
            .parseClaimsJws(token);
        return true;
    } catch (JwtException e) {
        logger.error("JWT validation failed: " + e.getMessage());
        return false;
    }
}

// 3. Verify CORS allows Authorization header
configuration.setAllowedHeaders(Arrays.asList("Authorization", "Content-Type"));
```

### Issue 2: CORS Preflight Failing
**Symptoms:** OPTIONS requests return 401 or 403

**Fix:**
```java
// Allow OPTIONS method in CORS
configuration.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "DELETE", "OPTIONS"));

// Allow preflight in security config
.requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
```

### Issue 3: Token Not Extracted from Header
**Symptoms:** Token exists but filter doesn't find it

**Fix:**
```java
// Verify header extraction
private String getTokenFromRequest(HttpServletRequest request) {
    String bearerToken = request.getHeader("Authorization");
    logger.debug("Authorization header: " + bearerToken);  // Debug log
    if (bearerToken != null && bearerToken.startsWith("Bearer ")) {
        return bearerToken.substring(7);
    }
    return null;
}
```

### Issue 4: User Not Found After Token Validation
**Symptoms:** Token validates but user lookup fails

**Fix:**
```java
// Ensure user exists in database
String username = tokenProvider.getUsernameFromToken(token);
UserDetails userDetails = userDetailsService.loadUserByUsername(username);

if (userDetails == null) {
    logger.error("User not found: " + username);
    // Handle gracefully - don't set authentication
    return;
}
```

---

## ✅ Testing Checklist

### 1. Test Authentication Flow
```bash
# 1. Login
POST http://localhost:8082/api/auth/login
Content-Type: application/json
{
  "username": "admin@univen.ac.za",
  "password": "password123"
}

# Expected: 200 OK with token

# 2. Use token in next request
GET http://localhost:8082/api/interns
Authorization: Bearer <token-from-step-1>

# Expected: 200 OK with intern list
# NOT: 401 Unauthorized
```

### 2. Test CORS
```bash
# From browser console (F12)
fetch('http://localhost:8082/api/interns', {
  headers: {
    'Authorization': 'Bearer <token>'
  }
})
.then(r => r.json())
.then(console.log)
.catch(console.error)

# Expected: No CORS errors, data returned
```

### 3. Test Token Validation
```java
// Add test endpoint
@GetMapping("/api/test/token")
public ResponseEntity<?> testToken(@RequestHeader("Authorization") String authHeader) {
    String token = authHeader.substring(7);
    boolean valid = tokenProvider.validateToken(token);
    return ResponseEntity.ok(Map.of("valid", valid));
}
```

---

## 📝 Quick Fix Steps

1. **Verify JWT Secret:**
   ```bash
   # Check application.properties
   grep jwt.secret src/main/resources/application.properties
   
   # Ensure it's the same in both sign and validate methods
   ```

2. **Add Debug Logging:**
   ```java
   // In JwtAuthenticationFilter
   logger.debug("Token from request: " + token);
   logger.debug("Token valid: " + tokenProvider.validateToken(token));
   ```

3. **Test Token Manually:**
   ```java
   // Create test endpoint
   @GetMapping("/api/test/jwt")
   public ResponseEntity<?> testJwt() {
       Authentication auth = SecurityContextHolder.getContext().getAuthentication();
       return ResponseEntity.ok(auth);
   }
   ```

4. **Verify CORS:**
   ```java
   // Add to SecurityConfig
   .cors(cors -> cors.configurationSource(corsConfigurationSource()))
   ```

5. **Check Filter Order:**
   ```java
   // JWT filter must be BEFORE UsernamePasswordAuthenticationFilter
   .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class)
   ```

---

## 🎯 Priority Fixes

1. **🔴 CRITICAL: Fix JWT Authentication** (Causes 401 errors)
   - Verify JWT secret consistency
   - Fix token validation
   - Ensure filter is properly configured

2. **🟡 HIGH: Fix CORS Configuration** (May block requests)
   - Allow Authorization header
   - Allow OPTIONS method
   - Configure allowed origins

3. **🟡 HIGH: Verify Endpoint Security** (Ensure proper access control)
   - Add @PreAuthorize where needed
   - Verify role-based access

4. **🟢 MEDIUM: Add Error Handling** (Better debugging)
   - Add logging for authentication failures
   - Return clear error messages

---

## 📞 Next Steps

After fixing the backend:

1. **Test Authentication:**
   - Login should return valid token
   - Token should work for all authenticated endpoints

2. **Test All Endpoints:**
   - Verify each endpoint returns expected data
   - Check response formats match frontend expectations

3. **Test Error Handling:**
   - Invalid tokens return 401
   - Missing tokens return 401
   - Expired tokens return 401

4. **Monitor Logs:**
   - Check for JWT validation errors
   - Check for CORS errors
   - Check for authentication failures

---

**Generated:** 2025-01-27  
**Frontend Base URL:** `http://localhost:4200`  
**Backend Base URL:** `http://localhost:8082/api`

