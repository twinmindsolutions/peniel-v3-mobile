import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiConfigService } from '../config/api-config.service';
import { MobileTokenResponse, MobileUser } from './auth.models';

@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(ApiConfigService);

  login(email: string, password: string): Observable<MobileTokenResponse> {
    return this.http.post<MobileTokenResponse>(this.url('/auth/mobile/login/'), { email, password });
  }

  refresh(refreshToken: string): Observable<MobileTokenResponse> {
    return this.http.post<MobileTokenResponse>(this.url('/auth/mobile/refresh/'), {
      refresh_token: refreshToken,
    });
  }

  logout(refreshToken: string): Observable<void> {
    return this.http.post<void>(this.url('/auth/mobile/logout/'), {
      refresh_token: refreshToken,
    });
  }

  me(): Observable<MobileUser> {
    return this.http.get<MobileUser>(this.url('/auth/me/'));
  }

  private url(path: string): string {
    return `${this.config.configuration.baseUrl.replace(/\/$/, '')}${path}`;
  }
}
