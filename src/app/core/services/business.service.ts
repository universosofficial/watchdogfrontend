import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Business, BusinessMember } from '../models/business.model';
import { ApiResponse } from '../models/api-response.model';

@Injectable({
  providedIn: 'root'
})
export class BusinessService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/businesses`;

  getMyBusiness(): Observable<Business> {
    return this.http.get<ApiResponse<Business>>(`${this.apiUrl}/me`).pipe(
      map(res => {
        if (!res.success) throw new Error(res.error?.message || 'Failed loading business details');
        return res.data;
      })
    );
  }

  updateMyBusiness(payload: Partial<Business>): Observable<Business> {
    return this.http.put<ApiResponse<Business>>(`${this.apiUrl}/me`, payload).pipe(
      map(res => {
        if (!res.success) throw new Error(res.error?.message || 'Failed updating business profile');
        return res.data;
      })
    );
  }

  getMembers(): Observable<BusinessMember[]> {
    return this.http.get<ApiResponse<BusinessMember[]>>(`${this.apiUrl}/members`).pipe(
      map(res => {
        if (!res.success) throw new Error(res.error?.message || 'Failed loading team members');
        return res.data;
      })
    );
  }

  inviteMember(email: string, role: 'owner' | 'staff' = 'staff'): Observable<any> {
    return this.http.post<ApiResponse<any>>(`${this.apiUrl}/members`, { email, role }).pipe(
      map(res => {
        if (!res.success) throw new Error(res.error?.message || 'Failed inviting member');
        return res.data;
      })
    );
  }
}
