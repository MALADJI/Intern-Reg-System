import { Routes } from '@angular/router';
import { Login } from './auth/login/login';
import { InternDashboard } from './intern/intern-dashboard/intern-dashboard';
import { SupervisorDashboard } from './supervisor/supervisor-dashboard/supervisor-dashboard';
import { AdminDashboard } from './admin/admin-dashboard/admin-dashboard';
import { SuperAdminDashboard } from './super-admin/super-admin-dashboard/super-admin-dashboard';
import { SignUp } from './sign-up/sign-up';
import { ForgotPassword } from './auth/forgot-password/forgot-password';
import { ResetPassword } from './auth/reset-password/reset-password';
import { Profile } from './profile/profile';
import { AuthGuard } from './guards/auth.guard';
import { RoleGuard } from './guards/role.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: Login },
  { path: 'auth/forgot-password', component: ForgotPassword },
  { path: 'auth/reset-password', component: ResetPassword },
  {
    path: 'profile',
    component: Profile,
    canActivate: [AuthGuard]
  },
  {
    path: 'intern/intern-dashboard',
    component: InternDashboard,
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: ['INTERN'] }
  },
  {
    path: 'supervisor/supervisor-dashboard',
    component: SupervisorDashboard,
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: ['SUPERVISOR'] }
  },
  {
    path: 'admin/admin-dashboard',
    component: AdminDashboard,
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: ['ADMIN'] }
  },
  {
    path: 'super-admin/super-admin-dashboard',
    component: SuperAdminDashboard,
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: ['SUPER_ADMIN'] }
  },
  {
    path: 'sign-up/sign-up',
    component: SignUp
  },
];
