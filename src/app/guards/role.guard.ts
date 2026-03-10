import { Injectable } from '@angular/core';
import { Router, CanActivate, ActivatedRouteSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Injectable({
  providedIn: 'root'
})
export class RoleGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private router: Router
  ) { }

  canActivate(route: ActivatedRouteSnapshot): boolean {
    const expectedRoles = route.data['roles'] as Array<'SUPER_ADMIN' | 'ADMIN' | 'SUPERVISOR' | 'INTERN'>;

    console.log('RoleGuard check - Expected roles:', expectedRoles);

    if (!expectedRoles || expectedRoles.length === 0) {
      console.log('✓ RoleGuard - No role required, access granted');
      return true;
    }

    // First check if user is logged in
    if (!this.authService.isLoggedIn()) {
      console.log('✗ RoleGuard - User not logged in');
      this.router.navigate(['/login']);
      return false;
    }

    const userRole = this.authService.getUserRole();
    console.log('  User role:', userRole);
    console.log('  Expected roles:', expectedRoles);

    if (!userRole) {
      console.log('✗ RoleGuard - User role not found');
      this.router.navigate(['/login']);
      return false;
    }

    if (expectedRoles.includes(userRole)) {
      console.log('✓ RoleGuard - Access granted for role:', userRole);
      return true;
    }

    // User doesn't have required role, redirect to appropriate dashboard
    console.log('✗ RoleGuard - User does not have required role');
    console.log('  User role:', userRole);
    console.log('  Required roles:', expectedRoles);

    if (userRole === 'SUPER_ADMIN') {
      this.router.navigate(['/super-admin/super-admin-dashboard']);
    } else if (userRole === 'ADMIN') {
      this.router.navigate(['/admin/admin-dashboard']);
    } else if (userRole === 'SUPERVISOR') {
      this.router.navigate(['/supervisor/supervisor-dashboard']);
    } else if (userRole === 'INTERN') {
      this.router.navigate(['/intern/intern-dashboard']);
    } else {
      this.router.navigate(['/login']);
    }

    return false;
  }
}

