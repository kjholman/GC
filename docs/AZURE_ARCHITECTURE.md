# GAIA on Azure: technical architecture

Target hosting design for GAIA in Genesys's Azure tenant. Everything runs in one resource group in Canada Central behind private endpoints. Claude is reached through Microsoft Foundry (Hosted on Azure, US Data Zone). Staff sign in exactly as they do today, with an emailed one-time code.

Status: proposed target. The recommended first step is in `docs/AZURE_SETUP.md`: the same hosting, with GAIA calling Anthropic's API directly and no code changes. The Foundry code changes this design depends on are listed under "Claude through Microsoft Foundry" and are switched by `AI_PROVIDER`.

## Network topology

```
Internet ── HTTPS ──> app-gaia-prod (App Service, public endpoint, staging slot)
GitHub Actions ── OIDC ──> crgaiaprod (registry) ──> app-gaia-prod

rg-gaia-prod-cc (Canada Central)
└─ vnet-gaia-prod
   ├─ snet-app   App Service VNet integration; all outbound traffic routed here
   ├─ snet-psql  PostgreSQL 16 (psql-gaia-prod), VNet-injected, no public access
   └─ snet-pe    private endpoints: Key Vault, Foundry (later Blob Storage, registry)
   NAT gateway (one outbound IP) ──> email (ACS, SMTP 587), company websites (logo lookup)

snet-pe ── private link ──> aif-gaia-prod (Foundry): Claude Opus 5.5 and Sonnet 5.5, inference in the US
```

## Resource inventory

One resource group, `rg-gaia-prod-cc`, in Canada Central. Names follow Microsoft's recommended abbreviations.

| Resource | Proposed name | SKU and configuration | Purpose |
|---|---|---|---|
| App Service plan | `asp-gaia-prod` | Linux, Premium v3 P1v3 (2 vCPU, 8 GB) | Compute |
| Web App for Containers | `app-gaia-prod` | 1 instance, Always On, HTTPS only, TLS 1.2+, FTP off, system-assigned managed identity, VNet integration with route-all, health check `/login`, `staging` slot | Pages, sign-in, uploads, background analyses |
| Container Registry | `crgaiaprod` | Basic (Premium for a private endpoint); admin user off | GAIA image |
| PostgreSQL Flexible Server | `psql-gaia-prod` | v16; Burstable B2s (pilot) or General Purpose D2ds_v5 (production); 128 GB auto-grow; VNet-injected; TLS required; backups 7 to 35 days; geo-redundant backup decided at creation | All application data |
| Key Vault | `kv-gaia-prod` | Standard, RBAC, soft delete and purge protection, public access off | Secrets |
| Microsoft Foundry | `aif-gaia-prod` | Deployments `claude-opus-5-5`, `claude-sonnet-5-5`, Hosted on Azure, Data Zone (US); key access off; public access off | Claude |
| Communication Services + Email | `acs-gaia-prod`, `ecs-gaia-prod` | Verified subdomain with SPF and DKIM; SMTP | Sign-in codes (or a Microsoft 365 mailbox over SMTP) |
| Virtual network | `vnet-gaia-prod` | Three subnets | Private connectivity |
| NAT gateway + public IP | `ng-gaia-prod`, `pip-ng-gaia-prod` | Standard | Fixed outbound address |
| Private DNS zones | one per private-endpoint service | Linked to the VNet | Name resolution |
| Log Analytics | `log-gaia-prod` | 90-day retention | Logs |
| Application Insights | `appi-gaia-prod` | Workspace-based | Telemetry, alerts |
| Storage account (phase 2) | `stgaiaprod` | StorageV2, public and shared-key access off | Uploaded files out of the database |

Once per subscription: accept the Azure Marketplace terms for Claude on the first Foundry deployment; register the App Service, PostgreSQL, Cognitive Services and Communication Services providers.

## Network design

| Subnet | Example range | Delegation | Holds |
|---|---|---|---|
| `snet-app` | `10.40.10.0/26` | `Microsoft.Web/serverFarms` | App Service VNet integration |
| `snet-psql` | `10.40.10.64/28` | `Microsoft.DBforPostgreSQL/flexibleServers` | PostgreSQL |
| `snet-pe` | `10.40.10.96/27` | none | Private endpoints |

