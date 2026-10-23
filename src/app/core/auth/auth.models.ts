export interface MobileUser {
  readonly id: string;
  readonly email: string;
  readonly can_create_organization: boolean;
}

export interface MobileTokenResponse {
  readonly access_token: string;
  readonly refresh_token: string;
  readonly token_type: 'Bearer';
  readonly expires_in: number;
  readonly refresh_expires_in: number;
  readonly access_expires_at: string;
  readonly refresh_expires_at: string;
  readonly user: MobileUser;
}

export interface StoredRefreshCredential {
  readonly refreshToken: string;
  readonly refreshExpiresAt: string;
}
