import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';
import * as path from 'path';
import { config } from 'dotenv';

config();

const usePostgres = process.env.DB_TYPE === 'postgres';

const options: DataSourceOptions = usePostgres
  ? {
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USERNAME || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'doorphone',
      entities: [path.join(__dirname, '**/*.entity.{ts,js}')],
      migrations: [path.join(__dirname, 'migrations/*.{ts,js}')],
      synchronize: false,
    }
  : {
      type: 'better-sqlite3',
      database: process.env.DB_SQLITE_PATH || path.join(process.cwd(), 'data', 'doorphone.sqlite'),
      entities: [path.join(__dirname, '**/*.entity.{ts,js}')],
      migrations: [path.join(__dirname, 'migrations/*.{ts,js}')],
      synchronize: false,
    };

export const AppDataSource = new DataSource(options);
