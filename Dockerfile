FROM node:20
WORKDIR /app

# Copy prebuilt backend bundle + frontend + scripts
COPY server.js ./
COPY package*.json ./
COPY scripts/ ./scripts/
COPY dist/public/ ./dist/public/
COPY drizzle.config.ts ./
COPY db/ ./db/

# Install only drizzle-kit for DB schema push
RUN npm install --include=dev

# Expose port
EXPOSE 3000

# Push DB schema and start server
CMD npx drizzle-kit push --force 2>/dev/null || true && node server.js
