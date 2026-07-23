FROM node:20
WORKDIR /app

# Install ALL dependencies (including devDependencies for build tools)
COPY package*.json ./
RUN npm install --include=dev

# Copy source and build frontend
COPY . .
RUN npm run build

# Expose port
EXPOSE 3000

# Start: push DB schema then start server
CMD npx drizzle-kit push --force 2>/dev/null || true && node --import tsx api/boot.ts
