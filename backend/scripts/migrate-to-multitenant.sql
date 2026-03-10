-- Multi-tenant migration: houses -> organizations/complexes/buildings, device.house_id -> building_id
-- Run this on existing DB before deploying the new code. For fresh install, TypeORM synchronize will create schema.

-- 1. Create new tables (order matters for FKs)
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  subscription_plan VARCHAR(50) DEFAULT 'basic',
  max_complexes INT DEFAULT 10,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS residential_complexes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name VARCHAR(255) NOT NULL,
  address VARCHAR(255),
  timezone VARCHAR(50),
  settings JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS buildings (
  id SERIAL PRIMARY KEY,
  complex_id UUID NOT NULL REFERENCES residential_complexes(id),
  name VARCHAR(100) NOT NULL,
  address VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS apartments (
  id SERIAL PRIMARY KEY,
  building_id INT NOT NULL REFERENCES buildings(id),
  number VARCHAR(20) NOT NULL,
  floor INT
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone VARCHAR(20) UNIQUE,
  email VARCHAR(255) UNIQUE,
  name VARCHAR(255),
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,
  organization_id UUID REFERENCES organizations(id),
  complex_id UUID REFERENCES residential_complexes(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_apartments (
  user_id UUID NOT NULL REFERENCES users(id),
  apartment_id INT NOT NULL REFERENCES apartments(id),
  role VARCHAR(20) DEFAULT 'resident',
  access_level INT DEFAULT 1,
  valid_until TIMESTAMP,
  PRIMARY KEY (user_id, apartment_id)
);

CREATE TABLE IF NOT EXISTS event_logs (
  id SERIAL PRIMARY KEY,
  device_id INT NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  data JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_event_logs_device_created ON event_logs(device_id, created_at DESC);

-- 2. Migrate houses -> buildings (only if houses table exists)
DO $$
DECLARE
  def_org_id UUID;
  def_complex_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'houses') THEN
    INSERT INTO organizations (id, name, subscription_plan, max_complexes)
    VALUES (gen_random_uuid(), 'Default Organization', 'basic', 100)
    RETURNING id INTO def_org_id;

    INSERT INTO residential_complexes (id, organization_id, name, address)
    VALUES (gen_random_uuid(), def_org_id, 'Default Complex', NULL)
    RETURNING id INTO def_complex_id;

    INSERT INTO buildings (id, complex_id, name, address)
    SELECT id, def_complex_id, name, COALESCE(address, '') FROM houses;

    PERFORM setval('buildings_id_seq', (SELECT COALESCE(MAX(id), 1) FROM buildings));

    ALTER TABLE devices ADD COLUMN IF NOT EXISTS building_id INT;
    UPDATE devices SET building_id = house_id WHERE building_id IS NULL AND house_id IS NOT NULL;
    ALTER TABLE devices DROP COLUMN IF EXISTS house_id;
    ALTER TABLE devices ALTER COLUMN building_id SET NOT NULL;
    ALTER TABLE devices ADD CONSTRAINT FK_devices_building_id FOREIGN KEY (building_id) REFERENCES buildings(id);

    DROP TABLE IF EXISTS houses;
  END IF;
END $$;
