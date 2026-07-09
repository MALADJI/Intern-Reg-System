import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpEvent } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { LoadingStateService } from '../../services/loading-state.service';

/**
 * HTTP Interceptor that tracks in-flight requests and updates a global loading state.
 * This ensures the UI can react to any ongoing HTTP calls without each component
 * needing its own loading flag for background refreshes.
 */
export const loadingInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> => {
  const loadingService = inject(LoadingStateService);
  loadingService.increment();

  return next(req).pipe(
    finalize(() => loadingService.decrement())
  );
};
