import { Injectable, Injector } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject, throwError, of, firstValueFrom } from 'rxjs';
import { tap, map, catchError, switchMap } from 'rxjs/operators';
import { ApiService } from './api.service';
import { StorageService } from './storage.service';
import { DataPreloadService } from './data-preload.service';
import { WebSocketService } from './websocket.service';
import { NotificationService } from './notification.service';

export interface LoginRequest {
  username?: string;  // Some backends use username
  email?: string;     // Some backends use email
  password: string;
}

export interface LoginResponse {
  token: string;
  user: {
    id: number;
    username: string;
    email: string;
    role: 'SUPER_ADMIN' | 'ADMIN' | 'SUPERVISOR' | 'INTERN';
    name?: string;
    surname?: string;
    department?: string;
    departmentId?: number; // Department ID for admins
    field?: string;
    requiresPasswordChange: boolean;
    hasFaceData?: boolean;
    isProfileComplete?: boolean;
  };
}

export interface CurrentUser {
  id: number;
  username: string;
  email: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'SUPERVISOR' | 'INTERN';
  name?: string;
  surname?: string;
  department?: string;
  departmentId?: number; // Department ID for admins
  field?: string;
  supervisorEmail?: string;
  supervisorId?: number;
  employer?: string;
  idNumber?: string;
  startDate?: string;
  endDate?: string;
  requiresPasswordChange: boolean;
  hasFaceData?: boolean;
  isProfileComplete?: boolean;
}

