FROM node:18-alpine

WORKDIR /app

# Copy all project files
COPY . .

# Expose the static file server port
EXPOSE 8080

# Use a simple Node.js static file server (no dependencies needed)
# The app is a pure frontend SPA served as static files
CMD ["node", "server.js"]
