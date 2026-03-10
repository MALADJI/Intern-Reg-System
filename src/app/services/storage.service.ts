import { Injectable } from '@angular/core';

/**
 * Service for managing localStorage operations with error handling
 */
@Injectable({
  providedIn: 'root'
})
export class StorageService {

  /**
   * Set an item in localStorage
   * @param key - Storage key
   * @param value - Value to store (will be JSON stringified)
   * @returns true if successful, false otherwise
   */
  setItem<T>(key: string, value: T): boolean {
    try {
      const serialized = JSON.stringify(value);
      localStorage.setItem(key, serialized);
      return true;
    } catch (error) {
      console.error(`Error saving to localStorage key "${key}":`, error);
      return false;
    }
  }

  /**
   * Get an item from localStorage
   * @param key - Storage key
   * @returns Parsed value or null if not found or error
   */
  getItem<T>(key: string): T | null {
    try {
      const item = localStorage.getItem(key);
      if (item === null) {
        return null;
      }
      return JSON.parse(item) as T;
    } catch (error) {
      console.error(`Error reading from localStorage key "${key}":`, error);
      return null;
    }
  }

  /**
   * Remove an item from localStorage
   * @param key - Storage key
   */
  removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error(`Error removing localStorage key "${key}":`, error);
    }
  }

  /**
   * Clear all items from localStorage
   */
  clear(): void {
    try {
      localStorage.clear();
    } catch (error) {
      console.error('Error clearing localStorage:', error);
    }
  }

  /**
   * Check if a key exists in localStorage
   * @param key - Storage key
   * @returns true if key exists
   */
  hasItem(key: string): boolean {
    return localStorage.getItem(key) !== null;
  }

  /**
   * Store a string value directly (without JSON.stringify)
   * Useful for tokens that should be stored as plain strings
   * @param key - Storage key
   * @param value - String value to store
   * @returns true if successful, false otherwise
   */
  setItemString(key: string, value: string): boolean {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      console.error(`Error saving string to localStorage key "${key}":`, error);
      return false;
    }
  }

  /**
   * Get a string value directly (without JSON.parse)
   * Useful for tokens that are stored as plain strings
   * Handles both plain string storage and JSON-stringified storage for backward compatibility
   * @param key - Storage key
   * @returns String value or null if not found or error
   */
  getItemString(key: string): string | null {
    try {
      const rawValue = localStorage.getItem(key);
      if (rawValue === null) {
        return null;
      }
      
      // Check if it's JSON-stringified (starts with quote)
      if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
        // It's JSON-stringified, parse it
        try {
          const parsed = JSON.parse(rawValue);
          if (typeof parsed === 'string') {
            console.log(`StorageService - Found JSON-stringified value for "${key}", parsed it`);
            return parsed;
          }
        } catch (e) {
          // Not valid JSON, return as-is
        }
      }
      
      // Return as plain string
      return rawValue;
    } catch (error) {
      console.error(`Error reading string from localStorage key "${key}":`, error);
      return null;
    }
  }
}

