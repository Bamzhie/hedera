import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs';

const execAsync = promisify(exec);

@Injectable()
export class EnvironmentCheckService implements OnModuleInit {
  private readonly logger = new Logger(EnvironmentCheckService.name);
  private readonly rootPath = path.resolve(__dirname, '..', '..');

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    this.logger.log(
      'Starting environment checks during application initialization...',
    );
    try {
      await this.checkNodeVersion();
      await this.checkNpmVersion();
      await this.checkDependencies();
      await this.checkEnvFile();
      await this.checkShell();
      this.logger.log('Environment checks completed successfully.');
    } catch (error) {
      this.logger.error(`Environment checks failed: ${error.message}`);
      process.exit(1); // Exit the application if critical checks fail
    }
  }

  private async checkGitRemote(): Promise<void> {
    this.logger.log('Checking Git remote...');
    try {
      const { stdout } = await execAsync('git remote -v');
      if (
        !stdout.match(/github\.com\:[a-zA-Z0-9_\-]+\/hello-future-world\.git/)
      ) {
        throw new Error(`Git remote mismatch: ${stdout}`);
      }
      this.logger.log('Git remote check passed.');
    } catch (error) {
      this.logger.error(`Git remote check failed: ${error.message}`);
    }
  }

  private async checkGitVersion(): Promise<void> {
    this.logger.log('Checking Git version...');
    try {
      const { stdout } = await execAsync('git --version');
      const version = stdout.split(' ')[2];
      const [major, minor] = version.split('.').map(Number);

      if (major < 2 || (major === 2 && minor < 37)) {
        throw new Error(`Git version mismatch: ${stdout}`);
      }
      this.logger.log('Git version check passed.');
    } catch (error) {
      this.logger.error(`Git version check failed: ${error.message}`);
    }
  }

  private async checkNodeVersion(): Promise<void> {
    this.logger.log('Checking Node.js version...');
    try {
      const { stdout } = await execAsync('node --version');
      const version = stdout.substring(1).split('.')[0];
      if (Number(version) < 18) {
        throw new Error(`Node.js version mismatch: ${stdout}`);
      }
      this.logger.log('Node.js version check passed.');
    } catch (error) {
      this.logger.error(`Node.js version check failed: ${error.message}`);
    }
  }

  private async checkNpmVersion(): Promise<void> {
    this.logger.log('Checking NPM version...');
    try {
      const { stdout } = await execAsync('npm --version');
      const [major, minor] = stdout.split('.').map(Number);

      if (major < 9 || (major === 9 && minor < 5)) {
        throw new Error(`NPM version mismatch: ${stdout}`);
      }
      this.logger.log('NPM version check passed.');
    } catch (error) {
      this.logger.error(`NPM version check failed: ${error.message}`);
    }
  }

  private async checkDependencies(): Promise<void> {
    this.logger.log('Checking installed dependencies...');
    try {
      const { stdout } = await execAsync('npm ls');
      if (!stdout.match(/@hashgraph\/sdk/)) {
        throw new Error(`Dependency @hashgraph/sdk is missing: ${stdout}`);
      }
      this.logger.log('Dependencies check passed.');
    } catch (error) {
      this.logger.error(`Dependencies check failed: ${error.message}`);
    }
  }

  private async checkEnvFile(): Promise<void> {
    this.logger.log('Checking .env file...');
    try {
      const envPath = path.resolve(this.rootPath, '.env');
      if (!fs.existsSync(envPath)) {
        throw new Error('.env file is missing.');
      }
      this.logger.log('.env file check passed.');
    } catch (error) {
      this.logger.error(`.env file check failed: ${error.message}`);
    }
  }

  private async checkShell(): Promise<void> {
    this.logger.log('Checking shell...');
    try {
      const { stdout } = await execAsync('echo $0');
      if (!stdout) {
        throw new Error('Shell is not available.');
      }
      this.logger.log('Shell check passed.');
    } catch (error) {
      this.logger.error(`Shell check failed: ${error.message}`);
    }
  }
}
