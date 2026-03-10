# Multi-tenant migration

Run this **only on an existing database** that still has the `houses` table and `devices.house_id`.

- **Fresh install:** do nothing; TypeORM `synchronize` will create the new schema.
- **Existing DB:** run the SQL script, then start the app.

## How to run

```bash
# From project root, with psql in PATH:
psql -h localhost -U postgres -d doorphone -f backend/scripts/migrate-to-multitenant.sql
```

Or in pgAdmin: open `migrate-to-multitenant.sql` and execute.

After migration, the app expects `devices.building_id` and tables `organizations`, `residential_complexes`, `buildings`, `apartments`, `users`, `user_apartments`, `event_logs`.
