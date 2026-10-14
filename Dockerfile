FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install dependencies first for better caching
COPY package*.json ./
RUN npm ci --only=production

# Copy application source code
COPY . .

# Expose default port
EXPOSE 3000

# Environment defaults
ENV PORT=3000
ENV NODE_ENV=production
ENV DISABLE_TUNNEL=true

# Start command
CMD ["node", "server.js"]
