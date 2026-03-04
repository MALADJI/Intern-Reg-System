import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export interface Profile {
  id: number;
  username: string;
  email: string;
  role: string;
  name?: string;
  surname?: string;
  department?: string;
  field?: string;
  supervisor?: string;
  supervisorEmail?: string;
}

export interface ProfileUpdate {
  name?: string;
  surname?: string;
}

export interface PasswordChange {
  currentPassword: string;
  newPassword: string;
}

export interface NotificationPreferences {
  emailLeaveUpdates: boolean;
  emailAttendanceAlerts: boolean;
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
}

export interface TermsStatus {
  accepted: boolean;
  acceptedAt?: string;
  version: string;
}

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  constructor(private api: ApiService) {}

  /**
   * Get current user profile
   */
  getProfile(): Observable<Profile> {
    return this.api.get<Profile>('settings/profile');
  }

  /**
   * Update profile
   */
  updateProfile(profile: ProfileUpdate): Observable<{ message: string }> {
    return this.api.put<{ message: string }>('settings/profile', profile);
  }

  /**
   * Change password
   */
  changePassword(passwordData: PasswordChange): Observable<{ message: string }> {
    return this.api.put<{ message: string }>('settings/password', passwordData);
  }

  /**
   * Get notification preferences
   */
  getNotificationPreferences(): Observable<NotificationPreferences> {
    return this.api.get<NotificationPreferences>('settings/notifications');
  }

  /**
   * Update notification preferences
   */
  updateNotificationPreferences(preferences: Partial<NotificationPreferences>): Observable<NotificationPreferences> {
    return this.api.put<NotificationPreferences>('settings/notifications', preferences);
  }

  /**
   * Get terms acceptance status
   */
  getTermsStatus(): Observable<TermsStatus> {
    return this.api.get<TermsStatus>('settings/terms');
  }

  /**
   * Accept terms
   */
  acceptTerms(version?: string): Observable<TermsStatus> {
    return this.api.put<TermsStatus>('settings/terms', { version: version || 'v1' });
  }
}

