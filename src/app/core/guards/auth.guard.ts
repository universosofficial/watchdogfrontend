import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Allow public access to the Public Blacklist & Trust Registry
  if (state.url.startsWith('/registry')) {
    return true;
  }

  if (authService.isAuthenticated() || authService.getToken()) {
    return true;
  }

  // If visiting a specific deal room link while unauthenticated, gracefully route to the public preview
  const dealMatch = state.url.match(/^\/deals\/([a-zA-Z0-9-]+)(?:\?.*)?$/);
  if (dealMatch && dealMatch[1] !== 'new') {
    return router.createUrlTree(['/d', dealMatch[1]]);
  }

  return router.createUrlTree(['/auth/login'], {
    queryParams: { returnUrl: state.url }
  });
};
