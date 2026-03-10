import { Injectable, Injector } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { StorageService } from './storage.service';
import { AuthService } from './auth.service';

/**
 * API Configuration
 * Dynamically determines the backend URL based on the current hostname
 * This allows the system to work on both localhost and private network
 */
function getApiBaseUrl(): string {
  // Get the current hostname (e.g., 'localhost', '192.168.1.100', etc.)
  const hostname = window.location.hostname;

  // If accessing via localhost, use localhost for backend
  // Otherwise, use the same hostname (for network access)
  const backendHost = hostname === 'localhost' || hostname === '127.0.0.1'
    ? 'localhost'
    : hostname;

  // Backend runs on port 8082
  return `http://${backendHost}:8082/api`;
}

export const API_BASE_URL = getApiBaseUrl();

/**
 * Base API Service with common HTTP methods
 */
@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private readonly baseUrl = API_BASE_URL;

  constructor(
    private http: HttpClient,
    private storage: StorageService,
    private router: Router,
    private injector: Injector
  ) { }

  /**
   * Get authorization headers
   * @param endpoint - The API endpoint being called (to determine if token is required)
   */
  private getHeaders(endpoint?: string): HttpHeaders {
    // Get token as plain string (not JSON-parsed) to avoid parsing issues
    const token = this.storage.getItemString('authToken');
    let headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });

    // List of public endpoints that don't require authentication
    const publicEndpoints = [
      'auth/login',
      'auth/register',
      'auth/send-verification-code',
      'auth/forgot-password',
      'auth/reset-password'
    ];

    const isPublicEndpoint = endpoint && publicEndpoints.some(publicEndpoint => endpoint.includes(publicEndpoint));

    if (token) {
      // Clean token - remove any extra whitespace and quotes
      const cleanToken = token.trim().replace(/^["']|["']$/g, '');

      // Only log token for authenticated endpoints (not public ones)
      if (!isPublicEndpoint) {
        console.log('API Request - Token present:', !!cleanToken, 'Length:', cleanToken.length, 'Preview:', cleanToken.substring(0, 20) + '...');
      }

      if (cleanToken) {
        const authHeader = `Bearer ${cleanToken}`;
        headers = headers.set('Authorization', authHeader);

        // Only log Authorization header for authenticated endpoints
        if (!isPublicEndpoint) {
          console.log('API Request - Authorization header set:', authHeader.substring(0, 30) + '...');
        }
      }
    } else {
      // Only warn about missing token for authenticated endpoints
      if (!isPublicEndpoint) {
        console.warn('API Request - No token found in storage');
      }
    }

    return headers;
  }

  /**
   * GET request
   */
  get<T>(endpoint: string, params?: any): Observable<T> {
    let httpParams = new HttpParams();
    if (params) {
      Object.keys(params).forEach(key => {
        if (params[key] !== null && params[key] !== undefined) {
          httpParams = httpParams.set(key, params[key].toString());
        }
      });
    }

    const headers = this.getHeaders(endpoint);
    const url = `${this.baseUrl}/${endpoint}`;

    // Only log full request details for authenticated endpoints
    const publicEndpoints = ['auth/login', 'auth/register', 'auth/send-verification-code', 'auth/forgot-password', 'auth/reset-password'];
    const isPublicEndpoint = publicEndpoints.some(publicEndpoint => endpoint.includes(publicEndpoint));

    if (!isPublicEndpoint) {
      console.log('API GET Request:', {
        url,
        hasAuth: headers.has('Authorization'),
        authHeader: headers.get('Authorization')?.substring(0, 30) + '...' || 'None'
      });
    }

    return this.http.get<T>(url, {
      headers,
      params: httpParams
    }).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * POST request
   */
  post<T>(endpoint: string, body: any): Observable<T> {
    const headers = this.getHeaders(endpoint);
    const url = `${this.baseUrl}/${endpoint}`;

    // Only log full request details for authenticated endpoints (skip public endpoints)
    const publicEndpoints = ['auth/login', 'auth/register', 'auth/send-verification-code', 'auth/forgot-password', 'auth/reset-password'];
    const isPublicEndpoint = publicEndpoints.some(publicEndpoint => endpoint.includes(publicEndpoint));

    if (!isPublicEndpoint) {
      console.log('API POST Request:', {
        url,
        hasAuth: headers.has('Authorization'),
        authHeader: headers.get('Authorization')?.substring(0, 30) + '...' || 'None'
      });
    }

    return this.http.post<T>(url, body, {
      headers
    }).pipe(
      catchError((error) => {
        console.error(`POST ${endpoint} error:`, error);
        return this.handleError(error);
      })
    );
  }

  /**
   * PUT request
   */
  put<T>(endpoint: string, body: any): Observable<T> {
    return this.http.put<T>(`${this.baseUrl}/${endpoint}`, body, {
      headers: this.getHeaders(endpoint)
    }).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * DELETE request
   */
  delete<T>(endpoint: string): Observable<T> {
    return this.http.delete<T>(`${this.baseUrl}/${endpoint}`, {
      headers: this.getHeaders(endpoint)
    }).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * POST request with file upload
   */
  postFile<T>(endpoint: string, formData: FormData): Observable<T> {
    // For file uploads, don't set Content-Type header - let browser set it automatically
    // This is required for multipart/form-data to work correctly
    const token = this.storage.getItemString('authToken');
    let headers = new HttpHeaders();

    if (token) {
      // Clean token - remove any extra whitespace and quotes
      const cleanToken = token.trim().replace(/^["']|["']$/g, '');
      if (cleanToken) {
        headers = headers.set('Authorization', `Bearer ${cleanToken}`);
      }
    }

    return this.http.post<T>(`${this.baseUrl}/${endpoint}`, formData, {
      headers
    }).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * GET request for file download
   */
  downloadFile(endpoint: string, params?: any, filename?: string): Observable<Blob> {
    let httpParams = new HttpParams();
    if (params) {
      Object.keys(params).forEach(key => {
        if (params[key] !== null && params[key] !== undefined) {
          httpParams = httpParams.set(key, params[key].toString());
        }
      });
    }

    const headers = this.getHeaders(endpoint);

    return this.http.get(`${this.baseUrl}/${endpoint}`, {
      headers,
      params: httpParams,
      responseType: 'blob'
    }).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Intern Signature Endpoints
   */
  saveInternSignature(internId: number, signature: string): Observable<any> {
    return this.put<any>(`interns/${internId}/signature`, { signature });
  }

  getInternSignature(internId: number): Observable<any> {
    return this.get<any>(`interns/${internId}/signature`);
  }

  getInternSignatureImage(internId: number): Observable<Blob> {
    return this.downloadFile(`interns/${internId}/signature/image`);
  }

  /**
   * Handle HTTP errors
   */
  private handleError = (error: any): Observable<never> => {
    let errorMessage = 'An unknown error occurred';

    // Check for session invalidation (single session control)
    const isSessionInvalidated = error.status === 401 &&
      (error.error?.error === 'Session invalidated' ||
        error.error?.message?.includes('logged out because someone else logged in'));

    if (isSessionInvalidated) {
      console.error('❌ Session invalidated: User logged in from another browser');

      // Get AuthService via injector to avoid circular dependency
      try {
        const authService = this.injector.get(AuthService);

        // Show alert using Swal if available
        const Swal = (window as any).Swal;
        if (Swal) {
          Swal.fire({
            icon: 'warning',
            title: 'Session Expired',
            text: 'You have been logged out because someone else logged in with your account on another browser.',
            confirmButtonColor: '#26406e',
            allowOutsideClick: false
          }).then(() => {
            authService.logout();
          });
        } else {
          authService.logout();
        }
      } catch (e) {
        console.error('Error during auto-logout:', e);
        this.storage.removeItem('authToken');
        this.storage.removeItem('currentUser');
        this.router.navigate(['/login']);
      }

      return throwError(() => new Error('Session invalidated. Please login again.'));
    }

    if (error.error instanceof ErrorEvent) {
      // Client-side error
      errorMessage = `Error: ${error.error.message}`;
    } else {
      // Server-side error
      if (error.status === 401) {
        errorMessage = 'Unauthorized. Please check your credentials.';

        console.warn('401 Unauthorized - API request failed');
        console.warn('401 Error Details:', {
          url: error.url,
          status: error.status,
          statusText: error.statusText,
          message: errorMessage,
          errorBody: error.error
        });

        // Check if token exists and log it for debugging
        const token = this.storage.getItemString('authToken');
        console.warn('Token check on 401:', {
          tokenExists: !!token,
          tokenLength: token?.length || 0,
          tokenPreview: token ? token.substring(0, 30) + '...' : 'N/A'
        });

        // If we have a token but still get 401, it means:
        // 1. Token is invalid/expired
        // 2. Token was created with different secret key
        // 3. Backend authentication is not working
        // DO NOT automatically log out - let the user decide when to logout
        // This prevents accidental logouts from API errors
        if (token) {
          console.warn('Token exists but request was rejected - user remains logged in');
          console.warn('This could be due to:');
          console.warn('  1. Backend JWT secret mismatch');
          console.warn('  2. Token format issue');
          console.warn('  3. Backend authentication configuration');
          console.warn('User can manually logout if needed');
        }
      } else if (error.status === 403) {
        errorMessage = 'Forbidden. You do not have permission to access this resource.';
      } else if (error.status === 404) {
        errorMessage = 'Resource not found.';
      } else if (error.status === 500) {
        errorMessage = 'Server error. Please try again later.';
      } else if (error.error?.message) {
        errorMessage = error.error.message;
      } else if (error.error?.error) {
        errorMessage = error.error.error;
      } else {
        errorMessage = `Error Code: ${error.status}\nMessage: ${error.message}`;
      }
    }

    console.error('API Error:', errorMessage, error);
    return throwError(() => new Error(errorMessage));
  };
}

