# Node.js Backend

A production-grade Node.js backend built with TypeScript, Express, Prisma, and PostgreSQL.

## 🚀 Tech Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **ORM**: Prisma
- **Database**: PostgreSQL
- **Authentication**: JWT with HTTP-only cookies
- **Validation**: Zod
- **Password Hashing**: bcrypt
- **Logging**: Winston

## 📁 Project Structure

```
nnode-backend/
├── src/
│   ├── config/          # Configuration files
│   ├── modules/         # Domain-based modules
│   │   ├── auth/        # Authentication
│   │   ├── user/        # User management
│   │   ├── project/     # Projects (future)
│   │   └── job/         # Jobs (future)
│   ├── middlewares/     # Express middlewares
│   ├── shared/          # Shared services
│   ├── utils/           # Utility functions
│   ├── types/           # TypeScript declarations
│   ├── app.ts           # Express app setup
│   ├── main.ts          # Entry point
│   └── routes.ts        # Route registry
├── prisma/
│   └── schema.prisma    # Database schema
├── scripts/
│   └── seed.ts          # Database seeding
└── package.json
```

## 🛠️ Setup Instructions

### 1. Install Dependencies

```bash
cd nnode-backend
npm install
```

### 2. Configure Environment

Update `.env` file with your database credentials:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/dbname?schema=public"
JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"
COOKIE_SECRET="your-super-secret-cookie-key-change-this-in-production"
```

### 3. Setup Database

```bash
# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# Seed database (optional)
npm run prisma:seed
```

### 4. Start Development Server

```bash
npm run dev
```

Server will start on `http://localhost:4000`

## 📝 API Endpoints

### Authentication

- `POST /api/v1/auth/signup` - User registration
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/logout` - User logout (protected)
- `GET /api/v1/auth/me` - Get current user (protected)

### Users

- `GET /api/v1/users` - Get all users (admin only)
- `GET /api/v1/users/:id` - Get user by ID (protected)
- `PUT /api/v1/users/:id` - Update user (protected)
- `DELETE /api/v1/users/:id` - Delete user (admin only)

### Health Check

- `GET /api/v1/health` - Server health status

## 🔐 Authentication

The API uses JWT tokens stored in HTTP-only cookies for authentication. Tokens can also be sent via the `Authorization: Bearer <token>` header.

### Default Users (after seeding)

- **Admin**: `admin@example.com` / `Admin@123`
- **User**: `user@example.com` / `User@123`

## 🏗️ Architecture

The backend follows a clean architecture pattern:

- **Controllers**: Handle HTTP requests/responses
- **Services**: Contain business logic
- **Repositories**: Handle database operations
- **Middlewares**: Handle cross-cutting concerns

## 📦 Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run prisma:generate` - Generate Prisma client
- `npm run prisma:migrate` - Run database migrations
- `npm run prisma:studio` - Open Prisma Studio
- `npm run prisma:seed` - Seed database

## 🔒 Security Features

- Helmet.js for security headers
- CORS configuration
- Rate limiting
- HTTP-only cookies
- Password hashing with bcrypt
- JWT token expiration
- Input validation with Zod

## 🚧 Future Modules

The project structure includes placeholders for:

- **Projects**: Project management
- **Jobs**: Background jobs for crawling and AI processing

## 📄 License

MIT
