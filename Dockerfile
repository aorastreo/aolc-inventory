FROM node:20
WORKDIR /app

# Install ALL dependencies (including devDependencies for tsx, drizzle-kit, vite)
COPY package*.json ./
RUN npm install --include=dev

# Copy source and build frontend
COPY . .
RUN npm run build

# Push DB schema
RUN npx drizzle-kit push --force || true

# Expose and start with tsx
EXPOSE 3000
CMD ["node", "--import", "tsx", "api/boot.ts"]
