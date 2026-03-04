import { Injectable, Injector } from '@angular/core';
import { Observable, Subject, BehaviorSubject } from 'rxjs';
import { Client, IMessage } from '@stomp/stompjs';
import { AuthService } from './auth.service';

import SockJS from 'sockjs-client';

// SockJS will be loaded dynamically when WebSocket connection is needed
// This avoids module loading issues that could prevent the app from starting

/**
 * Get WebSocket URL dynamically based on current hostname
 * Matches the logic used in api.service.ts
 */
function getWebSocketUrl(): string {
  const hostname = window.location.hostname;
  const backendHost = hostname === 'localhost' || hostname === '127.0.0.1'
    ? 'localhost'
    : hostname;
  return `http://${backendHost}:8082/ws`;
}

export interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: number;
}

/**
 * WebSocket service for real-time updates
 * Connects to Spring Boot WebSocket endpoint and broadcasts updates
 */
@Injectable({
  providedIn: 'root'
})
export class WebSocketService {
  private stompClient: Client | null = null;
  private connected: boolean = false;
  private connectionSubject = new BehaviorSubject<boolean>(false);
  private messageSubject = new Subject<WebSocketMessage>();
  private authService: AuthService | null = null;
  private injector: Injector;

  // Observable streams for different event types
  public leaveRequestUpdates$ = new Subject<WebSocketMessage>();
  public adminUpdates$ = new Subject<WebSocketMessage>();
  public internUpdates$ = new Subject<WebSocketMessage>();
  public supervisorUpdates$ = new Subject<WebSocketMessage>();
  public attendanceUpdates$ = new Subject<WebSocketMessage>();
  public userUpdates$ = new Subject<WebSocketMessage>();
  public departmentUpdates$ = new Subject<WebSocketMessage>();
  public locationUpdates$ = new Subject<WebSocketMessage>();
  public notificationUpdates$ = new Subject<WebSocketMessage>();

  constructor(injector: Injector) {
    this.injector = injector;
  }

  /**
   * Get AuthService lazily to avoid circular dependency
   */
  private getAuthService(): AuthService {
    if (!this.authService) {
      this.authService = this.injector.get(AuthService);
    }
    return this.authService;
  }

  /**
   * Connect to WebSocket server
   */
  connect(): void {
    if (this.connected || this.stompClient) {
      console.log('WebSocket already connected or connecting...');
      return;
    }

    try {
      // Get WebSocket URL dynamically
      const wsUrl = getWebSocketUrl();
      console.log('🔌 Connecting to WebSocket at:', wsUrl);

      // Get JWT token for authentication
      const authService = this.getAuthService();
      const token = authService.getToken ? authService.getToken() : null;
      const connectHeaders: { [key: string]: string } = {};
      if (token) {
        connectHeaders['Authorization'] = `Bearer ${token}`;
        console.log('🔑 WebSocket connecting with JWT token');
      } else {
        console.warn('⚠️ WebSocket connecting without JWT token - user-specific notifications may not work');
      }

      // Create STOMP client
      this.stompClient = new Client({
        webSocketFactory: () => {
          return new SockJS(wsUrl);
        },
        connectHeaders,
        reconnectDelay: 5000,
        heartbeatIncoming: 4000,
        heartbeatOutgoing: 4000,
        debug: (str: string) => {
          // Disable debug logging
        },
        onConnect: (frame) => {
          console.log('✅ WebSocket connected:', frame);
          this.connected = true;
          this.connectionSubject.next(true);
          this.subscribeToChannels();
        },
        onStompError: (frame) => {
          console.error('❌ WebSocket STOMP error:', frame);
          console.error('Error details:', frame.headers);
          console.error('Error message:', frame.body);
          this.connected = false;
          this.connectionSubject.next(false);
          // Attempt to reconnect after delay
          setTimeout(() => {
            if (!this.connected) {
              console.log('🔄 Attempting to reconnect WebSocket...');
              this.disconnect();
              setTimeout(() => this.connect(), 5000);
            }
          }, 5000);
        },
        onWebSocketClose: () => {
          console.log('🔌 WebSocket closed');
          this.connected = false;
          this.connectionSubject.next(false);
        },
        onDisconnect: () => {
          console.log('🔌 WebSocket disconnected');
          this.connected = false;
          this.connectionSubject.next(false);
        },
        onWebSocketError: (event) => {
          console.error('❌ WebSocket connection error:', event);
          this.connected = false;
          this.connectionSubject.next(false);
        }
      });

      // Activate the client
      this.stompClient.activate();
    } catch (error) {
      console.error('❌ Error creating WebSocket connection:', error);
      this.connected = false;
      this.connectionSubject.next(false);
    }
  }

