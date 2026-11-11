import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { NotificationService } from '../services/notification.service';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const notificationService = inject(NotificationService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      let errorMessage = 'An unexpected error occurred';

      if (error.error instanceof ErrorEvent) {
        // Client-side network or processing error
        errorMessage = error.error.message;
      } else if (error.error) {
        // Backend API response error format: { success: false, error: { message, code } }
        if (typeof error.error.error === 'object' && error.error.error?.message) {
          errorMessage = error.error.error.message;
        } else if (error.error.message) {
          errorMessage = error.error.message;
        } else if (typeof error.error === 'string') {
          errorMessage = error.error;
        }
      } else if (error.statusText) {
        errorMessage = `Error (${error.status}): ${error.statusText}`;
      }

      // Suppress 401 notification on initial check / me endpoint if not logged in
      const isSilentMeError = req.url.includes('/auth/me') && error.status === 401;
      if (!isSilentMeError) {
        notificationService.showError(errorMessage);
      }

      return throwError(() => error);
    })
  );
};
