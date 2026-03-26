import { UserRepository } from './user.repository';
import { CreateUserDto, UpdateUserDto, UserResponse } from './user.types';
import { PasswordUtil } from '../../utils/password';

export class UserService {
  private userRepository: UserRepository;

  constructor() {
    this.userRepository = new UserRepository();
  }

  /**
   * Create a new user
   */
  async createUser(data: CreateUserDto): Promise<UserResponse> {
    // Check if user already exists
    const existingUser = await this.userRepository.findByEmail(data.email);
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    if (!data.password) {
      throw new Error('Password is required');
    }

    // Hash password
    const hashedPassword = await PasswordUtil.hash(data.password);

    // Create user
    const user = await this.userRepository.create({
      ...data,
      password: hashedPassword,
    });

    return this.userRepository.sanitizeUser(user);
  }

  /**
   * Get user by ID
   */
  async getUserById(id: string): Promise<UserResponse> {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new Error('User not found');
    }
    return this.userRepository.sanitizeUser(user);
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: string): Promise<UserResponse> {
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      throw new Error('User not found');
    }
    return this.userRepository.sanitizeUser(user);
  }

  /**
   * Get all users
   */
  async getAllUsers(): Promise<UserResponse[]> {
    const users = await this.userRepository.findAll();
    return users.map((user) => this.userRepository.sanitizeUser(user));
  }

  /**
   * Update user
   */
  async updateUser(id: string, data: UpdateUserDto): Promise<UserResponse> {
    // Check if user exists
    const existingUser = await this.userRepository.findById(id);
    if (!existingUser) {
      throw new Error('User not found');
    }

    // Check if email is being updated and if it's already taken
    if (data.email && data.email !== existingUser.email) {
      const emailTaken = await this.userRepository.existsByEmail(data.email);
      if (emailTaken) {
        throw new Error('Email already in use');
      }
    }

    const updatedUser = await this.userRepository.update(id, data);
    return this.userRepository.sanitizeUser(updatedUser);
  }

  /**
   * Delete user
   */
  async deleteUser(id: string): Promise<UserResponse> {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new Error('User not found');
    }

    const deletedUser = await this.userRepository.delete(id);
    return this.userRepository.sanitizeUser(deletedUser);
  }
}