Private DNS zones (confirm against Microsoft's current private link DNS table): `gaia.private.postgres.database.azure.com`, `privatelink.vaultcore.azure.net`, `privatelink.cognitiveservices.azure.com`, `privatelink.services.ai.azure.com`, `privatelink.openai.azure.com`, and later `privatelink.blob.core.windows.net`, `privatelink.azurecr.io`.

- Inbound: custom domain (for example `gaia.genesyscapital.com`) with an App Service managed certificate. Either App Service access restrictions (office and VPN addresses), or Front Door Premium with a web application firewall over Private Link and the app's public access off. The staging slot is restricted to IT and the developer.
- Outbound: route-all through the VNet and the NAT gateway. Private: PostgreSQL, Key Vault, Foundry. Public: email (SMTP 587), the logo lookup (443, can be switched off), and image pulls from a Basic registry. Claude's web research runs inside Foundry, not from GAIA's network.
- NSGs on `snet-pe` and `snet-psql` allow inbound only from `snet-app`.

## Identity and access

Staff sign-in is unchanged: approved `@genesyscapital.com` users receive a six-digit code by email. Azure identities are used only between services and for administration.

| Identity | Role | Scope |
|---|---|---|
| App managed identity | Foundry User (or Cognitive Services User) | `aif-gaia-prod` |
| App managed identity | Key Vault Secrets User | `kv-gaia-prod` |
| App managed identity | AcrPull | `crgaiaprod` |
| App managed identity (phase 2) | Storage Blob Data Contributor | `stgaiaprod` |
| `id-gaia-deploy` (user-assigned, federated to `kjholman/gc`, branch `main`) | AcrPush; Website Contributor | registry; web app |
| IT administrators | Owner or Contributor through Privileged Identity Management | resource group |
| Developer | Reader, Log Analytics Reader; no secrets or database access | resource group |

The database uses password authentication over TLS with the password only in Key Vault (Entra tokens for PostgreSQL expire hourly and GAIA's database library uses a fixed connection string). Foundry key access, the registry admin user and storage shared keys are all off.

## Application configuration

Secrets are Key Vault references, e.g. `@Microsoft.KeyVault(SecretUri=https://kv-gaia-prod.vault.azure.net/secrets/auth-secret/)`.

| Setting | Value | Source |
|---|---|---|
| `DATABASE_URL` | `postgresql://gaia_app:…@psql-gaia-prod.postgres.database.azure.com:5432/genesys_analyst?sslmode=require` | Key Vault |
| `AUTH_SECRET` | 48 random bytes, base64 | Key Vault |
| `APP_URL` | `https://gaia.genesyscapital.com` | setting |
| `ALLOWED_EMAIL_DOMAINS` | `genesyscapital.com` | setting |
| `SEED_ADMIN_EMAILS` | administrators | setting |
| `ENABLE_ADMIN_BYPASS` | `false` | setting |
| `SESSION_IDLE_HOURS`, `SESSION_TTL_HOURS` | `6`, `168` | settings |
| `SMTP_HOST`, `SMTP_PORT` | `smtp.azurecomm.net`, `587` (or `smtp.office365.com`, `587`) | settings |
| `SMTP_USER`, `SMTP_PASS` | Communication Services SMTP credentials (or the mailbox) | Key Vault |
| `EMAIL_FROM` | `GAIA <gaia@mail.genesyscapital.com>` | setting |
| `AI_PROVIDER` (new) | `foundry` (`anthropic` = today) | setting |
| `ANTHROPIC_FOUNDRY_RESOURCE` (new) | `aif-gaia-prod` | setting |
| `ANTHROPIC_MODEL`, `ANTHROPIC_FAST_MODEL` | deployment names `claude-opus-5-5`, `claude-sonnet-5-5` | settings |
| `ANALYSIS_EFFORT`, `ENABLE_WEB_RESEARCH` | `medium`, `true` | settings |
| `ANTHROPIC_API_KEY` | not set (managed identity) | |
| `WEBSITES_PORT` | `3000` | setting |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | from `appi-gaia-prod` | setting |

The image is the existing `Dockerfile`: `prisma migrate deploy`, then `next start` on port 3000.

## Claude through Microsoft Foundry

- Endpoint `https://aif-gaia-prod.services.ai.azure.com/anthropic/v1/messages` through the private endpoint; Anthropic's Messages API format.
- Auth: Entra token for `https://ai.azure.com/.default` from the managed identity (`DefaultAzureCredential`); client `@anthropic-ai/foundry-sdk`.
- Deployments: Opus 5.5 (memo, correction, fact-check), Sonnet 5.5 (reading, research, competitor table, knowledge extraction); Hosted on Azure, Data Zone (US).
- Quota: tokens-per-minute for both deployments; five research passes and the competitor sweep run in parallel on Sonnet.
- Monitoring: Azure Monitor metrics. Foundry does not return Anthropic's rate-limit headers; the client change will log `request-id` and `apim-request-id`.
- Billing: Claude Consumption Units on the Azure invoice.

| GAIA uses today | Hosted on Azure | Adaptation |
|---|---|---|
| Standard client, API key | Foundry endpoint, Entra token | Foundry client with managed identity |
| Server-side refusal fallback | Not offered on Foundry | Retry a refused request once on the other deployment |
| `web_search_20260209`, `web_fetch_20260209` | Only `web_search_20250305`, `web_fetch_20250910` | Use the basic versions; search caps unchanged |
| Files API for large uploads | Not offered | Send files beyond the request size limit as extracted text |
| Cost table, credit errors | Azure billing, throttling | Foundry rates; throttling as retry-later |

What GAIA sends is unchanged by the move (see `docs/AI_ANALYST_DESIGN.md`, "Context management").

## Data flows

1. Sign-in: name chosen; approved user checked; hashed code stored (10 minutes); code sent through ACS over SMTP/TLS via the NAT gateway; on entry, a hashed session token is stored and the sign-in logged.
2. Upload: files over HTTPS (500 MB per file); text extracted; file and text stored in PostgreSQL over the private network (Blob Storage in phase 2); upload logged; analysis queued in-process.
3. Analysis: firm context tailored to the deal read from PostgreSQL; Claude called through the Foundry private endpoint (profile, five research passes and competitor sweep with web search inside Foundry, memo, fact-check, correction if needed); progress checkpointed; memo, evidence, verification and token usage saved.
4. Download: session checked, content streamed from PostgreSQL, download logged.

## Security controls

| Control | Implementation |
|---|---|
| Staff authentication | Emailed one-time code to approved Genesys addresses; hashed, 10-minute expiry, 5 attempts, rate-limited; bypass off |
| Sessions | Random token in an HttpOnly, Secure, SameSite=Lax cookie, stored hashed; 6 hours idle, 7 days max |
| Authorisation | Server-side session and role check on every page, download and action |
| In transit | TLS 1.2+ and HSTS for users; TLS to PostgreSQL, Key Vault, Foundry, email |
| At rest | Azure service encryption (AES-256) for PostgreSQL, backups, Key Vault, Blob Storage; customer-managed keys optional |
| Network | Private endpoints and VNet-injected database, public access off, NSGs, inbound restrictions or Front Door WAF |
| Secrets | Key Vault references; managed identity for Claude, Key Vault, registry |
| Browser | CSP with per-request nonce, X-Frame-Options DENY, nosniff, strict referrer, permissions policy |
| Audit | GAIA activity log; Azure activity log; App Service and Foundry diagnostics in Log Analytics |
| Least privilege | PIM for admin rights; developer without data access; deployments only via the pipeline identity |
| Vulnerabilities | Defender for Cloud; dependency patches monthly, 7 days for high severity; penetration test before real data |

## Deployment pipeline

GitHub Actions in `kjholman/gc`, OIDC-federated to `id-gaia-deploy` (no Azure secrets in GitHub):

1. On merge to `main`: typecheck, lint, build.
2. Build the image, tag with the commit hash, push to `crgaiaprod`.
3. Deploy to the `staging` slot; the container applies migrations on start.
4. Health check and smoke test (sign-in page, test login).
5. Swap to production; roll back by swapping back.

Both slots share the database, so migrations must be backward compatible (add first, remove later). Pull requests with review are recommended. Define the resources in Bicep under `infra/`.

## Backup, recovery and monitoring

- PostgreSQL point-in-time restore within 7 to 35 days to a new server; optional geo-redundant backup to the paired region.
- Key Vault soft delete and purge protection; earlier images kept in the registry; slot swap for rollback.
- Recovery point and time objectives to agree with IT; restore tested twice a year.
- Alerts: availability test on `/login`, HTTP 5xx, database CPU and storage over 80% and connection failures, Foundry throttling and errors, analysis errors (log query), budget, Key Vault access denied.

## Open items

- Region for `aif-gaia-prod` among those offering Claude in Foundry.
- Tokens-per-minute quota for both deployments.
- Microsoft's written position on data use and retention for Claude in Foundry; zero-retention availability.
- Email: ACS with a verified subdomain, or a Microsoft 365 mailbox.
- Inbound: address restrictions or Front Door with WAF.
- Customer-managed keys required or not.
- Backup retention, geo-redundancy, recovery targets.
- VNet address range.
- Owner and Contributor holders; developer access.
- Start clean, or migrate data from Render (`pg_dump`/`pg_restore`).
