# Scaling and Operations

## Capacity Target

Designed for >50,000 concurrent users by scaling stateless API and worker replicas horizontally.

## Deployment Topology

1. API tier:
   - stateless replicas behind load balancer
   - queue producer only
2. Worker tier:
   - one or more replicas
   - queue consumer enabled
3. Data tier:
   - Postgres with pooled connections
   - Redis for queue transport

## Horizontal Scaling Rules

- Scale API based on request latency and CPU.
- Scale workers based on queue lag, retry backlog, and scheduled wait volume.
- Keep API and workers in separate autoscaling groups.

## Critical Runtime Metrics

- queue backlog
- queue wait time
- run success/failure/dead-letter rate
- retry scheduling and exhaustion rate
- communication write/read throughput and message lag (if `communication` is enabled)
- file storage item/list latency, share lookup latency, and blob metadata write throughput (if `file-storage` is enabled)
- DB connection utilization
- Redis connectivity and reconnection events

## Resource Tuning

Tune with env vars:

- DB pool: `DATABASE_POOL_*`
- Redis socket/client: `REDIS_*`
- BullMQ transport: `INTEGRATOR_BULLMQ_*`
- Scale controls: `SCALE_*`

## Failure Domain Guidance

- API node restart should not lose workflow state.
- Worker restart should not lose durable retries/waits.
- Queue fallback to legacy mode should be treated as degraded mode alert.

## Operational Safety Notes

- Never depend on in-memory state for business-critical workflow continuity.
- Keep all retry/wait/audit transitions persisted.
- Prefer idempotent adapters and use generated idempotency keys.
