import 'reflect-metadata';
import { Module, ValidationPipe } from '@nestjs/common';
import { INestApplication } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { Database } from './database';
import { AuthController, AuthGuard } from './auth';
import { WorkspaceController } from './workspace';

@Module({ controllers: [AuthController, WorkspaceController], providers: [Database, AuthGuard] })
export class AppModule {}

export function configure(app: INestApplication) {
  app.setGlobalPrefix('api');
  app.use(helmet());
  // JSON-only mutations and a custom same-origin header prevent cross-site form submissions.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      req.headers['x-teamflow-client'] !== 'web'
    ) {
      res.status(403).json({ message: 'Missing application request header.' });
      return;
    }
    next();
  });
  app.useGlobalPipes(
    new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
  );
}
