import { Injectable } from '@angular/core';
import { Router, CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): boolean {
    // Give a small delay to ensure token is loaded from storage
    const token = this.authService.getToken();
    const user = this.authService.getCurrentUserSync();
    const isLoggedIn = !!(token && user);
    
    console.log('AuthGuard check - Route:', state.url);
    console.log('  Token exists:', !!token);
    console.log('  User exists:', !!user);
    console.log('  Is logged in:', isLoggedIn);
    
    if (isLoggedIn) {
      console.log('✓ AuthGuard - Access granted');
      return true;
    }

    // Not logged in, redirect to login page
    console.log('✗ AuthGuard - User not logged in, redirecting to login');
    console.log('  Token:', token);
    console.log('  User:', user);
    this.router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
    return false;
  }
}

