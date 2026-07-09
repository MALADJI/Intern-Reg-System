import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: 'ADMIN' | 'SUPERVISOR' | 'INTERN' | 'SUPER_ADMIN';
  department?: string;
  field?: string;
  active?: boolean;
}

export interface InternUser {
  userId: number;
  username: string;
  email: string;
  role: string;
  createdAt: string;
  hasProfile: boolean;
  internName: string;
  internId: string;
}

export interface InternUsersResponse {
  count: number;
  internUsers: InternUser[];
}

@Injectable({
  providedIn: 'root'
})
export class AdminService {
  constructor(private api: ApiService) {}

  /**
   * Get all users (admins, supervisors, interns)
   * This endpoint is used by admin dashboard to get a comprehensive user list
   */
  getAllUsers(): Observable<AdminUser[]> {
    return this.api.get<AdminUser[]>('admins/users');
  }

  /**
   * Get all intern users with their login credentials
   */
  getAllInternUsers(): Observable<InternUsersResponse> {
    return this.api.get<InternUsersResponse>('admins/intern-users');
  }

  /**
   * Reset user password (Admin only)
   */
  resetUserPassword(email: string, newPassword: string): Observable<{ message: string; email: string; username: string }> {
    return this.api.post<{ message: string; email: string; username: string }>('admins/reset-user-password', {
      email,
      newPassword
    });
  }
}

