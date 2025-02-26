FROM node:20-slim

# Set working directory
WORKDIR /app

# Install system dependencies with retry logic and DNS fallbacks
RUN echo "nameserver 8.8.8.8" > /etc/resolv.conf && \
    echo "nameserver 1.1.1.1" >> /etc/resolv.conf && \
    (apt-get update || (sleep 5 && apt-get update) || (sleep 10 && apt-get update)) && \
    apt-get install -y --no-install-recommends \
      python3 \
      make \
      g++ \
      sqlite3 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy package files first
COPY package*.json yarn.lock ./

# Install dependencies
RUN yarn install --frozen-lockfile

# Copy application code
COPY . .

# Create volume and setup permissions
VOLUME /app/data
RUN mkdir -p /app/data && \
    groupadd -r botuser && \
    useradd -r -g botuser botuser && \
    chown -R botuser:botuser /app

# Switch to non-root user
USER botuser

# Set environment variable for database
ENV SQLITE_DB_PATH=/app/data/garden.db

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
  CMD node healthcheck.js || exit 1

# Command to run the application
CMD ["yarn", "start"]