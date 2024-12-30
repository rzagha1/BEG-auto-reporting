# ---- Base Stage ----
    FROM node:18-slim AS base
    WORKDIR /usr/src/app
    COPY package*.json ./
    
    # ---- Development Stage ----
    FROM base AS development
    ENV NODE_ENV=development
    # Install dependencies
    RUN npm install
    # Install nodemon globally
    RUN npm install -g nodemon
    COPY . .
    CMD ["nodemon", "--legacy-watch", "app.js"]
    
    # ---- Production Dependencies Stage ----
    FROM base AS prod-deps
    ENV NODE_ENV=production
    RUN npm ci --only=production
    
    # ---- Production Build Stage ----
    FROM base AS production
    ENV NODE_ENV=production
    WORKDIR /usr/src/app
    
    # Copy production dependencies
    COPY --from=prod-deps /usr/src/app/node_modules ./node_modules
    COPY package*.json ./
    
    # Copy application code
    COPY controllers/ ./controllers/
    COPY routes/ ./routes/
    COPY services/ ./services/
    COPY utils/ ./utils/
    COPY views/ ./views/
    COPY app.js .
    COPY config.js .
    COPY directions.txt .
    
    # Set user to non-root
    USER node
    
    # Start the app
    CMD ["node", "app.js"]