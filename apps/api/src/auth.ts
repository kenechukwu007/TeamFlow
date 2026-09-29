import {
  Body,
  CanActivate,
  ConflictException,
  Controller,
  ExecutionContext,
  Get,
  HttpCode,
  HttpException,
  Inject,
  Injectable,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { randomBytes, randomUUID } from 'node:crypto';
import { Database } from './database';
import { LoginDto, RegisterDto } from './dto';
import { hashPassword, tokenHash, verifyPassword } from './password';

export type User = { id: string; name: string; email: string };
export type AuthRequest = Request & { user: User };
const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: process.env.COOKIE_SECURE === 'true',
  path: '/api',
});
function sessionToken(req: Request): string {
  return (
    req.headers.cookie
      ?.split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('teamflow_session='))
      ?.slice(17) || ''
  );
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(Database) private db: Database) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const user = await this.db.get<User>(
      'SELECT u.id,u.name,u.email FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>$2',
      tokenHash(sessionToken(req)),
      Date.now(),
    );
    if (!user) throw new UnauthorizedException('Please sign in to continue.');
    req.user = user;
    return true;
  }
}

@Controller('auth')
export class AuthController {
  private attempts = new Map<string, { count: number; until: number }>();
  constructor(@Inject(Database) private db: Database) {}
  private throttle(req: Request) {
    const now = Date.now();
    for (const [key, value] of this.attempts) if (value.until < now) this.attempts.delete(key);
    const key = req.ip || 'local';
    const entry = this.attempts.get(key) || { count: 0, until: now + 60_000 };
    if (++entry.count > 20)
      throw new HttpException('Too many attempts. Try again in a minute.', 429);
    this.attempts.set(key, entry);
  }
  private async session(user: User, res: Response) {
    const token = randomBytes(32).toString('hex');
    await this.db.run('DELETE FROM sessions WHERE expires_at<=$1', Date.now());
    await this.db.run(
      'INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)',
      tokenHash(token),
      user.id,
      Date.now() + 7 * 86400_000,
    );
    res.cookie('teamflow_session', token, { ...cookieOptions(), maxAge: 7 * 86400_000 });
    return user;
  }
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.throttle(req);
    const user = await this.db.get<User & { password_hash: string }>(
      'SELECT * FROM users WHERE email=$1',
      body.email.toLowerCase(),
    );
    if (!user || !(await verifyPassword(body.password, user.password_hash)))
      throw new UnauthorizedException('Email or password is incorrect.');
    return this.session({ id: user.id, name: user.name, email: user.email }, res);
  }
  @Post('register')
  async register(
    @Body() body: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.throttle(req);
    const email = body.email.toLowerCase();
    if (await this.db.get('SELECT id FROM users WHERE email=$1', email))
      throw new ConflictException('An account already exists with this email.');
    const hash = await hashPassword(body.password);
    const user = { id: randomUUID(), name: body.name, email };
    try {
      await this.db.run(
        'INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)',
        user.id,
        user.name,
        email,
        hash,
      );
    } catch (error) {
      if (await this.db.get('SELECT id FROM users WHERE email=$1', email))
        throw new ConflictException('An account already exists with this email.');
      throw error;
    }
    return this.session(user, res);
  }
  @Get('me')
  @UseGuards(AuthGuard)
  me(@Req() req: AuthRequest) {
    return req.user;
  }
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.db.run('DELETE FROM sessions WHERE token_hash=$1', tokenHash(sessionToken(req)));
    res.clearCookie('teamflow_session', cookieOptions());
  }
}
