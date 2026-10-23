FROM oven/bun:1.4

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .

ENV BENCH_REGION=docker
VOLUME ["/app/data", "/app/results"]

ENTRYPOINT ["bun", "run", "src/cli.ts"]
CMD ["run"]
