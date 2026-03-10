import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { WebSocketService } from './websocket.service';

export interface Intern {
  id?: number;
  name: string;
  email: string;
  idNumber?: string; // ID Number from sign-up
  startDate?: string; // Internship start date
  endDate?: string; // Internship end date
  supervisor?: string;
  supervisorId?: number;
  employer?: string;
  department: string;
  departmentId?: number;
  field?: string;
  status?: 'Present' | 'Absent' | 'On Leave';
  active?: boolean;
  recordsByDay?: {
    [day: string]: {
      action: 'Signed In' | 'Signed Out' | 'On Leave' | 'Absent';
      timeIn?: Date;
      timeOut?: Date;
    };
  };
}

export interface InternRequest {
  name: string;
  email: string;
  departmentId: number;
  supervisorId?: number;
  employer?: string;
}

export interface InternResponse {
  id: number;
  name: string;
  email: string;
  idNumber?: string; // ID Number from sign-up
  startDate?: string; // Internship start date
  endDate?: string; // Internship end date
  departmentName: string;
  departmentId: number;
  supervisorName?: string;
  supervisorId?: number;
  employer?: string;
  field?: string;
  status?: string;
  active?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class InternService {
  constructor(
    private api: ApiService,
    private webSocketService: WebSocketService
  ) { }

  /**
   * Observable for real-time intern updates
   */
  get internUpdates$() {
    return this.webSocketService.internUpdates$;
  }

  /**
   * Get all interns
   * @param departmentId Optional department ID to filter interns by department
   */
  getAllInterns(departmentId?: number): Observable<InternResponse[]> {
    const params = departmentId ? { departmentId } : {};
    return this.api.get<InternResponse[]>('interns', params);
  }

  /**
   * Get intern by ID
   */
  getInternById(id: number): Observable<Intern> {
    return this.api.get<Intern>(`interns/${id}`);
  }

  /**
   * Search interns
   */
  searchInterns(name?: string, page: number = 0, size: number = 10): Observable<any> {
    const params: any = { page, size };
    if (name) {
      params.name = name;
    }
    return this.api.get<any>('interns/search', params);
  }

  /**
   * Create intern
   */
  createIntern(intern: InternRequest): Observable<InternResponse> {
    return this.api.post<InternResponse>('interns', intern);
  }

  /**
   * Update intern
   */
  updateIntern(id: number, intern: Partial<InternRequest>): Observable<InternResponse> {
    return this.api.put<InternResponse>(`interns/${id}`, intern);
  }

  /**
   * Delete intern
   */
  deleteIntern(id: number): Observable<void> {
    return this.api.delete<void>(`interns/${id}`);
  }

  /**
   * Deactivate intern
   */
  deactivateIntern(id: number): Observable<InternResponse> {
    return this.api.put<InternResponse>(`interns/${id}/deactivate`, {});
  }

  /**
   * Activate intern
   */
  activateIntern(id: number): Observable<InternResponse> {
    return this.api.put<InternResponse>(`interns/${id}/activate`, {});
  }

  /**
   * Assign location to intern
   */
  assignLocationToIntern(internId: number, locationId: number | null): Observable<any> {
    return this.api.put<any>(`interns/${internId}/location`, { locationId });
  }
}

