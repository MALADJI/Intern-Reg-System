import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';

/**
 * Service that tracks the number of in-flight HTTP requests.
 * Components can subscribe to isLoading$ to show/hide a progress indicator.
 */
@Injectable({
  providedIn: 'root'
})
export class LoadingStateService {
  private pendingRequests = new BehaviorSubject<number>(0);

  /** Observable that emits true when any HTTP request is in-flight */
  isLoading$: Observable<boolean> = this.pendingRequests.pipe(
    map(count => count > 0),
    distinctUntilChanged()
  );

  increment() {
    this.pendingRequests.next(this.pendingRequests.value + 1);
  }

  decrement() {
    const current = this.pendingRequests.value;
    this.pendingRequests.next(Math.max(0, current - 1));
  }

  get isLoading(): boolean {
    return this.pendingRequests.value > 0;
  }
}
