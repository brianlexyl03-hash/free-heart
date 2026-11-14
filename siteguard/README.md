# SiteGuard inside Free Heart

This integration adds a SiteGuard operations entry point at `/siteguard/` and a same-origin API proxy at `/siteguard-api/*`. The SiteGuard API key is kept server-side in `SITEGUARD_API_KEY`; operators authenticate through the existing Free Heart `ADMIN_PASSWORD`.

Configure these Free Heart server environment variables:

- `SITEGUARD_API_URL`: HTTPS base URL of the SiteGuard FastAPI service.
- `SITEGUARD_API_KEY`: the matching SiteGuard `API_KEY` secret.

The supplied SiteGuard package remains a separate FastAPI service because its Kubernetes, SQLAlchemy and Prometheus dependencies are Python-specific. Deploy that service from the supplied SiteGuard build package, set a persistent PostgreSQL `DATABASE_URL`, replace the sample API and telemetry keys, and choose `PROVISIONER=kubernetes` only after a cluster and scoped RBAC are configured. The mock provisioner is not live scaling. Local quarantine records do not block production traffic unless an ingress or edge firewall consumes the block list.

The Free Heart route is disabled with a clear service error until `SITEGUARD_API_URL` and `SITEGUARD_API_KEY` are configured. No SiteGuard credentials are exposed in the PWA.
