import { writeFileSync } from 'fs';
import type { XUser } from './types.js';

const TSV_HEADERS = ['username', 'displayName', 'bio', 'followersCount', 'followingCount', 'profileUrl'];

export function formatUserAsTsv(user: XUser): string {
  const values = [
    user.username,
    escapeTsvValue(user.displayName),
    escapeTsvValue(user.bio),
    user.followersCount.toString(),
    user.followingCount.toString(),
    user.profileUrl,
  ];
  return values.join('\t');
}

function escapeTsvValue(value: string): string {
  // Replace tabs and newlines with spaces
  return value.replace(/[\t\n\r]/g, ' ').trim();
}

export function getTsvHeader(): string {
  return TSV_HEADERS.join('\t');
}

export class TsvExporter {
  private users: XUser[] = [];
  private outputPath?: string;

  constructor(outputPath?: string) {
    this.outputPath = outputPath;
  }

  addUser(user: XUser): void {
    this.users.push(user);

    // Stream to stdout if no output file
    if (!this.outputPath) {
      if (this.users.length === 1) {
        console.log(getTsvHeader());
      }
      console.log(formatUserAsTsv(user));
    }
  }

  flush(): void {
    if (this.outputPath && this.users.length > 0) {
      const lines = [getTsvHeader(), ...this.users.map(formatUserAsTsv)];
      writeFileSync(this.outputPath, lines.join('\n') + '\n', 'utf-8');
      console.error(`Wrote ${this.users.length} users to ${this.outputPath}`);
    }
  }

  get count(): number {
    return this.users.length;
  }
}
