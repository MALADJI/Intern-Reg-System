import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export interface Admin {
  adminId: number;
  userId?: number;
  name: string;
  email: string;
  createdAt?: string;
  hasSignature?: boolean;
  active?: boolean;
  departmentId?: number;
  departmentName?: string;
}

export interface AdminInviteRequest {
  email: string;
  name?: string;
}

@Injectable({
  providedIn: 'root'
})
export class SuperAdminService {
  constructor(private api: ApiService) {}

  /**
   * Get all admins
   */
  getAllAdmins(): Observable<Admin[]> {
    return this.api.get<Admin[]>('super-admin/admins');
  }

  /**
   * Create a new admin
   */
  createAdmin(adminData: any): Observable<any> {
    return this.api.post<any>('super-admin/admins', adminData);
  }

  /**
   * Send admin invite email
   */
  sendAdminInvite(request: AdminInviteRequest): Observable<{ message: string; email: string }> {
    return this.api.post<{ message: string; email: string }>('super-admin/admins/send-invite', request);
  }

  /**
   * Update admin signature
   */
  updateAdminSignature(adminId: number, signature: string): Observable<{ message: string; adminId: number }> {
    return this.api.put<{ message: string; adminId: number }>(`super-admin/admins/${adminId}/signature`, { signature });
  }

  /**
   * Deactivate admin
   */
  deactivateAdmin(adminId: number): Observable<{ message: string; adminId: number; active: boolean }> {
    return this.api.put<{ message: string; adminId: number; active: boolean }>(`super-admin/admins/${adminId}/deactivate`, {});
  }

  /**
   * Activate admin
   */
  activateAdmin(adminId: number): Observable<{ message: string; adminId: number; active: boolean }> {
    return this.api.put<{ message: string; adminId: number; active: boolean }>(`super-admin/admins/${adminId}/activate`, {});
  }

  /**
   * Update admin department
   */
  updateAdminDepartment(adminId: number, departmentId: number | null): Observable<any> {
    return this.api.put<any>(`super-admin/admins/${adminId}/department`, { departmentId });
  }

  /**
   * Update admin details (name, email, password, department)
   */
  updateAdmin(adminId: number, updateData: any): Observable<any> {
    return this.api.put<any>(`super-admin/admins/${adminId}`, updateData);
  }

  /**
   * Delete admin
   */
  deleteAdmin(adminId: number): Observable<any> {
    return this.api.delete<any>(`super-admin/admins/${adminId}`);
  }
}

