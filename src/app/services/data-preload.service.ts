import { Injectable, Injector } from '@angular/core';
import { Observable, forkJoin, of, Subject } from 'rxjs';
import { catchError, map, switchMap, filter } from 'rxjs/operators';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { WebSocketService, WebSocketMessage } from './websocket.service';

/**
 * Service to preload all necessary data during login
 * This ensures dashboards have all data ready immediately
 */
@Injectable({
  providedIn: 'root'
})
export class DataPreloadService {
  private preloadCache: Map<string, any> = new Map();
  private authService: AuthService | null = null;
  private webSocketService: WebSocketService | null = null;
  private updateSubject = new Subject<{ key: string; data: any }>();

  constructor(
    private apiService: ApiService,
    private injector: Injector
  ) {
    // Setup WebSocket listeners after a short delay to avoid circular dependency issues
    setTimeout(() => this.setupWebSocketListeners(), 100);
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
   * Get AuthService lazily to avoid circular dependency
   */
  private getAuthService(): AuthService {
    if (!this.authService) {
      this.authService = this.injector.get(AuthService);
    }
    return this.authService;
  }

  /**
   * Preload all data based on user role
   * Returns Observable that completes when all data is loaded
   */
  preloadAllData(): Observable<boolean> {
    const authService = this.getAuthService();
    const currentUser = authService.getCurrentUserSync();
    if (!currentUser) {
      console.warn('No current user found for data preloading');
      return of(false);
    }

    const role = currentUser.role;
    console.log(`🔄 Preloading data for role: ${role}`);

    // Ensure WebSocket listeners are setup after login
    this.setupWebSocketListeners();

    switch (role) {
      case 'SUPER_ADMIN':
        return this.preloadSuperAdminData();
      case 'ADMIN':
        return this.preloadAdminData();
      case 'SUPERVISOR':
        return this.preloadSupervisorData();
      case 'INTERN':
        return this.preloadInternData();
      default:
        console.warn(`Unknown role for preloading: ${role}`);
        return of(true);
    }
  }

  /**
   * Preload Super Admin data
   */
  private preloadSuperAdminData(): Observable<boolean> {
    const requests: Observable<any>[] = [
      // Load all admins
      this.apiService.get('super-admin/admins').pipe(
        catchError(err => {
          console.error('Error preloading admins:', err);
          return of([]);
        })
      ),
      // Load all departments
      this.apiService.get('departments').pipe(
        catchError(err => {
          console.error('Error preloading departments:', err);
          return of([]);
        })
      )
    ];

    return forkJoin(requests).pipe(
      map(([admins, departments]) => {
        this.setCachedData('admins', admins);
        this.setCachedData('departments', departments);
        console.log(`✅ Preloaded Super Admin data:`);
        console.log(`   - ${admins?.length || 0} admins`);
        console.log(`   - ${departments?.length || 0} departments`);
        return true;
      }),
      catchError(err => {
        console.error('Error during Super Admin data preload:', err);
        return of(true); // Continue even if preload fails
      })
    );
  }

  /**
   * Preload Admin data
   */
  private preloadAdminData(): Observable<boolean> {
    const requests: Observable<any>[] = [
      // Load all users
      this.apiService.get('admins/users').pipe(
        catchError(err => {
          console.error('Error preloading users:', err);
          return of({ users: [], count: 0 });
        })
      ),
      // Load all leave requests
      this.apiService.get('leave').pipe(
        catchError(err => {
          console.error('Error preloading leave requests:', err);
          return of([]);
        })
      ),
      // Load all interns
      this.apiService.get('interns').pipe(
        catchError(err => {
          console.error('Error preloading interns:', err);
          return of([]);
        })
      ),
      // Load all supervisors
      this.apiService.get('supervisors').pipe(
        catchError(err => {
          console.error('Error preloading supervisors:', err);
          return of([]);
        })
      ),
      // Load all departments
      this.apiService.get('departments').pipe(
        catchError(err => {
          console.error('Error preloading departments:', err);
          return of([]);
        })
      )
    ];

    return forkJoin(requests).pipe(
      map(([usersResponse, leaveRequests, interns, supervisors, departments]) => {
        // Handle users response - could be array or object with users property
        const users = Array.isArray(usersResponse) ? usersResponse : (usersResponse?.users || []);
        const usersCount = usersResponse?.count || users.length;

        this.setCachedData('users', users);
        this.setCachedData('usersCount', usersCount);
        this.setCachedData('leaveRequests', leaveRequests || []);
        this.setCachedData('interns', interns || []);
        this.setCachedData('supervisors', supervisors || []);
        this.setCachedData('departments', departments || []);

        console.log(`✅ Preloaded Admin data:`);
        console.log(`   - ${usersCount} users`);
        console.log(`   - ${leaveRequests?.length || 0} leave requests`);
        console.log(`   - ${interns?.length || 0} interns`);
        console.log(`   - ${supervisors?.length || 0} supervisors`);
        console.log(`   - ${departments?.length || 0} departments`);

        return true;
      }),
      catchError(err => {
        console.error('Error during Admin data preload:', err);
        return of(true);
      })
    );
  }

  /**
   * Preload Supervisor data
   */
  private preloadSupervisorData(): Observable<boolean> {
    const authService = this.getAuthService();
    const currentUser = authService.getCurrentUserSync();
    if (!currentUser || !currentUser.id) {
      console.warn('No supervisor ID found for preloading');
      return of(true);
    }

    // For supervisors, we need to:
    // 1. Get all interns (they'll be filtered by supervisor on frontend)
    // 2. Get all leave requests (they'll be filtered by intern IDs on frontend)
    const requests: Observable<any>[] = [
      // Load all interns (supervisor will filter by supervisorId)
      this.apiService.get('interns').pipe(
        catchError(err => {
          console.error('Error preloading supervisor interns:', err);
          return of([]);
        })
      ),
      // Load all leave requests (will be filtered by intern IDs)
      this.apiService.get('leave').pipe(
        catchError(err => {
          console.error('Error preloading supervisor leave requests:', err);
          return of([]);
        })
      )
    ];

    return forkJoin(requests).pipe(
      map(([interns, leaveRequests]) => {
        // Filter interns for this supervisor
        const supervisorId = currentUser.id;
        const assignedInterns = (interns || []).filter((intern: any) =>
          intern.supervisorId === supervisorId || intern.supervisor?.id === supervisorId
        );

        // Filter leave requests for supervisor's interns
        const internIds = assignedInterns.map((i: any) => i.id || i.internId);
        const filteredLeaveRequests = (leaveRequests || []).filter((lr: any) =>
          internIds.includes(lr.internId || lr.intern?.id || lr.intern?.internId)
        );

        this.setCachedData('interns', assignedInterns);
        this.setCachedData('leaveRequests', filteredLeaveRequests);

        console.log(`✅ Preloaded Supervisor data:`);
        console.log(`   - ${assignedInterns.length} assigned interns`);
        console.log(`   - ${filteredLeaveRequests.length} leave requests`);

        return true;
      }),
      catchError(err => {
        console.error('Error during Supervisor data preload:', err);
        return of(true);
      })
    );
  }

  /**
   * Preload Intern data
   */
  private preloadInternData(): Observable<boolean> {
    const authService = this.getAuthService();
    const currentUser = authService.getCurrentUserSync();
    const userEmail = currentUser?.email || currentUser?.username;

    // First, get all interns to find the current user's intern profile
    return this.apiService.get<any[]>('interns').pipe(
      switchMap((interns: any[]) => {
        // Find intern by email
        const intern = interns.find((i: any) =>
          i.email?.toLowerCase() === userEmail?.toLowerCase()
        );

        if (!intern) {
          console.warn('⚠️ Intern profile not found for preloading');
          // Still try to load leave requests
          return this.apiService.get<any[]>('leave/my-leave').pipe(
            map((leaveRequests: any[]) => {
              this.setCachedData('leaveRequests', leaveRequests || []);
              this.setCachedData('attendance', []);
              this.setCachedData('profile', null);
              console.log(`✅ Preloaded Intern data (partial):`);
              console.log(`   - ${leaveRequests?.length || 0} leave requests`);
              console.log(`   - 0 attendance records (profile not found)`);
              return true;
            }),
            catchError(() => {
              this.setCachedData('leaveRequests', []);
              this.setCachedData('attendance', []);
              this.setCachedData('profile', null);
              return of(true);
            })
          );
        }

        const internId = intern.id || intern.internId;
        console.log(`  Found intern ID: ${internId} for ${userEmail}`);

        // Load all intern data in parallel
        return forkJoin({
          leaveRequests: this.apiService.get<any[]>('leave/my-leave').pipe(
            catchError(err => {
              console.error('Error preloading intern leave requests:', err);
              return of([]);
            })
          ),
          attendance: this.apiService.get<any[]>(`attendance/intern/${internId}`).pipe(
            catchError(err => {
              console.error('Error preloading intern attendance:', err);
              return of([]);
            })
          ),
          profile: of(intern)
        }).pipe(
          map((data: any) => {
            this.setCachedData('leaveRequests', data.leaveRequests || []);
            this.setCachedData('attendance', data.attendance || []);
            this.setCachedData('profile', data.profile);

            console.log(`✅ Preloaded Intern data:`);
            console.log(`   - ${data.leaveRequests?.length || 0} leave requests`);
            console.log(`   - ${data.attendance?.length || 0} attendance records`);
            console.log(`   - Profile: ${data.profile ? 'Loaded' : 'Not found'}`);

            return true;
          }),
          catchError(() => of(true))
        );
      }),
      catchError(err => {
        console.error('Error during Intern data preload:', err);
        return of(true);
      })
    );
  }

  /**
   * Get cached data by key
   */
  getCachedData<T>(key: string): T | null {
    return this.preloadCache.get(key) || null;
  }

  /**
   * Set cached data
   */
  setCachedData(key: string, data: any): void {
    this.preloadCache.set(key, data);
  }

  /**
   * Check if data is cached
   */
  hasCachedData(key: string): boolean {
    return this.preloadCache.has(key);
  }

  /**
   * Clear all cached data (useful on logout)
   */
  clearCache(): void {
    this.preloadCache.clear();
    console.log('🗑️ Cleared data preload cache');
  }

  /**
   * Clear specific cached data
   */
  clearCachedData(key: string): void {
    this.preloadCache.delete(key);
  }

  /**
   * Refresh specific data and update cache
   */
  refreshData(key: string, request: Observable<any>): Observable<any> {
    return request.pipe(
      map(data => {
        this.setCachedData(key, data);
        return data;
      }),
      catchError(err => {
        console.error(`Error refreshing ${key}:`, err);
        return of(null);
      })
    );
  }

  /**
   * Setup WebSocket listeners for real-time updates
   */
  private setupWebSocketListeners(): void {
    try {
      const authService = this.getAuthService();
      const wsService = this.getWebSocketService();

      // Only setup listeners and show warnings if user is logged in
      const isLoggedIn = authService.isLoggedIn();

      if (!isLoggedIn) {
        // User not logged in yet - silently skip WebSocket setup
        return;
      }

      // Connect to WebSocket
      console.log('🔌 Initiating WebSocket connection from DataPreloadService...');
      wsService.connect();

      // Check connection status
      wsService.getConnectionStatus$().subscribe(connected => {
        if (connected) {
          console.log('✅ WebSocket is connected - real-time updates active');
        } else {
          // Only log as debug, not warning, since this is expected before connection
          console.debug('WebSocket is disconnected - will connect after login');
        }
      });

      // Leave Request Updates
      wsService.leaveRequestUpdates$.subscribe((message: WebSocketMessage) => {
        console.log('🔄 Real-time leave request update received:', message);
        this.handleLeaveRequestUpdate(message);
      });

      // Admin Updates
      wsService.adminUpdates$.subscribe((message: WebSocketMessage) => {
        console.log('🔄 Real-time admin update received:', message);
        this.handleAdminUpdate(message);
      });

      // Intern Updates
      wsService.internUpdates$.subscribe((message: WebSocketMessage) => {
        console.log('🔄 Real-time intern update received:', message);
        this.handleInternUpdate(message);
      });

      // Supervisor Updates
      wsService.supervisorUpdates$.subscribe((message: WebSocketMessage) => {
        console.log('🔄 Real-time supervisor update received:', message);
        this.handleSupervisorUpdate(message);
      });

      // Attendance Updates
      wsService.attendanceUpdates$.subscribe((message: WebSocketMessage) => {
        console.log('🔄 Real-time attendance update received:', message);
        this.handleAttendanceUpdate(message);
      });

      // User Updates
      wsService.userUpdates$.subscribe((message: WebSocketMessage) => {
        console.log('🔄 Real-time user update received:', message);
        this.handleUserUpdate(message);
      });

      // Department Updates
      wsService.departmentUpdates$.subscribe((message: WebSocketMessage) => {
        console.log('🔄 Real-time department update received:', message);
        this.handleDepartmentUpdate(message);
      });

      // Location Updates
      wsService.locationUpdates$.subscribe((message: WebSocketMessage) => {
        console.log('🔄 Real-time location update received:', message);
        this.handleLocationUpdate(message);
      });
    } catch (error) {
      console.warn('⚠️ Could not setup WebSocket listeners:', error);
    }
  }

  /**
   * Handle leave request updates
   */
  private handleLeaveRequestUpdate(message: WebSocketMessage): void {
    const cachedRequests = this.getCachedData<any[]>('leaveRequests') || [];
    const eventType = message.type;
    const data = message.data;

    if (eventType.includes('CREATED')) {
      // Add new leave request
      cachedRequests.push(data);
      this.setCachedData('leaveRequests', cachedRequests);
      this.updateSubject.next({ key: 'leaveRequests', data: cachedRequests });
    } else if (eventType.includes('APPROVED') || eventType.includes('REJECTED')) {
      // Update existing leave request
      const index = cachedRequests.findIndex((lr: any) =>
        (lr.requestId || lr.id) === (data.requestId || data.id)
      );
      if (index !== -1) {
        cachedRequests[index] = { ...cachedRequests[index], ...data };
        this.setCachedData('leaveRequests', cachedRequests);
        this.updateSubject.next({ key: 'leaveRequests', data: cachedRequests });
      } else {
        // If not in cache, refresh from server
        this.refreshLeaveRequests();
      }
    }
  }

  /**
   * Handle admin updates
   */
  private handleAdminUpdate(message: WebSocketMessage): void {
    const cachedAdmins = this.getCachedData<any[]>('admins') || [];
    const eventType = message.type;
    const data = message.data;

    if (eventType.includes('CREATED')) {
      cachedAdmins.push(data);
      this.setCachedData('admins', cachedAdmins);
      this.updateSubject.next({ key: 'admins', data: cachedAdmins });
    } else if (eventType.includes('UPDATED') || eventType.includes('ACTIVATED') || eventType.includes('DEACTIVATED')) {
      const index = cachedAdmins.findIndex((a: any) =>
        (a.adminId || a.id) === (data.adminId || data.id)
      );
      if (index !== -1) {
        cachedAdmins[index] = { ...cachedAdmins[index], ...data };
        this.setCachedData('admins', cachedAdmins);
        this.updateSubject.next({ key: 'admins', data: cachedAdmins });
      }
    } else if (eventType.includes('DELETED')) {
      const filtered = cachedAdmins.filter((a: any) =>
        (a.adminId || a.id) !== (data.adminId || data.id)
      );
      this.setCachedData('admins', filtered);
      this.updateSubject.next({ key: 'admins', data: filtered });
    }
  }

  /**
   * Handle intern updates
   */
  private handleInternUpdate(message: WebSocketMessage): void {
    const cachedInterns = this.getCachedData<any[]>('interns') || [];
    const eventType = message.type;
    const data = message.data;

    if (eventType.includes('CREATED')) {
      cachedInterns.push(data);
      this.setCachedData('interns', cachedInterns);
      this.updateSubject.next({ key: 'interns', data: cachedInterns });
    } else if (eventType.includes('UPDATED') || eventType.includes('SIGNATURE_UPDATED') || eventType.includes('LOCATION_ASSIGNED')) {
      const index = cachedInterns.findIndex((i: any) =>
        (i.internId || i.id) === (data.internId || data.id)
      );
      if (index !== -1) {
        cachedInterns[index] = { ...cachedInterns[index], ...data };
        this.setCachedData('interns', cachedInterns);
        this.updateSubject.next({ key: 'interns', data: cachedInterns });
      }
    } else if (eventType.includes('DELETED')) {
      const filtered = cachedInterns.filter((i: any) =>
        (i.internId || i.id) !== (data.internId || data.id)
      );
      this.setCachedData('interns', filtered);
      this.updateSubject.next({ key: 'interns', data: filtered });
    }
  }

  /**
   * Handle supervisor updates
   */
  private handleSupervisorUpdate(message: WebSocketMessage): void {
    const cachedSupervisors = this.getCachedData<any[]>('supervisors') || [];
    const eventType = message.type;
    const data = message.data;

    if (eventType.includes('CREATED')) {
      cachedSupervisors.push(data);
      this.setCachedData('supervisors', cachedSupervisors);
      this.updateSubject.next({ key: 'supervisors', data: cachedSupervisors });
    } else if (eventType.includes('UPDATED') || eventType.includes('ACTIVATED') || eventType.includes('DEACTIVATED') || eventType.includes('SIGNATURE_UPDATED')) {
      const index = cachedSupervisors.findIndex((s: any) =>
        (s.supervisorId || s.id) === (data.supervisorId || data.id)
      );
      if (index !== -1) {
        cachedSupervisors[index] = { ...cachedSupervisors[index], ...data };
        this.setCachedData('supervisors', cachedSupervisors);
        this.updateSubject.next({ key: 'supervisors', data: cachedSupervisors });
      }
    } else if (eventType.includes('DELETED')) {
      const filtered = cachedSupervisors.filter((s: any) =>
        (s.supervisorId || s.id) !== (data.supervisorId || data.id)
      );
      this.setCachedData('supervisors', filtered);
      this.updateSubject.next({ key: 'supervisors', data: filtered });
    }
  }

  /**
   * Handle attendance updates
   */
  private handleAttendanceUpdate(message: WebSocketMessage): void {
    const cachedAttendance = this.getCachedData<any[]>('attendance') || [];
    const eventType = message.type;
    const data = message.data;

    if (eventType.includes('CREATED') || eventType.includes('UPDATED') || eventType.includes('SIGNED_IN') || eventType.includes('SIGNED_OUT')) {
      const index = cachedAttendance.findIndex((a: any) =>
        (a.attendanceId || a.id) === (data.attendanceId || data.id)
      );
      if (index !== -1) {
        cachedAttendance[index] = { ...cachedAttendance[index], ...data };
      } else {
        cachedAttendance.push(data);
      }
      this.setCachedData('attendance', cachedAttendance);
      this.updateSubject.next({ key: 'attendance', data: cachedAttendance });
    }
  }

  /**
   * Handle user updates
   */
  private handleUserUpdate(message: WebSocketMessage): void {
    const cachedUsers = this.getCachedData<any[]>('users') || [];
    const eventType = message.type;
    const data = message.data;

    if (eventType.includes('CREATED')) {
      cachedUsers.push(data);
      this.setCachedData('users', cachedUsers);
      this.updateSubject.next({ key: 'users', data: cachedUsers });
    } else if (eventType.includes('UPDATED') || eventType.includes('ACTIVATED') || eventType.includes('DEACTIVATED')) {
      const index = cachedUsers.findIndex((u: any) =>
        (u.id) === (data.id)
      );
      if (index !== -1) {
        cachedUsers[index] = { ...cachedUsers[index], ...data };
        this.setCachedData('users', cachedUsers);
        this.updateSubject.next({ key: 'users', data: cachedUsers });
      }
    }
  }

  /**
   * Handle department updates
   */
  private handleDepartmentUpdate(message: WebSocketMessage): void {
    const cachedDepartments = this.getCachedData<any[]>('departments') || [];
    const eventType = message.type;
    const data = message.data;

    if (eventType.includes('CREATED')) {
      cachedDepartments.push(data);
      this.setCachedData('departments', cachedDepartments);
      this.updateSubject.next({ key: 'departments', data: cachedDepartments });
    } else if (eventType.includes('UPDATED') || eventType.includes('ACTIVATED') || eventType.includes('DEACTIVATED') || eventType.includes('FIELD_')) {
      const index = cachedDepartments.findIndex((d: any) =>
        (d.departmentId || d.id) === (data.departmentId || data.id)
      );
      if (index !== -1) {
        // For field updates, we might want to refresh the whole department object
        // but here we just merge data
        cachedDepartments[index] = { ...cachedDepartments[index], ...data };
        this.setCachedData('departments', cachedDepartments);
        this.updateSubject.next({ key: 'departments', data: cachedDepartments });
      }
    } else if (eventType.includes('DELETED')) {
      const filtered = cachedDepartments.filter((d: any) =>
        (d.departmentId || d.id) !== (data.departmentId || data.id)
      );
      this.setCachedData('departments', filtered);
      this.updateSubject.next({ key: 'departments', data: filtered });
    }
  }

  /**
   * Handle location updates
   */
  private handleLocationUpdate(message: WebSocketMessage): void {
    const cachedLocations = this.getCachedData<any[]>('locations') || [];
    const eventType = message.type;
    const data = message.data;

    if (eventType.includes('CREATED')) {
      cachedLocations.push(data);
      this.setCachedData('locations', cachedLocations);
      this.updateSubject.next({ key: 'locations', data: cachedLocations });
    } else if (eventType.includes('UPDATED')) {
      const index = cachedLocations.findIndex((l: any) =>
        (l.locationId || l.id) === (data.locationId || data.id)
      );
      if (index !== -1) {
        cachedLocations[index] = { ...cachedLocations[index], ...data };
        this.setCachedData('locations', cachedLocations);
        this.updateSubject.next({ key: 'locations', data: cachedLocations });
      }
    } else if (eventType.includes('DELETED')) {
      const filtered = cachedLocations.filter((l: any) =>
        (l.locationId || l.id) !== (data.locationId || data.id)
      );
      this.setCachedData('locations', filtered);
      this.updateSubject.next({ key: 'locations', data: filtered });
    }
  }

  /**
   * Refresh leave requests from server
   */
  private refreshLeaveRequests(): void {
    this.apiService.get('leave').subscribe({
      next: (data) => {
        this.setCachedData('leaveRequests', data);
        this.updateSubject.next({ key: 'leaveRequests', data });
      },
      error: (err) => console.error('Error refreshing leave requests:', err)
    });
  }

  /**
   * Get update observable for a specific cache key
   */
  getUpdateObservable(key: string): Observable<any> {
    return this.updateSubject.asObservable().pipe(
      filter(update => update.key === key),
      map(update => update.data)
    );
  }
}

