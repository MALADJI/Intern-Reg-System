import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export interface ActivityLog {
  id: number;
  timestamp: string;
  username: string;
  userId: number;
  userRole: string;
  action: string;
  details: string;
  ipAddress: string;
}

export interface PaginatedLogs {
  content: ActivityLog[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
  first: boolean;
  last: boolean;
  empty: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ActivityLogService {
  constructor(private api: ApiService) {}

  getLogs(page: number = 0, size: number = 20, filters: any = {}): Observable<PaginatedLogs> {
    let params = `page=${page}&size=${size}`;
    if (filters.username) params += `&username=${filters.username}`;
    if (filters.action) params += `&action=${filters.action}`;
    if (filters.role) params += `&role=${filters.role}`;
    
    return this.api.get<PaginatedLogs>(`logs?${params}`);
  }
}
