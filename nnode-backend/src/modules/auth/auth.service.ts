import { OAuth2Client } from 'google-auth-library';
import { UserRepository } from '../user/user.repository';
import { SignupDto, LoginDto, GoogleAuthDto, AuthResponse } from './auth.types';
import { PasswordUtil } from '../../utils/password';
import { JwtUtil } from '../../utils/jwt';
import { UserRole } from '../../shared/constants/roles';
import { env } from '../../config/env';

import { UserEntity } from '../user/user.types';

const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

export class AuthService {
  private userRepository: UserRepository;

  constructor() {
    this.userRepository = new UserRepository();
  }

  private getOnboardingState(user: UserEntity): UserEntity['onboardingState'] {
    if (user.onboardingState) {
      return user.onboardingState;
    }

    if (user.hasNew === false) {
      return {
        status: 'completed',
        resumePath: '/dashboard',
      };
    }

    return {
      status: 'in_progress',
      currentFlow: 'core',
      currentStep: 0,
      resumePath: '/onboarding',
    };
  }

  /**
   * Build a sanitised AuthResponse from a UserEntity
   */
  private buildAuthResponse(user: UserEntity): AuthResponse {
    const token = JwtUtil.sign({
      userId: user.id,
      email: user.email,
      role: user.role,
    });
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role as unknown as UserRole,
        hasNew: user.hasNew,
        onboardingState: this.getOnboardingState(user),
        onboardingData: user.onboardingData,
      },
      token,
    };
  }

  /**
   * User signup (email + password)
   */
  async signup(data: SignupDto): Promise<AuthResponse> {
    // Check if user already exists
    const existingUser = await this.userRepository.findByEmail(data.email);
    if (existingUser) {
      // User registered via Google only
      if (existingUser.authProvider === 'google') {
        throw new Error('Account already exists. Please log in using Google.');
      }
      throw new Error('User with this email already exists');
    }

    // Validate password strength
    const passwordValidation = PasswordUtil.validate(data.password);
    if (!passwordValidation.valid) {
      throw new Error(passwordValidation.message || 'Invalid password');
    }

    // Hash password
    const hashedPassword = await PasswordUtil.hash(data.password);

    // Create user
    let user;
    try {
      user = await this.userRepository.create({
        ...data,
        password: hashedPassword,
        authProvider: 'email',
      });
    } catch (createError: any) {
      // Race condition: another request created the user between our check and create.
      // Re-fetch to throw the correct domain error instead of a raw DB error.
      if (
        createError.message?.includes('already exists') ||
        createError.message?.includes('already linked')
      ) {
        const raceUser = await this.userRepository.findByEmail(data.email);
        if (raceUser) {
          if (raceUser.authProvider === 'google' || raceUser.authProvider === 'both') {
            throw new Error('Account already exists. Please log in using Google.');
          }
          throw new Error('User with this email already exists');
        }
      }
      throw createError;
    }

    return this.buildAuthResponse(user);
  }

  /**
   * User login (email + password)
   */
  async login(data: LoginDto): Promise<AuthResponse> {
    // Find user by email
    const user = await this.userRepository.findByEmail(data.email);
    if (!user) {
      throw new Error('Invalid credentials');
    }

    // Account was created exclusively via Google — no password set
    if (user.authProvider === 'google') {
      throw new Error('Please log in using Google.');
    }

    // Compare passwords
    const isPasswordValid = await PasswordUtil.compare(data.password, user.password!);
    if (!isPasswordValid) {
      throw new Error('Invalid credentials');
    }

    return this.buildAuthResponse(user);
  }

  /**
   * Google OAuth authentication (sign-up or login via Google ID token)
   */
  async googleAuth(data: GoogleAuthDto): Promise<AuthResponse> {
    if (!env.GOOGLE_CLIENT_ID) {
      throw new Error('Google OAuth is not configured on this server.');
    }

    // Verify the ID token with Google's public keys
    let payload: { sub: string; email?: string; name?: string; email_verified?: boolean };
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: data.idToken,
        audience: env.GOOGLE_CLIENT_ID,
      });
      const ticketPayload = ticket.getPayload();
      if (!ticketPayload) throw new Error('Empty token payload');
      payload = ticketPayload as typeof payload;
    } catch {
      throw new Error('Invalid Google token. Please try again.');
    }

    const { sub: googleId, email, name, email_verified } = payload;

    if (!email || !email_verified) {
      throw new Error('Google account does not have a verified email address.');
    }

    // Case 1 & 2: Check if user exists by Google ID or Email concurrently
    const [userByGoogleId, userByEmail] = await Promise.all([
      this.userRepository.findByGoogleId(googleId),
      this.userRepository.findByEmail(email)
    ]);

    // Case 1: existing account linked to this Google ID
    if (userByGoogleId) {
      return this.buildAuthResponse(userByGoogleId);
    }

    // Case 2: existing email/password account — link Google to it
    if (userByEmail) {
      if (userByEmail.googleId && userByEmail.googleId !== googleId) {
        throw new Error('This email is already linked to another Google account. Please log in with Google.');
      }

      const nextAuthProvider = userByEmail.authProvider === 'email' ? 'both' : userByEmail.authProvider;
      const updatePayload: Partial<Pick<UserEntity, 'googleId' | 'authProvider'>> = {};

      if (!userByEmail.googleId) {
        updatePayload.googleId = googleId;
      }

      if (nextAuthProvider !== userByEmail.authProvider) {
        updatePayload.authProvider = nextAuthProvider;
      }

      if (Object.keys(updatePayload).length === 0) {
        return this.buildAuthResponse(userByEmail);
      }

      const updated = await this.userRepository.update(userByEmail.id, updatePayload);
      return this.buildAuthResponse(updated);
    }

    // Case 3: brand-new user — create account via Google
    const displayName = name || email.split('@')[0];
    try {
      const newUser = await this.userRepository.create({
        email,
        name: displayName,
        googleId,
        authProvider: 'google',
        role: UserRole.ANALYST,
      });

      return this.buildAuthResponse(newUser);
    } catch (error) {
      const existingLinkedUser = await this.userRepository.findByGoogleId(googleId);
      if (existingLinkedUser) {
        return this.buildAuthResponse(existingLinkedUser);
      }

      const existingEmailUser = await this.userRepository.findByEmail(email);
      if (existingEmailUser) {
        if (!existingEmailUser.googleId) {
          const nextAuthProvider = existingEmailUser.authProvider === 'email' ? 'both' : existingEmailUser.authProvider;
          const updated = await this.userRepository.update(existingEmailUser.id, {
            googleId,
            authProvider: nextAuthProvider,
          });
          return this.buildAuthResponse(updated);
        }

        return this.buildAuthResponse(existingEmailUser);
      }

      throw error;
    }
  }

  /**
   * Get user profile by ID
   */
  async getUserProfile(userId: string): Promise<AuthResponse['user']> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as unknown as UserRole,
      hasNew: user.hasNew,
      onboardingState: this.getOnboardingState(user),
      onboardingData: user.onboardingData,
    };
  }

  /**
   * Verify token and get user
   */
  async verifyToken(token: string): Promise<AuthResponse['user']> {
    const payload = JwtUtil.verify(token);
    return this.getUserProfile(payload.userId);
  }

  /**
   * Refresh a user token
   */
  async refreshToken(userId: string): Promise<string> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    return JwtUtil.sign({
      userId: user.id,
      email: user.email,
      role: user.role,
    });
  }

  /**
   * Generate OAuth URL for Google Analytics connection
   * Uses a separate OAuth2 flow from login — different scopes, different purpose
   */
  async getAnalyticsAuthUrl(): Promise<{ url: string }> {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      throw new Error('Google Analytics OAuth is not configured on this server.');
    }
    const client = new OAuth2Client({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      redirectUri: env.GOOGLE_ANALYTICS_REDIRECT_URI,
    });
    const url = client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/analytics.readonly'],
    });
    return { url };
  }

  /**
   * Exchange authorization code for Analytics tokens and persist under googleAnalytics field
   * NEVER touches login tokens — stored at a completely separate path in the user document
   */
  async exchangeAnalyticsCode(userId: string, code: string): Promise<void> {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      throw new Error('Google Analytics OAuth is not configured on this server.');
    }
    const client = new OAuth2Client({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      redirectUri: env.GOOGLE_ANALYTICS_REDIRECT_URI,
    });
    const { tokens } = await client.getToken(code);
    await this.userRepository.update(userId, {
      googleAnalytics: {
        connected: true,
        accessToken: tokens.access_token ?? null,
        refreshToken: tokens.refresh_token ?? null,
        expiryDate: tokens.expiry_date ?? null,
      },
    });
  }
}

