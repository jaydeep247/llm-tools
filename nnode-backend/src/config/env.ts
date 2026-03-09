import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Environment variable schema
const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).pipe(z.number().min(1).max(65535)).default('3004'),
  API_PREFIX: z.string().default('/api/v1'),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),

  // Cookie
  COOKIE_SECRET: z.string().min(32),
  COOKIE_MAX_AGE: z.string().transform(Number).pipe(z.number().positive()).default('604800000'),

  // CORS (comma-separated list of allowed origins)
  // Override via CORS_ORIGINS env var in production: e.g. "https://app.example.com"
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((val) => val.split(',').map((origin) => origin.trim())),

  // MongoDB
  MONGO_URI: z.string().default('mongodb://localhost:27017'),
  MONGO_DB_NAME: z.string().default('seo_crawler'),

  // Messaging
  RABBITMQ_URL: z.string().default('amqp://admin:admin@localhost:5672'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
});

// Validate and export environment variables
const parseEnv = () => {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Invalid environment variables:');
      error.errors.forEach((err) => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
      process.exit(1);
    }
    throw error;
  }
};

export const env = parseEnv();
