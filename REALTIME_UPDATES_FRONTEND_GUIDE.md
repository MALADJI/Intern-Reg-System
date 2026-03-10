# Real-Time Updates - Frontend Integration Guide

## ✅ What's Been Done

1. **WebSocket Service Created** ✅
   - `src/app/services/websocket.service.ts` - Connects to backend WebSocket
   - Uses `@stomp/stompjs` (already installed in your project)
   - Handles all real-time event types

2. **DataPreloadService Updated** ✅
   - Now listens to WebSocket events
   - Automatically updates cache when changes occur
   - Provides `getUpdateObservable()` for dashboard subscriptions

3. **AuthService Updated** ✅
   - Connects WebSocket on login
   - Disconnects WebSocket on logout

## 📋 How to Update Dashboard Components

### Example: Supervisor Dashboard

Update your `supervisor-dashboard.ts` to subscribe to real-time updates:

```typescript
import { Component, OnInit, OnDestroy } from '@angular/core';
import { DataPreloadService } from '../../services/data-preload.service';
import { Subscription } from 'rxjs';

export class SupervisorDashboardComponent implements OnInit, OnDestroy {
  leaveRequests: any[] = [];
  interns: any[] = [];
  private subscriptions = new Subscription();

  constructor(
    private dataPreloadService: DataPreloadService
    // ... other services
  ) {}

  ngOnInit(): void {
    // Load initial data from cache
    this.leaveRequests = this.dataPreloadService.getCachedData<any[]>('leaveRequests') || [];
    this.interns = this.dataPreloadService.getCachedData<any[]>('interns') || [];

    // Subscribe to real-time leave request updates
    this.subscriptions.add(
      this.dataPreloadService.getUpdateObservable('leaveRequests').subscribe(updatedRequests => {
        if (updatedRequests) {
          this.leaveRequests = updatedRequests;
          console.log('🔄 Leave requests updated in real-time');
        }
      })
    );

    // Subscribe to real-time intern updates
    this.subscriptions.add(
      this.dataPreloadService.getUpdateObservable('interns').subscribe(updatedInterns => {
        if (updatedInterns) {
          this.interns = updatedInterns;
          console.log('🔄 Interns updated in real-time');
        }
      })
    );
  }

  ngOnDestroy(): void {
    // Important: Unsubscribe to prevent memory leaks
    this.subscriptions.unsubscribe();
  }
}
```

### Example: Admin Dashboard

```typescript
import { Component, OnInit, OnDestroy } from '@angular/core';
import { DataPreloadService } from '../../services/data-preload.service';
import { Subscription } from 'rxjs';

export class AdminDashboardComponent implements OnInit, OnDestroy {
  users: any[] = [];
  leaveRequests: any[] = [];
  interns: any[] = [];
  supervisors: any[] = [];
  departments: any[] = [];
  private subscriptions = new Subscription();

  constructor(
    private dataPreloadService: DataPreloadService
    // ... other services
  ) {}

  ngOnInit(): void {
    // Load initial data
    this.users = this.dataPreloadService.getCachedData<any[]>('users') || [];
    this.leaveRequests = this.dataPreloadService.getCachedData<any[]>('leaveRequests') || [];
    this.interns = this.dataPreloadService.getCachedData<any[]>('interns') || [];
    this.supervisors = this.dataPreloadService.getCachedData<any[]>('supervisors') || [];
    this.departments = this.dataPreloadService.getCachedData<any[]>('departments') || [];

    // Subscribe to all real-time updates
    this.subscribeToUpdates();
  }

  private subscribeToUpdates(): void {
    // Users
    this.subscriptions.add(
      this.dataPreloadService.getUpdateObservable('users').subscribe(updated => {
        if (updated) this.users = updated;
      })
    );

    // Leave Requests
    this.subscriptions.add(
      this.dataPreloadService.getUpdateObservable('leaveRequests').subscribe(updated => {
        if (updated) this.leaveRequests = updated;
      })
    );

    // Interns
    this.subscriptions.add(
      this.dataPreloadService.getUpdateObservable('interns').subscribe(updated => {
        if (updated) this.interns = updated;
      })
    );

    // Supervisors
    this.subscriptions.add(
      this.dataPreloadService.getUpdateObservable('supervisors').subscribe(updated => {
        if (updated) this.supervisors = updated;
      })
    );

    // Departments
    this.subscriptions.add(
      this.dataPreloadService.getUpdateObservable('departments').subscribe(updated => {
        if (updated) this.departments = updated;
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
}
```

