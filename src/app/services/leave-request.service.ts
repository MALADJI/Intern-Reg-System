import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { WebSocketService } from './websocket.service';

export interface LeaveRequest {
  id?: number;
  name: string;
  email: string;
  internId?: number;
  department: string;
  field?: string;
  startDate: string;
  endDate: string;
  reason: string; // Intern's reason when submitted, admin/supervisor's decline message when rejected
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  leaveType?: 'ANNUAL' | 'SICK' | 'PERSONAL' | 'EMERGENCY';
  document?: string;
}

export interface LeaveRequestCreate {
  internId: number;
  fromDate: string;
  toDate: string;
  reason: string;
  leaveType: 'ANNUAL' | 'SICK' | 'PERSONAL' | 'EMERGENCY';
}

@Injectable({
  providedIn: 'root'
})
export class LeaveRequestService {
  constructor(
    private api: ApiService,
    private webSocketService: WebSocketService
  ) { }

  /**
   * Observable for real-time leave request updates
   */
  get leaveRequestUpdates$() {
    return this.webSocketService.leaveRequestUpdates$;
  }

  /**
   * Get all leave requests
   * @param status Optional status filter
   * @param departmentId Optional department ID to filter by department
   */
  getAllLeaveRequests(status?: string, departmentId?: number): Observable<LeaveRequest[]> {
    const params: any = {};
    if (status) params.status = status;
    if (departmentId) params.departmentId = departmentId;
    return this.api.get<LeaveRequest[]>('leave', params);
  }

  /**
   * Get leave requests by intern
   */
  getLeaveRequestsByIntern(internId: number): Observable<LeaveRequest[]> {
    return this.api.get<LeaveRequest[]>(`leave/intern/${internId}`);
  }

  /**
   * Get current user's leave requests
   * Uses the authenticated user's ID from the backend
   */
  getMyLeaveRequests(): Observable<LeaveRequest[]> {
    return this.api.get<LeaveRequest[]>('leave/my-leave');
  }

  /**
   * Search leave requests
   */
  searchLeaveRequests(params: {
    status?: string;
    internId?: number;
    page?: number;
    size?: number;
  }): Observable<any> {
    return this.api.get<any>('leave/search', params);
  }

  /**
   * Submit leave request
   */
  submitLeaveRequest(request: LeaveRequestCreate): Observable<LeaveRequest> {
    return this.api.post<LeaveRequest>('leave', request);
  }

  /**
   * Update leave request
   */
  updateLeaveRequest(id: number, request: Partial<LeaveRequestCreate>): Observable<LeaveRequest> {
    return this.api.put<LeaveRequest>(`leave/${id}`, request);
  }

  /**
   * Upload leave attachment
   */
  uploadAttachment(leaveId: number, file: File): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    return this.api.postFile<any>(`leave/${leaveId}/attachment`, formData);
  }

  /**
   * Approve leave request
   */
  approveLeaveRequest(id: number): Observable<LeaveRequest> {
    return this.api.put<LeaveRequest>(`leave/approve/${id}`, {});
  }

  /**
   * Reject leave request
   */
  rejectLeaveRequest(id: number, reason?: string): Observable<LeaveRequest> {
    return this.api.put<LeaveRequest>(`leave/reject/${id}`, { reason });
  }

  /**
   * Get leave request by ID
   */
  getLeaveRequestById(id: number): Observable<LeaveRequest> {
    return this.api.get<LeaveRequest>(`leave/${id}`);
  }

  /**
   * Download leave request attachment
   */
  downloadAttachment(filename: string): Observable<Blob> {
    return this.api.downloadFile(`leave/attachment/${filename}`);
  }
}

