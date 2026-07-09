import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export interface SignatureResponse {
  hasSignature: boolean;
  signature: string;
}

@Injectable({
  providedIn: 'root'
})
export class UserService {
  constructor(private api: ApiService) { }

  /**
   * Get current user's signature
   */
  getMySignature(): Observable<SignatureResponse> {
    return this.api.get<SignatureResponse>('users/me/signature');
  }

  /**
   * Update current user's signature
   */
  updateMySignature(signature: string): Observable<{ message: string; hasSignature: boolean }> {
    return this.api.put<{ message: string; hasSignature: boolean }>('users/me/signature', { signature });
  }

  /**
   * Get list of currently online users
   */
  getOnlineUsers(): Observable<string[]> {
    return this.api.get<string[]>('presence/online');
  }
}

