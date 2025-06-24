# 1. Use a slim Python image
FROM python:3.11-slim

# 2. Set working directory inside the container
WORKDIR /app

# 3. Copy and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install fastapi uvicorn python-socketio

# 4. Copy the application code
COPY app/ ./app/

# 5. Command to run the API server
CMD ["uvicorn", "app.main:app_sio", "--host", "0.0.0.0", "--port", "4000"]

