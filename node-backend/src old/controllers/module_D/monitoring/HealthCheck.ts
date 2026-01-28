import * as os from 'os';

export interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  activeCrawls: number;
  queueSize: number;
  lastCrawlTime?: string;
  errors: {
    count: number;
    lastError?: string;
    lastErrorTime?: string;
  };
}

export class HealthChecker {
  private startTime: number;
  private errorCount: number = 0;
  private lastError: string | null = null;
  private lastErrorTime: string | null = null;
  private activeCrawls: number = 0;
  private queueSize: number = 0;
  private lastCrawlTime: string | null = null;
  private readonly maxMemoryMB: number;

  constructor() {
    this.startTime = Date.now();
    // Get max memory from environment or use default (1GB for containers)
    // If NODE_OPTIONS has --max-old-space-size, use that, otherwise default to 1GB
    const nodeOptions = process.env.NODE_OPTIONS || '';
    const maxOldSpaceMatch = nodeOptions.match(/--max-old-space-size=(\d+)/);
    this.maxMemoryMB = maxOldSpaceMatch 
      ? parseInt(maxOldSpaceMatch[1], 10) 
      : parseInt(process.env.MAX_MEMORY_MB || '1024', 10);
  }

  recordError(error: string): void {
    this.errorCount++;
    this.lastError = error;
    this.lastErrorTime = new Date().toISOString();
  }

  setActiveCrawls(count: number): void {
    this.activeCrawls = count;
  }

  setQueueSize(size: number): void {
    this.queueSize = size;
  }

  recordCrawlStart(): void {
    this.lastCrawlTime = new Date().toISOString();
  }

  getHealthStatus(): HealthStatus {
    const memoryUsage = process.memoryUsage();
    // Use RSS (Resident Set Size) - actual memory used by the process
    const usedMemory = memoryUsage.rss;
    // For container environments, use configured max memory or default
    // In Docker, os.totalmem() might return host memory, so we use configured limit
    const systemTotalMemory = os.totalmem();
    const configuredMaxMemory = this.maxMemoryMB * 1024 * 1024;
    // Use the smaller of system memory or configured max, but prefer configured if reasonable
    // If system memory is very large (>4GB), likely we're in a container without limits, use configured
    const maxMemoryBytes = systemTotalMemory > 4 * 1024 * 1024 * 1024 
      ? configuredMaxMemory 
      : Math.min(systemTotalMemory, configuredMaxMemory);
    const memoryPercentage = (usedMemory / maxMemoryBytes) * 100;

    let status: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';
    
    // Determine health status based on various factors
    // Use more reasonable thresholds: 95% for unhealthy, 85% for degraded
    if (this.errorCount > 10 || memoryPercentage > 95) {
      status = 'unhealthy';
    } else if (this.errorCount > 5 || memoryPercentage > 85 || this.queueSize > 1000) {
      status = 'degraded';
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      memory: {
        used: usedMemory,
        total: maxMemoryBytes,
        percentage: Math.round(memoryPercentage * 100) / 100
      },
      activeCrawls: this.activeCrawls,
      queueSize: this.queueSize,
      lastCrawlTime: this.lastCrawlTime || undefined,
      errors: {
        count: this.errorCount,
        lastError: this.lastError || undefined,
        lastErrorTime: this.lastErrorTime || undefined
      }
    };
  }

  isHealthy(): boolean {
    const status = this.getHealthStatus();
    return status.status === 'healthy';
  }
}
