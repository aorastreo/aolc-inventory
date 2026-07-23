FROM node:20
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source and build
COPY . .
RUN npm run build

# Push DB schema
RUN npx drizzle-kit push --force || true

# Expose and start
EXPOSE 3000
CMD ["node", "--import", "tsx", "api/boot.ts"]
