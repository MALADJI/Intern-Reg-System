import { Injectable, Injector } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, BehaviorSubject, throwError } from 'rxjs';
import { tap, map, catchError } from 'rxjs/operators';
import { ApiService } from './api.service';
import { StorageService } from './storage.service';
import { DataPreloadService } from './data-preload.service';
import { WebSocketService } from './websocket.service';

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
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private currentUserSubject = new BehaviorSubject<CurrentUser | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();
  private webSocketService: WebSocketService | null = null;

  constructor(
    private api: ApiService,
    private storage: StorageService,
    private router: Router,
    private dataPreloadService: DataPreloadService,
    private injector: Injector
  ) {
    // Load user from storage on init
    this.loadUserFromStorage();
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
        this.router.navigate(['/intern/intern-dashboard']);
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

