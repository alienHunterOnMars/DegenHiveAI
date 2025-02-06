/**
 * UserManager: Manages user profiles and connection status.
 *
 * Determines whether a Telegram user has linked their account with a dragonbee-trainer profile.
 * If not, a fee of 0.1% is applied to all trades.
 */
import { Logger } from "./utils/logger";

export interface IUserManager {
  isFirstTime(userId: string): Promise<boolean>;
  isUserConnected(userId: string): Promise<boolean>;
  linkUserProfile(userId: string, profileId: string): Promise<void>;
  getFeeRate(userId: string): Promise<number>;
}

interface UserProfile {
  userId: string;
  profileId?: string;
}

export class UserManager implements IUserManager {
  // In production, this data would live in a persistent database.
  private userProfiles: Map<string, UserProfile> = new Map();

  public async isFirstTime(userId: string): Promise<boolean> {
    return !this.userProfiles.has(userId);
  }

  public async isUserConnected(userId: string): Promise<boolean> {
    const profile = this.userProfiles.get(userId);
    return profile !== undefined && !!profile.profileId;
  }

  public async linkUserProfile(userId: string, profileId: string): Promise<void> {
    this.userProfiles.set(userId, { userId, profileId });
    Logger.info(`User ${userId} linked to profile ${profileId}`);
  }

  public async getFeeRate(userId: string): Promise<number> {
    // 0 fee if user is connected; otherwise, 0.001 (0.1%) fee.
    const connected = await this.isUserConnected(userId);
    return connected ? 0 : 0.001;
  }
}