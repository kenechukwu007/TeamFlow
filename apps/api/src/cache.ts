import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createClient } from 'redis';
import { log } from './config';

@Injectable()
export class WorkspaceCache implements OnModuleInit, OnModuleDestroy {
  private client?: ReturnType<typeof createClient>;
  readonly ttl = Number(process.env.CACHE_TTL_SECONDS || 30);
  readonly prefix = process.env.CACHE_PREFIX || 'teamflow:workspace:v1';
  readonly stats = { hits: 0, misses: 0, bypasses: 0 };

  onModuleInit() {
    if (!process.env.REDIS_URL) return;
    if (!Number.isInteger(this.ttl) || this.ttl < 1 || this.ttl > 3600)
      throw new Error('CACHE_TTL_SECONDS must be an integer between 1 and 3600.');
    this.client = createClient({
      url: process.env.REDIS_URL,
      disableOfflineQueue: true,
      commandsQueueMaxLength: 100,
      socket: { connectTimeout: 2000, reconnectStrategy: () => 5000 },
    });
    this.client.on('error', () => log('cache_unavailable'));
    this.client.on('ready', () => log('cache_ready'));
    void this.client.connect().catch(() => log('cache_unavailable'));
  }

  private async bounded<T>(work: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        work,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Cache timeout')), 300);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async remember<T>(revision: string, load: () => Promise<T>): Promise<T> {
    if (!this.client?.isReady) {
      this.stats.bypasses++;
      return load();
    }
    const key = `${this.prefix}:${revision}`;
    try {
      const value = await this.bounded(this.client.get(key));
      if (value !== null) {
        const parsed = JSON.parse(value) as T;
        this.stats.hits++;
        return parsed;
      }
    } catch {
      this.stats.bypasses++;
      return load();
    }
    this.stats.misses++;
    const value = await load();
    try {
      await this.bounded(this.client.set(key, JSON.stringify(value), { EX: this.ttl }));
    } catch {
      /* Cache failure must not fail a database read. */
    }
    return value;
  }

  status() {
    return {
      enabled: Boolean(process.env.REDIS_URL),
      ready: Boolean(this.client?.isReady),
      ...this.stats,
    };
  }
  onModuleDestroy() {
    if (this.client?.isOpen) this.client.destroy();
  }
}
