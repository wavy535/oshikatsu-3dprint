FROM postgres:17-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-17-pgtap \
    && rm -rf /var/lib/apt/lists/*
