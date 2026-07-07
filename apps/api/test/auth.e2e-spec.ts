import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Protected route chain (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let userId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);

    const user = await prisma.user.upsert({
      where: { googleId: 'e2e-google-id' },
      update: {},
      create: {
        googleId: 'e2e-google-id',
        email: 'e2e@example.com',
        name: 'E2E Test User',
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { googleId: 'e2e-google-id' } });
    await app.close();
  });

  it('rejects GET /users/me with no token', async () => {
    await request(app.getHttpServer()).get('/users/me').expect(401);
  });

  it('rejects GET /users/me with a garbage token', async () => {
    await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(401);
  });

  it('allows GET /users/me with a valid access token and returns the right user', async () => {
    const token = jwt.sign(
      { sub: userId, email: 'e2e@example.com', role: 'user' },
      { secret: process.env.JWT_ACCESS_SECRET, expiresIn: '15m' },
    );

    const res = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toMatchObject({
      id: userId,
      email: 'e2e@example.com',
      role: 'user',
    });
  });
});
