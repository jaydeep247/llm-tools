import { randomUUID } from 'crypto';
import { connectToMongo } from '../../config/mongo';
import { CreateUserDto, UpdateUserDto, UserFilters, UserResponse, UserEntity } from './user.types';
import { UserRole } from '../../shared/constants/roles';

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export class UserRepository {
  /**
   * Create a new user
   */
  async create(data: CreateUserDto): Promise<UserEntity> {
    const db = await connectToMongo();
    const now = new Date();
    const normalizedEmail = data.emailNormalized ?? normalizeEmail(data.email);
    const user: UserEntity = {
      id: randomUUID(),
      email: normalizedEmail,
      emailNormalized: normalizedEmail,
      ...(data.password !== undefined && { password: data.password }),
      name: data.name,
      role: data.role ?? UserRole.ANALYST,
      // Only include googleId when it has a real value.
      // Omitting the field entirely prevents MongoDB from storing null and
      // avoids false 11000 duplicate-key errors on the unique googleId index
      // when multiple email-only users are created.
      ...(data.googleId != null && { googleId: data.googleId }),
      authProvider: data.authProvider ?? 'email',
      createdAt: now,
      updatedAt: now,
      hasNew: true, // Default to true for new users
      onboardingState: {
        status: 'in_progress',
        currentFlow: 'core',
        currentStep: 0,
        resumePath: '/onboarding',
      },
    };
    try {
      await db.collection<UserEntity>('users').insertOne(user);
    } catch (error: any) {
      if (error.code === 11000) {
        if (error.message?.includes('googleId')) {
          throw new Error('This Google account is already linked to another user');
        }
        throw new Error('A user with this email already exists');
      }
      throw error;
    }
    return user;
  }

  /**
   * Find user by ID
   */
  async findById(id: string): Promise<UserEntity | null> {
    const db = await connectToMongo();
    return db.collection<UserEntity>('users').findOne({ id });
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<UserEntity | null> {
    const db = await connectToMongo();
    const normalizedEmail = normalizeEmail(email);
    const collection = db.collection<UserEntity>('users');

    const userByNormalizedEmail = await collection.findOne({ emailNormalized: normalizedEmail });
    if (userByNormalizedEmail) {
      return userByNormalizedEmail;
    }

    return collection.findOne({
      email: {
        $regex: `^${escapeRegExp(email.trim())}$`,
        $options: 'i',
      },
    });
  }

  /**
   * Find user by Google ID
   */
  async findByGoogleId(googleId: string): Promise<UserEntity | null> {
    const db = await connectToMongo();
    return db.collection<UserEntity>('users').findOne({ googleId });
  }

  /**
   * Find all users with optional filters
   */
  async findAll(filters?: UserFilters): Promise<UserEntity[]> {
    const db = await connectToMongo();
    const query: Partial<UserEntity> = {}; // Use UserEntity for query
    if (filters?.email) {
      query.email = filters.email;
    }
    if (filters?.role) {
      query.role = filters.role;
    }
    return db
      .collection<UserEntity>('users')
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();
  }

  /**
   * Update user by ID
   */
  async update(id: string, data: UpdateUserDto): Promise<UserEntity> {
    const db = await connectToMongo();
    const updates: UpdateUserDto & { updatedAt: Date } = {
      ...data,
      updatedAt: new Date(),
    };

    if (data.email !== undefined) {
      const normalizedEmail = normalizeEmail(data.email);
      updates.email = normalizedEmail;
      updates.emailNormalized = normalizedEmail;
    }

    try {
      await db.collection<UserEntity>('users').updateOne(
        { id },
        { $set: updates }
      );
    } catch (error: any) {
      if (error.code === 11000) {
        if (error.message?.includes('googleId')) {
          throw new Error('This Google account is already linked to another user');
        }
        throw new Error('A user with this email already exists');
      }
      throw error;
    }

    const user = await this.findById(id);
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  }

  /**
   * Delete user by ID
   */
  async delete(id: string): Promise<UserEntity> {
    const db = await connectToMongo();
    const user = await this.findById(id);
    if (!user) {
      throw new Error('User not found');
    }
    await db
      .collection<UserEntity>('users')
      .deleteOne({ id });
    return user;
  }

  /**
   * Check if user exists by email
   */
  async existsByEmail(email: string): Promise<boolean> {
    const db = await connectToMongo();
    const normalizedEmail = normalizeEmail(email);
    const count = await db
      .collection<UserEntity>('users')
      .countDocuments({ emailNormalized: normalizedEmail });
    return count > 0;
  }

  /**
   * Remove password from user object
   */
  sanitizeUser(user: UserEntity): UserResponse {
    const { password, ...sanitized } = user;
    return sanitized;
  }
}
