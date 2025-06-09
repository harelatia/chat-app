# 1. Base image: Node 18
FROM node:18

# 2. Set working directory in container
WORKDIR /app

# 3. Copy dependency manifests & install
COPY package*.json ./
RUN npm install

# 4. Copy source code
COPY . .

# 5. Expose the port React uses
EXPOSE 3000

# 6. Start the development server
CMD ["npm", "start"]
