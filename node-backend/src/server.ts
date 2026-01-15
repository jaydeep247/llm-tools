/**
 * Server Entry Point
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import { Logger } from './helpers/logging/Logger.js';
import { registerRoutes } from './config/routeRegistration.js';
import { notFoundHandler, globalErrorHandler } from './middleware/errorHandler.js';
import { initializeDatabase, startServer, setupProcessHandlers } from './services/serverLifecycle.js';

const logger = Logger.getInstance();

// Initialize Express application
const app = express();
const PORT = Number(process.env.PORT) || 3004;

// Security: Helmet.js for secure HTTP headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'", "data:"],
        },
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    },
    frameguard: { action: 'deny' },
    noSniff: true,
    xssFilter: true
}));

// CORS Configuration - Production Ready
const corsOrigin = process.env.CORS_ORIGIN?.replace(/\/$/, '') || 'http://localhost:3000';
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) return callback(null, true);
        
        // Allow configured origins
        const allowedOrigins = [
            corsOrigin,
            'http://localhost:3000',
            'http://localhost:3004',
            `${process.env.PUBLIC_IP}:3000`,
            `${process.env.PUBLIC_IP}:3004`
        ];
        
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            logger.warn(`CORS blocked origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true, // Allow cookies to be sent
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    maxAge: 86400 // 24 hours
}));

app.use(cookieParser());

// Request logging with morgan
app.use(morgan('combined', {
    stream: {
        write: (message: string) => logger.info(message.trim())
    },
    skip: (req: express.Request) => req.url === '/api/health' || req.url === '/health' // Skip health checks
}));

// Increase JSON body limit; configurable via BODY_LIMIT (default 5mb)
const bodyLimit = process.env.BODY_LIMIT || '5mb';
app.use(express.json({ limit: bodyLimit }));
app.use(express.urlencoded({ extended: true, limit: bodyLimit }));

// Serve built frontend (Vite output)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distFrontendPath = path.resolve(__dirname, '../dist-frontend');
app.use(express.static(distFrontendPath));

// Register all application routes
registerRoutes(app);

// Error handling middleware
app.use(notFoundHandler);
app.use(globalErrorHandler);

// Initialize database and start server
await initializeDatabase();
startServer(app, PORT);

// Setup process event handlers for graceful shutdown
setupProcessHandlers();


