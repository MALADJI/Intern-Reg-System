import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ApiService } from './api.service';
import { StorageService } from './storage.service';
import { WebSocketService } from './websocket.service';

export interface Notification {
    id: string;
    type: 'info' | 'success' | 'warning' | 'error';
    title: string;
    message: string;
    timestamp: Date;
    read: boolean;
    link?: string;
}

@Injectable({
    providedIn: 'root'
})
export class NotificationService {
    private notificationsSubject = new BehaviorSubject<Notification[]>([]);
    public notifications$ = this.notificationsSubject.asObservable();

    private unreadCountSubject = new BehaviorSubject<number>(0);
    public unreadCount$ = this.unreadCountSubject.asObservable();

    constructor(
        private api: ApiService,
        private storage: StorageService,
        private webSocketService: WebSocketService
    ) {
        this.loadNotifications();

        // Subscribe to real-time notification updates via WebSocket
        this.webSocketService.notificationUpdates$.subscribe(wsMessage => {
            this.handleRealTimeNotification(wsMessage);
        });
    }

    public loadNotifications(): void {
        // Use ApiService so the Authorization header is automatically included
        this.api.get<any[]>('notifications').subscribe({
            next: (data) => {
                const notifications: Notification[] = data.map(n => ({
                    id: String(n.id),
                    type: this.mapType(n.type),
                    title: this.getTitleFromType(n.type),
                    message: n.message,
                    timestamp: new Date(n.timestamp),
                    read: n.read,
                    link: n.link
                }));
                this.notificationsSubject.next(notifications);
                this.updateUnreadCount(notifications);
            },
            error: (error) => console.error('Error loading notifications', error)
        });
    }

    private handleRealTimeNotification(wsMessage: any): void {
        // The WebSocket message has { type, data, timestamp }
        // The actual notification data is in wsMessage.data
        const rawNotification = wsMessage.data || wsMessage;

        const newNotification: Notification = {
            id: String(rawNotification.id),
            type: this.mapType(rawNotification.type),
            title: this.getTitleFromType(rawNotification.type),
            message: rawNotification.message,
            timestamp: new Date(rawNotification.timestamp || Date.now()),
            read: rawNotification.read || false,
            link: rawNotification.link
        };

        const currentNotifications = this.notificationsSubject.value;
        // Avoid duplicates
        const exists = currentNotifications.some(n => n.id === newNotification.id);
        if (!exists) {
            const updatedNotifications = [newNotification, ...currentNotifications];
            this.notificationsSubject.next(updatedNotifications);
            this.updateUnreadCount(updatedNotifications);
        }
    }

    markAsRead(id: string): void {
        // Optimistic update
        const currentNotifications = this.notificationsSubject.value.map(n => {
            if (n.id === id) return { ...n, read: true };
            return n;
        });
        this.notificationsSubject.next(currentNotifications);
        this.updateUnreadCount(currentNotifications);

        this.api.put(`notifications/${id}/read`, {}).subscribe({
            error: () => console.error('Error marking notification as read')
        });
    }

    markAllAsRead(): void {
        const currentNotifications = this.notificationsSubject.value.map(n => ({ ...n, read: true }));
        this.notificationsSubject.next(currentNotifications);
        this.updateUnreadCount(currentNotifications);

        this.api.put('notifications/read-all', {}).subscribe({
            error: () => console.error('Error marking all as read')
        });
    }

    clearAll(): void {
        this.notificationsSubject.next([]);
        this.updateUnreadCount([]);
    }

    /**
     * Clears all in-memory notification state without touching the backend.
     * Call this on logout so a new user logging in starts with a clean slate.
     */
    clearNotificationsState(): void {
        this.notificationsSubject.next([]);
        this.updateUnreadCount([]);
    }

    private updateUnreadCount(notifications: Notification[]): void {
        const count = notifications.filter(n => !n.read).length;
        this.unreadCountSubject.next(count);
    }

    private mapType(type: string): 'info' | 'success' | 'warning' | 'error' {
        if (!type) return 'info';
        const lower = type.toLowerCase();
        if (lower === 'info' || lower === 'success' || lower === 'warning' || lower === 'error') {
            return lower;
        }
        // Map backend types
        if (lower === 'notification') return 'info';
        return 'info';
    }

    private getTitleFromType(type: string): string {
        if (!type) return 'Notification';
        const lower = type.toLowerCase();
        if (lower === 'warning') return 'Alert';
        if (lower === 'success') return 'Success';
        if (lower === 'error') return 'Error';
        return 'Notification';
    }
}
