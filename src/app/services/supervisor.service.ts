import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { WebSocketService } from './websocket.service';

export interface Supervisor {
  id?: number;
  name: string;
  email: string;
  department: string;
  departmentId?: number;
  field: string;
  assignedInterns?: string[];
  status: 'Active' | 'On Leave' | 'Inactive';
  active?: boolean;
}

export interface SupervisorRequest {
  name: string;
  email: string;
  departmentId: number;
  field?: string;
}

@Injectable({
  providedIn: 'root'
})
export class SupervisorService {
  constructor(
    private api: ApiService,
    private webSocketService: WebSocketService
  ) { }

  /**
   * Observable for real-time supervisor updates
   */
  get supervisorUpdates$() {
    return this.webSocketService.supervisorUpdates$;
  }

  /**
   * Get all supervisors
   * @param departmentId Optional department ID to filter supervisors by department
   */
  getAllSupervisors(departmentId?: number): Observable<Supervisor[]> {
    const params = departmentId ? { departmentId } : {};
    return this.api.get<Supervisor[]>('supervisors', params);
  }

  /**
   * Get supervisor by ID
   */
  getSupervisorById(id: number): Observable<Supervisor> {
    return this.api.get<Supervisor>(`supervisors/${id}`);
  }

  /**
   * Create supervisor
   */
  createSupervisor(supervisor: SupervisorRequest): Observable<Supervisor> {
    return this.api.post<Supervisor>('supervisors', supervisor);
  }

  /**
   * Update supervisor
   */
  updateSupervisor(id: number, supervisor: Partial<SupervisorRequest>): Observable<Supervisor> {
    return this.api.put<Supervisor>(`supervisors/${id}`, supervisor);
  }

  /**
   * Delete supervisor
   */
  deleteSupervisor(id: number): Observable<void> {
    return this.api.delete<void>(`supervisors/${id}`);
  }

  /**
   * Activate supervisor
   */
  activateSupervisor(id: number): Observable<{ message: string }> {
    return this.api.put<{ message: string }>(`supervisors/${id}/activate`, {});
  }

  /**
   * Deactivate supervisor
   */
  deactivateSupervisor(id: number): Observable<{ message: string }> {
    return this.api.put<{ message: string }>(`supervisors/${id}/deactivate`, {});
  }

  /**
   * Send invite email to supervisor with login credentials
   */
  sendSupervisorInvite(data: {
    supervisorId?: number;
    email: string;
    name: string;
    password?: string;
    inviteLink: string;
    message: string;
  }): Observable<{ message: string; email: string }> {
    return this.api.post<{ message: string; email: string }>('supervisors/send-invite', data);
  }
}

