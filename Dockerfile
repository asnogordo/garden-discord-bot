FROM node:18-slim

# Set working directory
WORKDIR /app

# Install system dependencies required for SQLite and other modules
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    sqlite3 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy package files first (better layer caching)
COPY package*.json yarn.lock ./

# Install dependencies
RUN yarn install --frozen-lockfile

# Copy application code
COPY . .

# Create a volume for persistent data
VOLUME /app/data

# Create a non-root user to run the application
RUN groupadd -r botuser && useradd -r -g botuser botuser
RUN mkdir -p /app/data && chown -R botuser:botuser /app

# Switch to non-root user for security
USER botuser

# Set environment variable to specify database location
ENV SQLITE_DB_PATH=/app/data/garden.db

# Health check to ensure container is running properly
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
  CMD node healthcheck.js

# Command to run the application
CMD ["yarn", "start"]