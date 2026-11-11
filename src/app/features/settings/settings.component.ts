import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { BusinessService } from '../../core/services/business.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { DeveloperService } from '../../core/services/developer.service';
import { Business, BusinessMember } from '../../core/models/business.model';
import { ApiKey, WebhookEndpoint, WebhookDelivery } from '../../core/models/developer.model';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css']
})
export class SettingsComponent implements OnInit {
  private fb = inject(FormBuilder);
  private businessService = inject(BusinessService);
  private developerService = inject(DeveloperService);
  authService = inject(AuthService);
  private notificationService = inject(NotificationService);

  loading = signal(true);
  saving = signal(false);
  business = signal<Business | null>(null);
  members = signal<BusinessMember[]>([]);
  activeTab = signal<'profile' | 'signatories' | 'security' | 'bots' | 'developer'>('profile');

  // --- DEVELOPER PLATFORM STATE ---
  apiKeys = signal<ApiKey[]>([]);
  loadingKeys = signal(false);
  showNewKeyModal = signal(false);
  newlyCreatedKey = signal<ApiKey | null>(null);
  generatingKey = signal(false);

  webhooks = signal<WebhookEndpoint[]>([]);
  loadingWebhooks = signal(false);
  showNewWebhookModal = signal(false);
  registeringWebhook = signal(false);
  testingPingEndpointId = signal<string | null>(null);
  activeDeliveriesEndpoint = signal<string | null>(null);
  webhookDeliveries = signal<WebhookDelivery[]>([]);
  loadingDeliveries = signal(false);

  selectedSnippetLang = signal<'curl' | 'node' | 'python' | 'webhook'>('curl');
  copiedState = signal<string | null>(null);

  newKeyForm: FormGroup = this.fb.group({
    name: ['Marketplace Production Key', [Validators.required, Validators.minLength(2)]],
    environment: ['live', [Validators.required]]
  });

  newWebhookForm: FormGroup = this.fb.group({
    url: ['', [Validators.required, Validators.pattern(/^https?:\/\/.+/)]],
    subscribe_all: [true],
    deals_events: [true],
    payment_events: [true],
    dispute_events: [true]
  });

  setActiveTab(tab: 'profile' | 'signatories' | 'security' | 'bots' | 'developer'): void {
    this.activeTab.set(tab);
    if (tab === 'developer') {
      this.loadDeveloperData();
    }
  }

  businessForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    rc_number: [''],
    address: ['']
  });

  inviteForm: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    role: ['staff', [Validators.required]]
  });

  inviting = signal(false);

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.loading.set(true);

    this.businessService.getMyBusiness().subscribe({
      next: (biz: Business) => {
        this.business.set(biz);
        this.businessForm.patchValue({
          name: biz.name,
          rc_number: biz.rc_number || '',
          address: biz.address || ''
        });
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      }
    });

    this.businessService.getMembers().subscribe({
      next: (mList: BusinessMember[]) => {
        this.members.set(mList || []);
      },
      error: () => {}
    });
  }

  // --- DEVELOPER METHODS ---
  loadDeveloperData(): void {
    this.loadingKeys.set(true);
    this.loadingWebhooks.set(true);

    this.developerService.getApiKeys().subscribe({
      next: (keys) => {
        this.apiKeys.set(keys);
        this.loadingKeys.set(false);
      },
      error: () => this.loadingKeys.set(false)
    });

    this.developerService.getWebhooks().subscribe({
      next: (whs) => {
        this.webhooks.set(whs);
        this.loadingWebhooks.set(false);
      },
      error: () => this.loadingWebhooks.set(false)
    });
  }

  openCreateKeyModal(): void {
    this.newKeyForm.reset({ name: 'Marketplace Integration Key', environment: 'live' });
    this.newlyCreatedKey.set(null);
    this.showNewKeyModal.set(true);
  }

  closeCreateKeyModal(): void {
    this.showNewKeyModal.set(false);
    this.newlyCreatedKey.set(null);
  }

  onCreateApiKey(): void {
    if (this.newKeyForm.invalid) {
      this.newKeyForm.markAllAsTouched();
      return;
    }

    this.generatingKey.set(true);
    const { name, environment } = this.newKeyForm.value;

    this.developerService.createApiKey({ name, environment }).subscribe({
      next: (created) => {
        this.generatingKey.set(false);
        this.newlyCreatedKey.set(created);
        this.notificationService.showSuccess('API Key generated successfully! Copy it now.');
        // Refresh list
        this.developerService.getApiKeys().subscribe(k => this.apiKeys.set(k));
      },
      error: (err) => {
        this.generatingKey.set(false);
        this.notificationService.showError(err.error?.error?.message || 'Failed generating API key');
      }
    });
  }

  onRevokeApiKey(keyId: string, name: string): void {
    if (!confirm(`Are you sure you want to revoke "${name}"? Any external platform using this key will immediately lose access.`)) {
      return;
    }

    this.developerService.revokeApiKey(keyId).subscribe({
      next: () => {
        this.notificationService.showSuccess('API key revoked.');
        this.developerService.getApiKeys().subscribe(k => this.apiKeys.set(k));
      },
      error: (err) => this.notificationService.showError(err.error?.error?.message || 'Failed revoking API key')
    });
  }

  openCreateWebhookModal(): void {
    this.newWebhookForm.reset({
      url: 'https://',
      subscribe_all: true,
      deals_events: true,
      payment_events: true,
      dispute_events: true
    });
    this.showNewWebhookModal.set(true);
  }

  closeCreateWebhookModal(): void {
    this.showNewWebhookModal.set(false);
  }

  onRegisterWebhook(): void {
    if (this.newWebhookForm.invalid) {
      this.newWebhookForm.markAllAsTouched();
      return;
    }

    this.registeringWebhook.set(true);
    const val = this.newWebhookForm.value;

    let events: string[] = ['*'];
    if (!val.subscribe_all) {
      events = [];
      if (val.deals_events) events.push('deal.created', 'deal.accepted', 'deal.completed');
      if (val.payment_events) events.push('payment.reported', 'payment.confirmed');
      if (val.dispute_events) events.push('dispute.opened', 'dispute.resolved');
    }

    this.developerService.registerWebhook({ url: val.url.trim(), events }).subscribe({
      next: () => {
        this.registeringWebhook.set(false);
        this.notificationService.showSuccess('Webhook endpoint registered successfully.');
        this.closeCreateWebhookModal();
        this.developerService.getWebhooks().subscribe(w => this.webhooks.set(w));
      },
      error: (err) => {
        this.registeringWebhook.set(false);
        this.notificationService.showError(err.error?.error?.message || err.message || 'Failed registering webhook endpoint');
      }
    });
  }

  onDeleteWebhook(endpointId: string): void {
    if (!confirm('Are you sure you want to delete this webhook endpoint?')) return;

    this.developerService.deleteWebhook(endpointId).subscribe({
      next: () => {
        this.notificationService.showSuccess('Webhook endpoint deleted.');
        this.developerService.getWebhooks().subscribe(w => this.webhooks.set(w));
        if (this.activeDeliveriesEndpoint() === endpointId) {
          this.activeDeliveriesEndpoint.set(null);
        }
      },
      error: (err) => this.notificationService.showError(err.error?.error?.message || 'Failed deleting webhook')
    });
  }

  onTestWebhookPing(endpointId: string): void {
    this.testingPingEndpointId.set(endpointId);
    this.developerService.testWebhookPing(endpointId).subscribe({
      next: (res) => {
        this.testingPingEndpointId.set(null);
        if (res.status === 'success') {
          this.notificationService.showSuccess(`Webhook ping delivered! HTTP ${res.status_code}`);
        } else {
          this.notificationService.showWarning(`Webhook returned HTTP ${res.status_code || 'error'}: ${res.error || 'Server error'}`);
        }
      },
      error: (err) => {
        this.testingPingEndpointId.set(null);
        this.notificationService.showError(err.error?.error?.message || err.message || 'Test ping delivery failed');
      }
    });
  }

  onViewDeliveries(endpointId: string): void {
    if (this.activeDeliveriesEndpoint() === endpointId) {
      this.activeDeliveriesEndpoint.set(null);
      return;
    }

    this.activeDeliveriesEndpoint.set(endpointId);
    this.loadingDeliveries.set(true);
    this.developerService.getWebhookDeliveries(endpointId).subscribe({
      next: (delivs) => {
        this.webhookDeliveries.set(delivs);
        this.loadingDeliveries.set(false);
      },
      error: () => this.loadingDeliveries.set(false)
    });
  }

  getSnippetCode(lang: string): string {
    if (lang === 'curl') {
      return `curl -X POST https://api.digitalwatchdog.ng/api/v1/deals \\
  -H "Authorization: Bearer dw_live_sec_YOUR_KEY" \\
  -H "X-Idempotency-Key: order_10928_checkout" \\
  -H "Content-Type: application/json" \\
  -d '{"title": "50 Solar Panels & Inverters", "amount": 1200000, "currency": "NGN", "counterparty_phone": "+2348012345678", "creator_role": "seller"}'`;
    } else if (lang === 'node') {
      return `const response = await fetch("https://api.digitalwatchdog.ng/api/v1/deals", {
  method: "POST",
  headers: {
    "Authorization": "Bearer dw_live_sec_YOUR_KEY",
    "X-Idempotency-Key": "order_" + orderId,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    title: "Order #" + orderId + " Protected Deal",
    amount: 1200000,
    currency: "NGN",
    counterparty_phone: buyerPhone,
    creator_role: "seller",
    expected_delivery_date: "2026-11-20"
  })
});
const deal = await response.json();`;
    } else if (lang === 'python') {
      return `import requests

res = requests.post(
    "https://api.digitalwatchdog.ng/api/v1/deals",
    headers={
        "Authorization": "Bearer dw_live_sec_YOUR_KEY",
        "X-Idempotency-Key": f"order_{order_id}",
        "Content-Type": "application/json"
    },
    json={
        "title": f"Order #{order_id} Protected Delivery",
        "amount": 1200000,
        "currency": "NGN",
        "counterparty_phone": buyer_phone,
        "creator_role": "seller"
    }
)
print(res.json())`;
    } else {
      return `const crypto = require("crypto");

function verifyWatchdogWebhook(rawBody, signatureHeader, secret) {
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
}`;
    }
  }

  copyCurrentSnippet(): void {
    const code = this.getSnippetCode(this.selectedSnippetLang());
    this.copyToClipboard(code, 'snippet_copy');
  }

  copyToClipboard(text: string, identifier: string): void {
    navigator.clipboard.writeText(text);
    this.copiedState.set(identifier);
    this.notificationService.showSuccess('Copied to clipboard!');
    setTimeout(() => {
      if (this.copiedState() === identifier) {
        this.copiedState.set(null);
      }
    }, 2500);
  }

  // --- CORPORATE PROFILE & SIGNATORY METHODS ---
  onSaveProfile(): void {
    if (this.businessForm.invalid) {
      this.businessForm.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.businessService.updateMyBusiness(this.businessForm.value).subscribe({
      next: (updated: Business) => {
        this.saving.set(false);
        this.business.set(updated);
        this.notificationService.showSuccess('Company profile successfully updated');
        this.authService.getMe().subscribe();
      },
      error: (err: any) => {
        this.saving.set(false);
        this.notificationService.showError(err.error?.error?.message || 'Failed updating profile');
      }
    });
  }

  onInviteMember(): void {
    if (this.inviteForm.invalid) {
      this.inviteForm.markAllAsTouched();
      return;
    }

    this.inviting.set(true);
    const { email, role } = this.inviteForm.value;

    this.businessService.inviteMember(email, role).subscribe({
      next: () => {
        this.inviting.set(false);
        this.notificationService.showSuccess(`Invitation sent to ${email}`);
        this.inviteForm.reset({ role: 'staff' });
        this.businessService.getMembers().subscribe(m => this.members.set(m));
      },
      error: (err: any) => {
        this.inviting.set(false);
        this.notificationService.showError(err.error?.error?.message || 'Failed to send invitation');
      }
    });
  }
}
