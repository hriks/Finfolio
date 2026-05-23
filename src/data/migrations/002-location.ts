export const up_002_location = `
ALTER TABLE expenses ADD COLUMN location_lat REAL;
ALTER TABLE expenses ADD COLUMN location_lon REAL;
ALTER TABLE expenses ADD COLUMN location_name TEXT;
`;
