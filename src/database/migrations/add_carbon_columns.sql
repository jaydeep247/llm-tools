-- Add carbon footprint columns to pages table
ALTER TABLE pages ADD COLUMN IF NOT EXISTS transferred_bytes BIGINT;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS total_transferred_bytes BIGINT;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS co2_mg DECIMAL(10, 4);
ALTER TABLE pages ADD COLUMN IF NOT EXISTS carbon_rating VARCHAR(5);
