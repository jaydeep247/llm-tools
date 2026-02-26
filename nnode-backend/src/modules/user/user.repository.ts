import { randomUUID } from 'crypto';
import { connectToMongo } from '../../config/mongo';
import { CreateUserDto, UpdateUserDto, UserFilters, UserResponse, UserEntity } from './user.types';
import { UserRole } from '../../shared/constants/roles';

export class UserRepository {
  /**
   * Create a new user
   */
  async create(data: CreateUserDto): Promise<UserEntity> {
    const db = await connectToMongo();
    const now = new Date();
    const user: UserEntity = {
      id: randomUUID(),
      email: data.email,
      password: data.password,
      name: data.name,
      role: data.role ?? UserRole.ANALYST,
      createdAt: now,
      updatedAt: now,
      hasNew: true, // Default to true for new users
    };
    await db.collection<UserEntity>('users').insertOne(user);
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
    return db.collection<UserEntity>('users').findOne({ email });
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
    await db.collection<UserEntity>('users').updateOne(
      { id },
      { $set: { ...data, updatedAt: new Date() } }
    );
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
    const count = await db
      .collection<UserEntity>('users')
      .countDocuments({ email });
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
