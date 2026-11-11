import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { LoginComponent } from './features/auth/login/login.component';
import { RegisterComponent } from './features/auth/register/register.component';
import { MainLayoutComponent } from './layout/main-layout.component';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { DealListComponent } from './features/deals/deal-list/deal-list.component';
import { DealCreateComponent } from './features/deals/deal-create/deal-create.component';
import { DealWorkspaceComponent } from './features/deals/deal-workspace/deal-workspace.component';
import { SettingsComponent } from './features/settings/settings.component';
import { ProfileComponent } from './features/profile/profile.component';
import { VerificationComponent } from './features/verification/verification.component';
import { LegalComponent } from './features/legal/legal.component';
import { DealPublicPreviewComponent } from './features/deals/deal-public-preview/deal-public-preview.component';

export const routes: Routes = [
  // Public Auth & Legal Routes
  {
    path: 'auth/login',
    component: LoginComponent
  },
  {
    path: 'auth/register',
    component: RegisterComponent
  },
  {
    path: 'terms',
    component: LegalComponent
  },
  {
    path: 'privacy',
    component: LegalComponent
  },
  // Unauthenticated Public Deal Preview (for shared WhatsApp / SMS links)
  {
    path: 'd/:dealId',
    component: DealPublicPreviewComponent
  },

  // Protected App Shell Routes (Core Transaction Application)
  {
    path: '',
    component: MainLayoutComponent,
    canActivateChild: [authGuard],
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full'
      },
      {
        path: 'dashboard',
        component: DashboardComponent
      },
      {
        path: 'deals',
        component: DealListComponent
      },
      {
        path: 'deals/new',
        component: DealCreateComponent
      },
      {
        path: 'deals/:dealId',
        component: DealWorkspaceComponent
      },
      {
        path: 'profile',
        component: ProfileComponent
      },
      {
        path: 'settings',
        component: SettingsComponent
      },
      {
        path: 'verification',
        component: VerificationComponent
      },
      {
        path: 'registry',
        redirectTo: 'dashboard',
        pathMatch: 'full'
      }
    ]
  },

  // Fallback Wildcard
  {
    path: '**',
    redirectTo: 'dashboard'
  }
];
