FROM node:18

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Build the production version
RUN npm run build

# Install a simple static file server
RUN npm install -g serve

EXPOSE 5173

# Serve the built files from dist/
CMD ["serve", "-s", "dist", "-l", "5173"]
