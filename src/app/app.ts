import { Component, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { Navbar } from './shared/navbar/navbar';
import { NgIf } from '@angular/common';
import { WebSocketService } from './services/websocket.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Navbar, NgIf],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  constructor(
    private router: Router,
    private webSocketService: WebSocketService
  ) {
    console.log('✅ App component constructed');
    console.log('Initial route:', this.router.url);

    // Connect to WebSocket
    this.webSocketService.connect();
  }
  protected readonly title = signal('Intern-Register-System');

  // Hide on login & register routes
  isAuthPage(): boolean {
    const currentRoute = this.router.url;
    return currentRoute.includes('login') || currentRoute.includes('sign-up');
  }
}
