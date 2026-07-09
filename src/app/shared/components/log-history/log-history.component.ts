import { Component, OnInit, OnDestroy, Input } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivityLogService, ActivityLog, PaginatedLogs } from '../../../services/activity-log.service';
import { LoadingComponent } from '../loading/loading.component';
import { WebSocketService, WebSocketMessage } from '../../../services/websocket.service';
import { AuthService } from '../../../services/auth.service';
import { UserService } from '../../../services/user.service';
import { Subscription } from 'rxjs';

@Component({
    selector: 'app-log-history',
    standalone: true,
    imports: [CommonModule, FormsModule, LoadingComponent],
    providers: [DatePipe],
    templateUrl: './log-history.component.html',
    styleUrl: './log-history.component.css'
})
export class LogHistoryComponent implements OnInit, OnDestroy {
    @Input() userRole: string = '';

    logs: ActivityLog[] = [];
    loading: boolean = true;
    currentPage: number = 0;
    pageSize: number = 20;
    totalElements: number = 0;
    totalPages: number = 0;

    filters = {
        username: '',
        action: '',
        role: ''
    };

    onlineUsers: string[] = [];

    private subscriptions = new Subscription();
    private currentUser: any = null;

    constructor(
        private logService: ActivityLogService,
        private webSocketService: WebSocketService,
        private authService: AuthService,
        private userService: UserService
    ) { }

    ngOnInit(): void {
        this.currentUser = this.authService.getCurrentUserSync();
        this.loadLogs();
        this.loadOnlineUsers();
        this.setupWebSocketSubscription();
    }

    ngOnDestroy(): void {
        this.subscriptions.unsubscribe();
    }

    setupWebSocketSubscription(): void {
        this.subscriptions.add(
            this.webSocketService.logUpdates$.subscribe((message: WebSocketMessage) => {
                if (message.type === 'ACTIVITY_LOG_CREATED') {
                    this.handleNewLog(message);
                }
            })
        );

        // Listen for real-time user presence updates
        this.subscriptions.add(
            this.webSocketService.userUpdates$.subscribe((message: WebSocketMessage) => {
                const username = message.data;
                if (message.type === 'ONLINE') {
                    if (!this.onlineUsers.includes(username)) {
                        this.onlineUsers.push(username);
                    }
                } else if (message.type === 'OFFLINE') {
                    this.onlineUsers = this.onlineUsers.filter(u => u !== username);
                }
            })
        );
    }

    handleNewLog(message: WebSocketMessage): void {
        const newLog: ActivityLog = message.data;
        const logDeptId = (message as any)['departmentId'];

        if (this.shouldShowLog(newLog, logDeptId)) {
            // Add to beginning of array
            this.logs.unshift(newLog);
            this.totalElements++;

            // If we are on the first page and exceeded page size, remove the last item
            if (this.currentPage === 0 && this.logs.length > this.pageSize) {
                this.logs.pop();
            }
        }
    }

    shouldShowLog(log: ActivityLog, logDeptId: number | null): boolean {
        if (!this.currentUser) return false;

        const myRole = this.currentUser.role;
        const myEmail = this.currentUser.email;

        // 1. Super Admin sees everything
        if (myRole === 'SUPER_ADMIN') return true;

        // 2. Admin sees their department's logs (except other SuperAdmin logs)
        if (myRole === 'ADMIN') {
            if (log.userRole === 'SUPER_ADMIN') return false;
            return logDeptId === this.currentUser.departmentId;
        }

        // 3. Supervisor sees their own logs and their interns' logs
        if (myRole === 'SUPERVISOR') {
            if (log.username === myEmail) return true;
            // Approximation for real-time: trust department match if it's an intern action
            return log.userRole === 'INTERN' && logDeptId === this.currentUser.departmentId;
        }

        // 4. Intern only sees their own logs
        if (myRole === 'INTERN') {
            return log.username === myEmail;
        }

        return false;
    }

    loadLogs(page: number = 0): void {
        this.loading = true;
        this.currentPage = page;

        this.logService.getLogs(page, this.pageSize, this.filters).subscribe({
            next: (data: PaginatedLogs) => {
                this.logs = data.content;
                this.totalElements = data.totalElements;
                this.totalPages = data.totalPages;
                this.loading = false;
            },
            error: (err) => {
                console.error('Error loading logs:', err);
                this.loading = false;
            }
        });
    }

    applyFilters(): void {
        this.loadLogs(0);
    }

    clearFilters(): void {
        this.filters = {
            username: '',
            action: '',
            role: ''
        };
        this.currentPage = 0;
        this.loadLogs(0);
    }

    getPages(): number[] {
        const pages = [];
        for (let i = 0; i < this.totalPages; i++) {
            pages.push(i);
        }
        return pages;
    }

    loadOnlineUsers(): void {
        this.userService.getOnlineUsers().subscribe({
            next: (users) => {
                this.onlineUsers = users || [];
            },
            error: (err) => {
                console.error('Error fetching online users:', err);
            }
        });
    }

    isUserOnline(username: string): boolean {
        return this.onlineUsers.includes(username);
    }
}
