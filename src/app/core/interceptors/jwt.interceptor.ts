import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { environment } from '../../../environments/environment';

export const jwtInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = authService.getToken();

  const isApiUrl = req.url.startsWith(environment.apiUrl);

  const headers: { [key: string]: string } = {};
  if (token && isApiUrl) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Security & Resilience: Auto-attach UUID Idempotency Key on state-changing API operations
  if (isApiUrl && ['POST', 'PUT', 'PATCH'].includes(req.method) && !req.headers.has('X-Idempotency-Key')) {
    const key = typeof crypto !== 'undefined' && crypto.randomUUID 
      ? crypto.randomUUID() 
      : `idemp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    headers['X-Idempotency-Key'] = key;
  }

  const clonedReq = req.clone({
    withCredentials: true,
    setHeaders: headers
  });

  return next(clonedReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && isApiUrl && !req.url.includes('/auth/login') && !req.url.includes('/auth/register')) {
        authService.logout();
      }
      return throwError(() => error);
    })
  );
};