  /**
   * Subscribe to all update channels
   */
  private subscribeToChannels(): void {
    if (!this.stompClient || !this.connected) {
      console.warn('Cannot subscribe: WebSocket not connected');
      return;
    }

    // Leave Requests
    this.stompClient.subscribe('/topic/leave-requests', (message: IMessage) => {
      try {
        const data: WebSocketMessage = JSON.parse(message.body);
        console.log('📨 Received leave request update:', data);
        this.leaveRequestUpdates$.next(data);
        this.messageSubject.next(data);
      } catch (error) {
        console.error('Error parsing leave request message:', error);
      }
    });

    // Admins
    this.stompClient.subscribe('/topic/admins', (message: IMessage) => {
      try {
        const data: WebSocketMessage = JSON.parse(message.body);
        console.log('📨 Received admin update:', data);
        this.adminUpdates$.next(data);
        this.messageSubject.next(data);
      } catch (error) {
        console.error('Error parsing admin message:', error);
      }
    });

    // Interns
    this.stompClient.subscribe('/topic/interns', (message: IMessage) => {
      try {
        const data: WebSocketMessage = JSON.parse(message.body);
        console.log('📨 Received intern update:', data);
        this.internUpdates$.next(data);
        this.messageSubject.next(data);
      } catch (error) {
        console.error('Error parsing intern message:', error);
      }
    });

    // Supervisors
    this.stompClient.subscribe('/topic/supervisors', (message: IMessage) => {
      try {
        const data: WebSocketMessage = JSON.parse(message.body);
        console.log('📨 Received supervisor update:', data);
        this.supervisorUpdates$.next(data);
        this.messageSubject.next(data);
      } catch (error) {
        console.error('Error parsing supervisor message:', error);
      }
    });

    // Attendance
    this.stompClient.subscribe('/topic/attendance', (message: IMessage) => {
      try {
        const data: WebSocketMessage = JSON.parse(message.body);
        console.log('📨 Received attendance update:', data);
        this.attendanceUpdates$.next(data);
        this.messageSubject.next(data);
      } catch (error) {
        console.error('Error parsing attendance message:', error);
      }
    });

    // Users
    this.stompClient.subscribe('/topic/users', (message: IMessage) => {
      try {
        const data: WebSocketMessage = JSON.parse(message.body);
        console.log('📨 Received user update:', data);
        this.userUpdates$.next(data);
        this.messageSubject.next(data);
      } catch (error) {
        console.error('Error parsing user message:', error);
      }
    });

    // Departments
    this.stompClient.subscribe('/topic/departments', (message: IMessage) => {
      try {
        const data: WebSocketMessage = JSON.parse(message.body);
        console.log('📨 Received department update:', data);
        this.departmentUpdates$.next(data);
        this.messageSubject.next(data);
      } catch (error) {
        console.error('Error parsing department message:', error);
      }
    });

    // Locations
    this.stompClient.subscribe('/topic/locations', (message: IMessage) => {
      try {
        const data: WebSocketMessage = JSON.parse(message.body);
        console.log('📨 Received location update:', data);
        this.locationUpdates$.next(data);
        this.messageSubject.next(data);
      } catch (error) {
        console.error('Error parsing location message:', error);
      }
    });

    // Personal Notifications
    this.stompClient.subscribe('/user/queue/notifications', (message: IMessage) => {
      try {
        const data: WebSocketMessage = JSON.parse(message.body);
        console.log('📨 Received personal notification:', data);
        this.notificationUpdates$.next(data);
        this.messageSubject.next(data);
      } catch (error) {
        console.error('Error parsing notification message:', error);
      }
    });

    console.log('✅ Subscribed to all WebSocket channels');
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    if (this.stompClient) {
      this.stompClient.deactivate();
      this.stompClient = null;
      this.connected = false;
      this.connectionSubject.next(false);
      console.log('🔌 WebSocket disconnected');
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get connection status observable
   */
  getConnectionStatus$(): Observable<boolean> {
    return this.connectionSubject.asObservable();
  }

  /**
   * Get all messages observable
   */
  getMessages$(): Observable<WebSocketMessage> {
    return this.messageSubject.asObservable();
  }
}

