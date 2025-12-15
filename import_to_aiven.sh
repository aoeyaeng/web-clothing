#!/bin/bash

# Load environment variables from .env file
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

echo "Starting import to Aiven Cloud..."
echo "Host: $DB_HOST"
echo "Database: $DB_NAME"

# Check if variables are set
if [ -z "$DB_HOST" ] || [ -z "$DB_PASSWORD" ]; then
  echo "Error: DB_HOST or DB_PASSWORD not set in .env"
  exit 1
fi

/Applications/XAMPP/xamppfiles/bin/mysql -h "$DB_HOST" \
  -P "$DB_PORT" \
  -u "$DB_USER" \
  "-p$DB_PASSWORD" \
  --ssl \
  "$DB_NAME" < backup.sql

if [ $? -eq 0 ]; then
    echo "✅ Import successful!"
else
    echo "❌ Import failed. Please check credentials or network connection."
fi
