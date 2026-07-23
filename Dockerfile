FROM node:20
WORKDIR /app

# Copy everything
COPY . .

# Install all dependencies
RUN npm install --include=dev

# Build frontend (generates dist/public/)
RUN npm run build

# Expose port
EXPOSE 3000

# Push DB schema and start
CMD npx drizzle-kit push --force 2>/dev/null || true && node server.js
