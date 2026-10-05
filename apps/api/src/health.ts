import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { Database } from './database';

@Controller('health')
export class HealthController {
  constructor(@Inject(Database) private db: Database) {}

  @Get()
  async check() {
    try {
      await this.db.get('SELECT 1');
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException('Service unavailable');
    }
  }
}
