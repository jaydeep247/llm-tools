import { connectToMongo } from '../../config/mongo';

export class FieldsRepository {
  async findByJobIdAndUrl(jobId: string, url: string): Promise<any | null> {
    const db = await connectToMongo();
    const docs = await db
      .collection('fields')
      .find({ jobId, url })
      .sort({ createdAt: -1 })
      .limit(1)
      .toArray();
    return docs[0] ?? null;
  }
}