### Example: Intern Dashboard

```typescript
import { Component, OnInit, OnDestroy } from '@angular/core';
import { DataPreloadService } from '../../services/data-preload.service';
import { WebSocketService } from '../../services/websocket.service';
import { Subscription } from 'rxjs';

export class InternDashboardComponent implements OnInit, OnDestroy {
  leaveRequests: any[] = [];
  attendance: any[] = [];
  private subscriptions = new Subscription();

  constructor(
    private dataPreloadService: DataPreloadService,
    private webSocketService: WebSocketService
    // ... other services
  ) {}

  ngOnInit(): void {
    // Load initial data
    this.leaveRequests = this.dataPreloadService.getCachedData<any[]>('leaveRequests') || [];
    this.attendance = this.dataPreloadService.getCachedData<any[]>('attendance') || [];

    // Subscribe to real-time updates
    this.subscriptions.add(
      this.dataPreloadService.getUpdateObservable('leaveRequests').subscribe(updated => {
        if (updated) {
          this.leaveRequests = updated;
          console.log('🔄 Leave requests updated');
        }
      })
    );

    this.subscriptions.add(
      this.dataPreloadService.getUpdateObservable('attendance').subscribe(updated => {
        if (updated) {
          this.attendance = updated;
          console.log('🔄 Attendance updated');
        }
      })
    );

    // Subscribe to leave request status changes for notifications
    this.subscriptions.add(
      this.webSocketService.leaveRequestUpdates$.subscribe(message => {
        if (message.type.includes('APPROVED') || message.type.includes('REJECTED')) {
          const status = message.type.includes('APPROVED') ? 'approved' : 'rejected';
          // Show notification to user
          alert(`Your leave request has been ${status}!`);
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
}
```

## 🔄 Real-Time Events Supported

- ✅ **Leave Requests**: Created, Approved, Rejected
- ✅ **Attendance**: Sign-In, Sign-Out
- ✅ **Admins**: Created, Updated, Deleted
- ✅ **Interns**: Created, Updated, Deleted
- ✅ **Supervisors**: Created, Updated
- ✅ **Users**: Created, Updated
- ✅ **Departments**: Created, Updated

## 🧪 Testing

1. **Start Backend**: Make sure backend is running on port 8082
2. **Start Frontend**: `ng serve`
3. **Open Multiple Browsers**:
   - Browser 1: Login as Admin
   - Browser 2: Login as Supervisor
   - Make a change in Browser 1 (e.g., approve leave request)
   - Verify Browser 2 updates automatically

## 📝 Key Points

1. **Always unsubscribe** in `ngOnDestroy()` to prevent memory leaks
2. **Initial data** is loaded from cache (fast)
3. **Real-time updates** happen automatically via WebSocket
4. **No manual refresh needed** - changes appear instantly

## 🐛 Troubleshooting

### WebSocket Not Connecting
- Check browser console for errors
- Verify backend is running on port 8082
- Check network tab for WebSocket connection

### Updates Not Showing
- Verify component is subscribing to updates
- Check browser console for WebSocket messages
- Ensure `ngOnDestroy()` is implemented

### Performance Issues
- Make sure to unsubscribe in `ngOnDestroy()`
- Check for multiple subscriptions (memory leaks)

## ✅ Next Steps

1. Update each dashboard component following the examples above
2. Test with multiple users simultaneously
3. Add user notifications for important events (optional)


