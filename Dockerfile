FROM node:20
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --include=dev

# Install tsx globally as fallback
RUN npm install -g tsx

# Copy source and build
COPY . .
RUN npm run build

# Expose port
EXPOSE 3000

# Start: install deps (safety net), push DB schema, start server
CMD npm install 2>/dev/null && npx drizzle-kit push --force 2>/dev/null || true && npx tsx api/boot.ts
