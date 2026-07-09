import { Injectable } from '@angular/core';
import { AuthService, CurrentUser } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class Auth {

  constructor(private authService: AuthService) {
    // No mock data - using real backend data from AuthService
  }

  // ✅ Check if a user is logged in (using real backend data)
  isLoggedIn(): boolean {
    return this.authService.isLoggedIn();
  }

  // ✅ Get current logged-in user info (from backend)
  getCurrentUser(): CurrentUser | null {
    return this.authService.getCurrentUserSync();
  }

  // ✅ Get user name (from backend)
  getAdminName(): string {
    return this.authService.getUserName();
  }

  // ✅ Get user email (from backend)
  getAdminEmail(): string {
    return this.authService.getUserEmail();
  }

  // ✅ Get user role (from backend)
  getRole(): string | null {
    return this.authService.getUserRole();
  }

  // ✅ Get user department (from backend) - Works for ADMIN, SUPERVISOR, and INTERN
  getDepartment(): string | null {
    const user = this.getCurrentUser();
    if (!user) return null;
    
    // Department is available for ADMIN, SUPERVISOR, and INTERN roles
    return user.department || null;
  }

  // ✅ Get user department ID (from backend) - Works for ADMIN, SUPERVISOR, and INTERN
  getDepartmentId(): number | null | undefined {
    const user = this.getCurrentUser();
    if (!user) return null;
    
    // DepartmentId is available for ADMIN, SUPERVISOR, and INTERN roles
    return user.departmentId || null;
  }

  // ✅ Get user field (from backend) - Works for ADMIN, SUPERVISOR, and INTERN
  getField(): string | null {
    const user = this.getCurrentUser();
    if (!user) return null;
    
    // Field is available for ADMIN, SUPERVISOR, and INTERN roles
    return user.field || null;
  }

  // ✅ Get field for ADMIN users (explicit method)
  getAdminField(): string | null {
    const user = this.getCurrentUser();
    if (!user || user.role !== 'ADMIN') return null;
    return user.field || null;
  }

  // ✅ Get field for SUPERVISOR users (explicit method)
  getSupervisorField(): string | null {
    const user = this.getCurrentUser();
    if (!user || user.role !== 'SUPERVISOR') return null;
    return user.field || null;
  }

  // ✅ Get field for INTERN users (explicit method)
  getInternField(): string | null {
    const user = this.getCurrentUser();
    if (!user || user.role !== 'INTERN') return null;
    return user.field || null;
  }

  // ✅ Get department for ADMIN users (explicit method)
  getAdminDepartment(): string | null {
    const user = this.getCurrentUser();
    if (!user || user.role !== 'ADMIN') return null;
    return user.department || null;
  }

  // ✅ Get department for SUPERVISOR users (explicit method)
  getSupervisorDepartment(): string | null {
    const user = this.getCurrentUser();
    if (!user || user.role !== 'SUPERVISOR') return null;
    return user.department || null;
  }

  // ✅ Get department for INTERN users (explicit method)
  getInternDepartment(): string | null {
    const user = this.getCurrentUser();
    if (!user || user.role !== 'INTERN') return null;
    return user.department || null;
  }

  // ✅ Get department ID for ADMIN users (explicit method)
  getAdminDepartmentId(): number | null | undefined {
    const user = this.getCurrentUser();
    if (!user || user.role !== 'ADMIN') return null;
    return user.departmentId || null;
  }

  // ✅ Get department ID for SUPERVISOR users (explicit method)
  getSupervisorDepartmentId(): number | null | undefined {
    const user = this.getCurrentUser();
    if (!user || user.role !== 'SUPERVISOR') return null;
    return user.departmentId || null;
  }

  // ✅ Get department ID for INTERN users (explicit method)
  getInternDepartmentId(): number | null | undefined {
    const user = this.getCurrentUser();
    if (!user || user.role !== 'INTERN') return null;
    return user.departmentId || null;
  }

  // ✅ Log out (using real AuthService)
  logout(): void {
    this.authService.logout();
  }

  // ✅ Save user (deprecated - use AuthService.login() instead)
  // This method is kept for backward compatibility but delegates to AuthService
  saveUser(user: any): void {
    // Note: This is deprecated. Use AuthService.login() instead.
    // The user is automatically saved when logging in through AuthService
    console.warn('saveUser() is deprecated. Use AuthService.login() instead.');
  }
}
