import { prisma } from '../src/config/prismaClient.js';
import { AuthService } from '../src/services/AuthService.js';

async function seedAdminUser() {
    console.log('🌱 Seeding admin user...');
    
    try {
        const authService = new AuthService();
        const email = 'admin@test.com';
        const password = 'Admin1111';
        
        // Check if admin user already exists
        const existingUser = await prisma.user.findUnique({
            where: { email }
        });

        if (existingUser) {
            console.log('⚠️  Admin user already exists. Updating password...');
            const passwordHash = await authService.hashPassword(password);
            
            await prisma.user.update({
                where: { email },
                data: {
                    passwordHash,
                    role: 'admin',
                    isActive: true
                }
            });
            
            console.log('✅ Admin user password updated successfully!');
            console.log('📧 Email: admin@test.com');
            console.log('🔑 Password: Admin1111');
        } else {
            // Create new admin user
            const passwordHash = await authService.hashPassword(password);
            
            await prisma.user.create({
                data: {
                    email,
                    passwordHash,
                    name: 'Admin User',
                    role: 'admin',
                    isActive: true
                }
            });
            
            console.log('✅ Admin user created successfully!');
            console.log('📧 Email: admin@test.com');
            console.log('🔑 Password: Admin1111');
        }
        
        process.exit(0);
    } catch (err) {
        console.error('❌ Failed to seed admin user!');
        if (err instanceof Error) {
            console.error('📝 Error Message:', err.message);
            console.error('📝 Error Stack:', err.stack);
        }
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

// Run the seeding
seedAdminUser();
