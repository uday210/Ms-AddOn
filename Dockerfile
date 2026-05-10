FROM node:22

WORKDIR /app

# Build the Outlook add-in static files
COPY outlook-addin/package*.json ./outlook-addin/
RUN cd outlook-addin && npm install --cache /tmp/npm-cache

COPY outlook-addin/ ./outlook-addin/
RUN cd outlook-addin && BACKEND_URL="" npm run build

# Install and compile the backend
COPY backend/package*.json ./backend/
RUN cd backend && npm install --cache /tmp/npm-cache

COPY backend/ ./backend/
RUN cd backend && npm run build

EXPOSE 3001

CMD ["node", "backend/dist/server.js"]
