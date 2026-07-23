FROM node:20
WORKDIR /app

# Copy everything
COPY . .

# Install ALL dependencies (including devDependencies for tsx, vite, drizzle-kit)
RUN npm install --include=dev

# Build frontend
RUN npm run build

# Expose port
EXPOSE 3000

# Push DB schema and start with tsx
CMD npx drizzle-kit push --force 2>/dev/null || true && node --import tsx api/boot.ts
