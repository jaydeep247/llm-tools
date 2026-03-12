import { randomUUID } from 'crypto';
import { connectToMongo } from '../../config/mongo';
import { AdminEntity, AdminResponse } from './admin.types';

export class AdminRepository {
  private readonly COLLECTION = 'admins';

  async create(data: { email: string; password: string; name: string }): Promise<AdminEntity> {
    const db = await connectToMongo();
    const now = new Date();
    const admin: AdminEntity = {
      id: randomUUID(),
      email: data.email,
      password: data.password,
      name: data.name,
      role: 'ADMIN',
      createdAt: now,
      updatedAt: now,
    };
    try {
      await db.collection<AdminEntity>(this.COLLECTION).insertOne(admin);
    } catch (error: any) {
      if (error.code === 11000) throw new Error('An admin with this email already exists');
      throw error;
    }
    return admin;
  }

  async findById(id: string): Promise<AdminEntity | null> {
    const db = await connectToMongo();
    return db.collection<AdminEntity>(this.COLLECTION).findOne({ id });
  }

  async findByEmail(email: string): Promise<AdminEntity | null> {
    const db = await connectToMongo();
    return db.collection<AdminEntity>(this.COLLECTION).findOne({ email });
  }

  async existsByEmail(email: string): Promise<boolean> {
    const db = await connectToMongo();
    const count = await db.collection<AdminEntity>(this.COLLECTION).countDocuments({ email });
    return count > 0;
  }

  sanitize(admin: AdminEntity): AdminResponse {
    const { password: _pw, ...safe } = admin;
    return safe;
  }
}