export interface UnivenResponse {
  user: {
    username: string;
    roles: string;
  };
  student?: {
    surname: string;
    firstNames: string;
    qualificationCode?: string;
    qualificationName: string;
    departmentCode?: string;
    departmentName: string;
    facultyCode?: string;
    facultyName?: string;
    gender: string;
    initials?: string;
    dateOfBirth?: string;
    idNumber: string;
  };
  staff?: {
    staffNumber: string;
    surname: string;
    firstname: string;
    initials?: string;
    title?: string;
    postName: string;
    postType: string;
    departmentName: string;
    idNumber: string;
    gender: string;
    costCenterName?: string;
    costCentreCode?: string;
    rankName?: string;
  };
  communication?: {
    contactType?: string;
    communicationType?: string;
    communicationNumber: string; // Email
    cellNo: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private currentUserSubject = new BehaviorSubject<CurrentUser | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  /** Synchronous accessor for the current user snapshot */
  get currentUser(): CurrentUser | null {
    return this.currentUserSubject.value;
  }
  private webSocketService: WebSocketService | null = null;
  private notificationService: NotificationService | null = null;

  constructor(
    private api: ApiService,
    private http: HttpClient, // Inject HttpClient for external requests
    private storage: StorageService,
    private router: Router,
    private dataPreloadService: DataPreloadService,
    private injector: Injector
  ) {
    // Load user from storage on init
    this.loadUserFromStorage();

    // Set up WebSocket subscriptions after a short delay to avoid circular dependencies
    setTimeout(() => {
      this.setupWebSocketSubscriptions();
    }, 1000);
  }

  /**
   * Get WebSocketService lazily to avoid circular dependency
   */
  private getWebSocketService(): WebSocketService {
    if (!this.webSocketService) {
      this.webSocketService = this.injector.get(WebSocketService);
    }
    return this.webSocketService;
  }

  private getNotificationService(): NotificationService {
    if (!this.notificationService) {
      this.notificationService = this.injector.get(NotificationService);
    }
    return this.notificationService;
  }

  /**
   * Set up WebSocket subscriptions to listen for real-time profile updates
   */
  private setupWebSocketSubscriptions(): void {
    try {
      const wsService = this.getWebSocketService();
      wsService.userUpdates$.subscribe(update => {
        if (update.type === 'USER_PROFILE_UPDATED') {
          const currentUser = this.currentUserSubject.value;
          if (currentUser && update.data && update.data.email === currentUser.email) {
            // Merge the new data into the current user state
            const updatedUser = {
              ...currentUser,
              name: update.data.name || currentUser.name,
              surname: update.data.surname || currentUser.surname,
              department: update.data.department || currentUser.department
            };
            this.storage.setItem('currentUser', updatedUser);
            this.currentUserSubject.next(updatedUser);
            console.log('✅ Auto-updated current user from real-time profile change');
          }
        }
      });
    } catch (error) {
      console.warn('⚠️ Could not set up WebSocket subscriptions in AuthService:', error);
    }
  }

  /**
   * Login user
   */
  login(credentials: LoginRequest): Observable<LoginResponse> {
    // Normalize credentials - backend might expect 'email' or 'username'
    // If username is provided and looks like an email, send as both username and email
    const loginPayload: any = {
      password: credentials.password
    };

    // Check if username looks like an email
    if (credentials.username && credentials.username.includes('@')) {
      // It's an email, send as both username and email for compatibility
      loginPayload.username = credentials.username;
      loginPayload.email = credentials.username;
    } else if (credentials.username) {
      loginPayload.username = credentials.username;
    } else if (credentials.email) {
      loginPayload.email = credentials.email;
      loginPayload.username = credentials.email; // Also send as username for compatibility
    }

    console.log('AuthService - Sending login request:', {
      endpoint: 'auth/login',
      payload: { ...loginPayload, password: '***' } // Don't log password
    });

    return this.api.post<any>('auth/login', loginPayload).pipe(
      map((response: any) => {
        console.log('AuthService - Raw login response:', response);

        // Validate response structure
        if (!response) {
          console.error('AuthService - No response received');
          throw new Error('No response from server');
        }

        if (!response.token) {
          console.error('AuthService - Invalid login response - missing token:', JSON.stringify(response));
          throw new Error('Invalid response from server: Token not found');
        }

        if (!response.user) {
          console.error('AuthService - Login response missing user data:', JSON.stringify(response));
          throw new Error('Invalid response from server: User data not found');
        }

        if (!response.user.role) {
          console.error('AuthService - Login response missing user role:', JSON.stringify(response.user));
          throw new Error('Invalid response from server: User role not found');
        }

        // Store token and user - localStorage is synchronous
        console.log('AuthService - Storing token and user...');

        // Clean token before storing (remove any extra whitespace)
        const cleanToken = response.token ? String(response.token).trim() : '';
        console.log('AuthService - Token to store:', cleanToken ? `Length: ${cleanToken.length}, Preview: ${cleanToken.substring(0, 20)}...` : 'EMPTY');

        // Store token as plain string (not JSON-stringified) to avoid parsing issues
        const tokenStored = this.storage.setItemString('authToken', cleanToken);
        const userStored = this.storage.setItem('currentUser', response.user);

        if (!tokenStored || !userStored) {
          console.error('AuthService - Failed to store token or user in localStorage');
          throw new Error('Failed to save authentication data');
        }

        // Update BehaviorSubject immediately
        this.currentUserSubject.next(response.user);

        // Verify storage immediately
        const verifyToken = this.storage.getItemString('authToken');
        const verifyUser = this.storage.getItem<CurrentUser>('currentUser');

        console.log('AuthService - Login successful');
        console.log('  User:', response.user);
        console.log('  Token stored:', !!tokenStored);
        console.log('  User stored:', !!userStored);
        console.log('  Token verified:', !!verifyToken);
        console.log('  User verified:', !!verifyUser);
        console.log('  isLoggedIn():', this.isLoggedIn());

        // Connect WebSocket for real-time updates
        try {
          const wsService = this.getWebSocketService();
          wsService.connect();
          console.log('✅ WebSocket connection initiated');
        } catch (error) {
          console.warn('⚠️ Could not connect WebSocket:', error);
        }

        // Clear old user's notifications, then load this user's notifications
        try {
          const notifService = this.getNotificationService();
          notifService.clearNotificationsState();
          notifService.loadNotifications();
          console.log('✅ Notifications refreshed for new user');
        } catch (error) {
          console.warn('⚠️ Could not refresh notifications:', error);
        }

        // Preload all data before redirecting
        console.log('🔄 Starting data preload...');
        this.dataPreloadService.preloadAllData().subscribe({
          next: (success) => {
            if (success) {
              console.log('✅ Data preload completed');
            } else {
              console.warn('⚠️ Data preload completed with warnings');
            }
            // Redirect after preload completes
            this.redirectAfterLogin(response.user.role);
          },
          error: (err) => {
            console.error('❌ Data preload failed:', err);
            // Still redirect even if preload fails
            this.redirectAfterLogin(response.user.role);
          }
        });

        // Return properly typed response
        return {
          token: response.token,
          user: response.user
        } as LoginResponse;
      }),
      catchError((error: any) => {
        console.error('AuthService - Login error:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Check authentication with external Univen API (Sequential Fallback)
   * This is called if local login fails with 401 or 404
   */
  checkUnivenAuth(identity: string, password: string): Observable<any> {
    // Sanitize ID (extract only numeric ID if email is provided)
    const id = identity.includes('@') ? identity.split('@')[0] : identity;
    const url = `https://univenproduction-integration.azuremicroservices.io/api/user/${id}`;

    // Basic Auth Header
    const authHeader = 'Basic ' + btoa(`${id}:${password}`);
    const headers = new HttpHeaders({
      'Authorization': authHeader,
      'Accept': 'application/json'
    });

    console.log(`AuthService - Attempting Univen Auth:`, {
      url,
      identity_sanitized: id,
      has_password: !!password,
      auth_header_preview: authHeader.substring(0, 15) + '...'
    });

    return this.http.get<UnivenResponse>(url, { headers }).pipe(
      catchError(error => {
        console.error('AuthService - Univen API authentication failed:', error);
        return throwError(() => new Error('Univen authentication failed or user not found.'));
      }),
      switchMap(univenData => {
        if (!univenData || !univenData.user) {
          return throwError(() => new Error('Invalid response from Univen system.'));
        }

        console.log('AuthService - Univen Auth Successful. Checking local account...');

        // Now we need to check if this user exists locally or provision them
        // We call our OWN login method to ensure token storage and redirection happen correctly
        return this.login({ username: id, password }).pipe(
          catchError(localError => {
            // If local login fails, it means they need to be provisioned
            const status = localError.status || (localError.error && localError.error.status);
            if (status === 404 || status === 401 || localError.message?.toLowerCase().includes('not found')) {
              // Secure Gate: If it's a student, DO NOT auto-provision/auto-register
              if (univenData.student) {
                console.log('AuthService - Student login blocked: Profile does not exist.');
                return throwError(() => new Error('Your student credentials are valid, but you have not registered on this system yet. Please sign up/register first.'));
              }
              console.log('AuthService - User not found locally. Proceeding to Auto-Provisioning...');
              return this.provisionUserFromUniven(univenData, password);
            }
            return throwError(() => localError);
          })
        );
      })
    );
  }

  /**
   * Provision a Univen user into the local database automatically
   */
  private provisionUserFromUniven(data: UnivenResponse, password: string): Observable<any> {
    let role: 'INTERN' | 'SUPERVISOR' | 'ADMIN' = 'INTERN';
    let name = '';
    let surname = '';
    let email = '';
    let departmentName = '';
    let fieldStr = '';
    let idNumber = '';
    const username = data.user.username;

    // Map Staff vs Student
    if (data.staff) {
      name = data.staff.firstname;
      surname = data.staff.surname;
      email = data.communication?.communicationNumber || `${username}@univen.ac.za`;
      departmentName = data.staff.departmentName;
      fieldStr = data.staff.postName;
      idNumber = data.staff.idNumber;

      // Staff mapping: ADM -> ADMIN, others -> SUPERVISOR
      // Based on new structure, postType "ADM" corresponds to Admin roles
      role = data.staff.postType === 'ADM' ? 'ADMIN' : 'SUPERVISOR';

      console.log(`AuthService - Staff detected. Role mapped to: ${role} based on postType: ${data.staff.postType}`);
    } else if (data.student) {
      name = data.student.firstNames;
      surname = data.student.surname;
      email = data.communication?.communicationNumber || `${username}@univen.ac.za`;
      departmentName = data.student.departmentName;
      fieldStr = data.student.qualificationName;
      idNumber = data.student.idNumber;
      role = 'INTERN';
    }

    const regData = {
      username: username,
      email: email,
      password: password,
      role: role,
      name: name,
      surname: surname,
      department: departmentName || 'General',
      field: fieldStr || 'General',
      idNumber: idNumber || 'N/A',
      employerName: data.staff ? 'Univen Staff' : 'Univen Student',
      startDate: new Date().toISOString().split('T')[0], // Default start date
      endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0], // Default 1 year
      verificationCode: 'UNIVEN' // Tell backend this is a pre-verified Univen user
    };

    console.log(`AuthService - Provisioning local account for ${username} as ${role}`);

    // Call registration endpoint
    return this.api.post<any>('auth/register', regData).pipe(
      switchMap(() => {
        console.log(`AuthService - Local provision successful. Logging in...`);
        // Use standard login() for redirection/state
        return this.login({ username, password });
      }),
      catchError(err => {
        console.error('AuthService - Provisioning failed:', err);
        return throwError(() => new Error('Failed to create internal profile for Univen user.'));
      })
    );
  }

  /**
   * Get current user from backend
   */
  getCurrentUser(): Observable<CurrentUser> {
    return this.api.get<CurrentUser>('auth/me').pipe(
      tap(user => {
        this.storage.setItem('currentUser', user);
        this.currentUserSubject.next(user);
      })
    );
  }

  /**
   * Check if user is logged in
   */
  isLoggedIn(): boolean {
    const token = this.storage.getItemString('authToken');
    const user = this.storage.getItem<CurrentUser>('currentUser');
    const isLoggedIn = !!(token && user);

    // Debug logging
    if (!isLoggedIn) {
      console.log('isLoggedIn check - Token:', !!token, 'User:', !!user);
    }

    return isLoggedIn;
  }

  /**
   * Get current user (synchronous)
   */
  getCurrentUserSync(): CurrentUser | null {
    return this.currentUserSubject.value || this.storage.getItem<CurrentUser>('currentUser');
  }

  /**
   * Get current user from server and update local state
   */
  getCurrentUserFromServer(): Observable<CurrentUser> {
    return this.api.get<CurrentUser>('auth/me').pipe(
      map(user => {
        this.storage.setItem('currentUser', user);
        this.currentUserSubject.next(user);
        return user;
      })
    );
  }

  /**
   * Get user role
   */
  getUserRole(): 'SUPER_ADMIN' | 'ADMIN' | 'SUPERVISOR' | 'INTERN' | null {
    const user = this.getCurrentUserSync();
    return user?.role || null;
  }

  /**
   * Check if user has specific role
   */
  hasRole(role: 'SUPER_ADMIN' | 'ADMIN' | 'SUPERVISOR' | 'INTERN'): boolean {
    return this.getUserRole() === role;
  }

  /**
   * Logout user
   */
  logout(): void {
    // Disconnect WebSocket
    try {
      const wsService = this.getWebSocketService();
      wsService.disconnect();
      console.log('✅ WebSocket disconnected on logout');
    } catch (error) {
      console.warn('⚠️ Could not disconnect WebSocket:', error);
    }

    // Clear notification state so next user starts fresh
    try {
      this.getNotificationService().clearNotificationsState();
    } catch (error) {
      console.warn('⚠️ Could not clear notifications on logout:', error);
    }

    this.storage.removeItem('authToken');
    this.storage.removeItem('currentUser');
    this.currentUserSubject.next(null);
    // Clear preloaded data cache
    this.dataPreloadService.clearCache();
    this.router.navigate(['/login']);
  }

  /**
   * Redirect user to appropriate dashboard after login
   */
  private redirectAfterLogin(role: string): void {
    const user = this.currentUserSubject.value;
    if (user && user.requiresPasswordChange) {
      console.log('🔒 Password change required. Redirecting to force-password-change page.');
      this.router.navigate(['/auth/force-password-change']);
      return;
    }

    switch (role) {
      case 'SUPER_ADMIN':
        this.router.navigate(['/super-admin/super-admin-dashboard']);
        break;
      case 'ADMIN':
        this.router.navigate(['/admin/admin-dashboard']);
        break;
      case 'SUPERVISOR':
        this.router.navigate(['/supervisor/supervisor-dashboard']);
        break;
      case 'INTERN':
        if (user && user.hasFaceData) {
          console.log('👤 Face data found. Redirecting to face-verification.');
          this.router.navigate(['/auth/face-verification']);
        } else {
          console.log('👤 No face data found. Redirecting to face-registration.');
          this.router.navigate(['/auth/face-registration']);
        }
        break;
      default:
        this.router.navigate(['/login']);
    }
  }

  /**
   * Get auth token
   */
  getToken(): string | null {
    // Get token as plain string (not JSON-parsed) to match how it's stored
    return this.storage.getItemString('authToken');
  }

  /**
   * Update current user in storage (for profile updates)
   */
  updateCurrentUser(user: CurrentUser): void {
    this.storage.setItem('currentUser', user);
    this.currentUserSubject.next(user);
  }

  /**
   * Update both token and user data (used after department selection)
   */
  setAuthData(token: string, user: CurrentUser): void {
    this.storage.setItemString('authToken', token);
    this.storage.setItem('currentUser', user);
    this.currentUserSubject.next(user);
  }

  /**
   * Load user from storage
   */
  private loadUserFromStorage(): void {
    const user = this.storage.getItem<CurrentUser>('currentUser');
    if (user) {
      this.currentUserSubject.next(user);
    }
  }

  /**
   * Get user name
   */
  getUserName(): string {
    const user = this.getCurrentUserSync();
    if (user?.name && user?.surname) {
      return `${user.name} ${user.surname}`;
    }
    return user?.name || user?.username || '';
  }

  /**
   * Get user email
   */
  getUserEmail(): string {
    const user = this.getCurrentUserSync();
    return user?.email || '';
  }
}

