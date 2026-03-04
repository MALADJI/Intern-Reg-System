import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export interface Location {
  id?: number;
  locationId?: number;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
  description?: string;
  active?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class LocationService {
  constructor(private api: ApiService) {}

  /**
   * Get all active locations
   */
  getAllLocations(): Observable<Location[]> {
    return this.api.get<Location[]>('locations');
  }

  /**
   * Get location by ID
   */
  getLocationById(id: number): Observable<Location> {
    return this.api.get<Location>(`locations/${id}`);
  }

  /**
   * Create a new location
   */
  createLocation(location: Omit<Location, 'id' | 'locationId'>): Observable<Location> {
    return this.api.post<Location>('locations', location);
  }

  /**
   * Update a location
   */
  updateLocation(id: number, location: Partial<Location>): Observable<Location> {
    return this.api.put<Location>(`locations/${id}`, location);
  }

  /**
   * Delete a location (soft delete)
   */
  deleteLocation(id: number): Observable<void> {
    return this.api.delete<void>(`locations/${id}`);
  }
}

