-- se ejecuta solo la primera vez (volumen vacío)
CREATE DATABASE identity OWNER app;
GRANT ALL PRIVILEGES ON DATABASE identity TO app;