FROM python:3.11-slim

WORKDIR /app

# 1) Copy in only requirements
COPY requirements.txt /app/requirements.txt

# 2) Install all Python deps
RUN pip install --no-cache-dir -r /app/requirements.txt

# 3) Copy in code
COPY app/ /app/app/

# 4) Launch
CMD ["uvicorn", "app.main:app_sio", "--host", "0.0.0.0", "--port", "4000"]
