#!/bin/sh
set -e

echo "[START] Installing dependencies..."
npm install --include=dev

echo "[START] Pushing database schema..."
npx drizzle-kit push --force || true

echo "[START] Starting server..."
exec npx tsx api/boot.ts
