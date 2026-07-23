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

# Start with robust startup script
CMD ["sh", "./start.sh"]
