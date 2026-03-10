import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from './api.service';

export interface Attendance {
  id?: number; // Frontend uses 'id'
  attendanceId?: number; // Backend uses 'attendanceId' - map this to 'id'
  internId: number;
  internName?: string;
  date: string;
  timeIn?: string;
  timeOut?: string;
  location?: string;
  status: 'PRESENT' | 'ABSENT' | 'ON_LEAVE' | 'SIGNED_IN' | 'SIGNED_OUT' | 'LATE' | 'REMOTE' | 'NOT_SIGNED_OUT';
  signature?: string;
  latitude?: number;
  longitude?: number;
}

export interface SignInRequest {
  internId: number;
  location: string;
  latitude?: number;
  longitude?: number;
}

export interface AttendanceCreate {
  internId: number;
  date: string;
  timeIn?: string;
  timeOut?: string;
  status: 'PRESENT' | 'ABSENT' | 'ON_LEAVE';
  signature?: string;
  location?: string;
  latitude?: number;
  longitude?: number;
}

export interface AttendanceUpdate {
  timeOut?: string;
  status?: 'PRESENT' | 'ABSENT' | 'ON_LEAVE';
}

@Injectable({
  providedIn: 'root'
})
export class AttendanceService {
  constructor(private api: ApiService) { }

  /**
   * Get all attendance records
   */
  getAllAttendance(page: number = 0, size: number = 1000): Observable<Attendance[]> {
    return this.api.get<any>(`attendance?page=${page}&size=${size}`).pipe(
      map(response => {
        if (response && response.content) {
          return response.content.map((r: any) => this.mapAttendance(r));
        }
        return [];
      })
    );
  }

  /**
   * Get attendance by intern ID
   */
  getAttendanceByIntern(internId: number): Observable<Attendance[]> {
    return this.api.get<any[]>(`attendance/intern/${internId}`).pipe(
      map(records => records.map(record => this.mapAttendance(record)))
    );
  }

  /**
   * Sign in
   */
  signIn(request: SignInRequest): Observable<Attendance> {
    return this.api.post<any>('attendance/signin', request).pipe(
      map(record => this.mapAttendance(record))
    );
  }

  /**
   * Sign out
   * @param attendanceId - The attendance record ID to sign out from
   * @param location - Optional location for sign out
   * @param latitude - Optional latitude for geolocation
   * @param longitude - Optional longitude for geolocation
   */
  signOut(attendanceId: number, location?: string, latitude?: number, longitude?: number): Observable<Attendance> {
    const body: any = {};
    if (location) body.location = location;
    if (latitude !== undefined) body.latitude = latitude;
    if (longitude !== undefined) body.longitude = longitude;
    return this.api.put<any>(`attendance/signout/${attendanceId}`, body).pipe(
      map(record => this.mapAttendance(record))
    );
  }

  /**
   * Sign in with geolocation support
   * Enhanced version that supports latitude/longitude
   * @param internId - The intern ID
   * @param location - Location string
   * @param latitude - Optional latitude for geolocation
   * @param longitude - Optional longitude for geolocation
   */
  signInWithLocation(internId: number, location: string, latitude?: number, longitude?: number): Observable<Attendance> {
    const request: any = {
      internId,
      location
    };
    if (latitude !== undefined) request.latitude = latitude;
    if (longitude !== undefined) request.longitude = longitude;
    return this.api.post<any>('attendance/signin', request).pipe(
      map(record => this.mapAttendance(record))
    );
  }

  /**
   * @deprecated Use signIn() or signInWithLocation() instead
   * This method calls a non-existent backend endpoint
   */
  createAttendance(attendance: AttendanceCreate): Observable<Attendance> {
    console.warn('createAttendance() is deprecated. Use signIn() or signInWithLocation() instead.');
    // Redirect to signIn for backward compatibility
    return this.signInWithLocation(
      attendance.internId,
      attendance.location || '',
      attendance.latitude,
      attendance.longitude
    );
  }

  /**
   * @deprecated Use signOut() instead
   * This method calls a non-existent backend endpoint
   */
  updateAttendance(attendanceId: number, update: AttendanceUpdate): Observable<Attendance> {
    console.warn('updateAttendance() is deprecated. Use signOut() instead.');
    // Redirect to signOut for backward compatibility
    return this.signOut(attendanceId);
  }

  /**
   * Map backend attendance format to frontend format
   * Backend uses 'attendanceId', frontend uses 'id'
   */
  private mapAttendance(record: any): Attendance {
    return {
      id: record.attendanceId || record.id,
      attendanceId: record.attendanceId || record.id,
      internId: record.intern?.internId || record.internId,
      internName: record.intern?.name || record.internName,
      date: record.date,
      timeIn: record.timeIn,
      timeOut: record.timeOut,
      location: record.location,
      status: record.status || 'PRESENT',
      signature: record.signature,
      latitude: record.latitude,
      longitude: record.longitude
    };
  }
}

