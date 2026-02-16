import { User } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { CreateUserDto, UpdateUserDto, UserFilters, UserResponse } from './user.types';

export class UserRepository {
  /**
   * Create a new user
   */
  async create(data: CreateUserDto): Promise<User> {
    return prisma.user.create({
      data,
    });
  }

  /**
   * Find user by ID
   */
  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { id },
    });
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { email },
    });
  }

  /**
   * Find all users with optional filters
   */
  async findAll(filters?: UserFilters): Promise<User[]> {
    return prisma.user.findMany({
      where: filters,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Update user by ID
   */
  async update(id: string, data: UpdateUserDto): Promise<User> {
    return prisma.user.update({
      where: { id },
      data,
    });
  }

  /**
   * Delete user by ID
   */
  async delete(id: string): Promise<User> {
    return prisma.user.delete({
      where: { id },
    });
  }

  /**
   * Check if user exists by email
   */
  async existsByEmail(email: string): Promise<boolean> {
    const count = await prisma.user.count({
      where: { email },
    });
    return count > 0;
  }

  /**
   * Remove password from user object
   */
  sanitizeUser(user: User): UserResponse {
    const { password, ...sanitized } = user;
    return sanitized;
  }
}
