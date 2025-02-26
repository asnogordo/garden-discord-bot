FROM node:20

WORKDIR /app

# Copy package files first (better layer caching)
COPY package*.json yarn.lock ./

# Install dependencies
RUN yarn install --frozen-lockfile

# Copy application code
COPY . .

# Create a volume for persistent data
VOLUME /app/data

# Set environment variable to specify database location
ENV SQLITE_DB_PATH=/app/data/garden.db

# Command to run the application
CMD ["yarn", "start"]