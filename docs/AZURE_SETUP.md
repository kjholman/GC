# GAIA on Azure: setup guide

The practical way to start: run GAIA on Azure the way it runs on Render today, with no code changes. GAIA's container runs on App Service, its data sits in a private PostgreSQL database, and it keeps calling Anthropic's API directly. Moving the AI calls into Azure through Microsoft Foundry can follow later (see `docs/AZURE_ARCHITECTURE.md`).

## How it fits together

| Piece | What it is | Holds | Changes when |
|---|---|---|---|
| Container registry (`crgaiaprod`) | Azure Container Registry, a private image store in your subscription | Packaged versions of GAIA (images) with tags such as `gaia:v1`, `gaia:latest`. Code only. | A new version is built |
| App Service (`app-gaia-prod`) | Microsoft-managed web app service | Web address and certificate, settings, its Azure identity, network connection, which image to run | Configuration changes or a new version is picked |
| Key Vault (`kv-gaia-prod`) | Secret store | Database URL, session key, Anthropic key, email key | A secret is rotated |
| PostgreSQL (`psql-gaia-prod`) | Managed database, private network only | Deals, files, memos, users, audit log | People use GAIA |

How the registry and App Service work together:

1. Azure builds GAIA's image from the repository's `Dockerfile` on its own build machines (ACR Tasks) and stores it in the registry with a tag.
2. When the web app is created you choose the registry, image and tag. Its configuration then names one image, e.g. `crgaiaprod.azurecr.io/gaia:v1`.
3. On start, App Service fetches the image using its own Azure identity (AcrPull), with no registry password.
4. It starts the container with the settings (secrets resolved from Key Vault) and the start command: apply database changes, then start GAIA. Traffic goes to port 3000; Always On keeps it running.
5. After any restart it fetches the same image again. Data lives in the database, not the container.
6. To update, a new image is built and App Service is pointed at it, by hand or automatically.

Common questions:

- **A virtual machine?** No. A managed service: Microsoft runs and patches the operating system; there is no server to log into.
- **Serverless?** Managed, but not serverless: it runs continuously on a dedicated plan (P1v3). GAIA runs analyses in the background for 10 minutes or more after a request, which serverless platforms would stop.
- **Why Linux?** GAIA's image is a Linux container (`node:22-alpine`); Windows App Service runs only Windows containers. Prisma and sharp are built for Linux. It is Microsoft's standard choice for Node.js, costs less, and matches Render.
- **Must the image exist before the web app?** Only to select it during creation. Otherwise use the "Quickstart" sample image and switch in Deployment Center once GAIA's image is built.
- **Does App Service build GAIA?** Not on the container route: it runs an image built in the registry. (Its "Code" route can build from source like Render, but the container route runs exactly what was built.)

## How traffic flows

```
Staff browser --HTTPS--> Web app (App Service) --HTTPS (TLS)--> api.anthropic.com
                            |        ^              <-- answer on the same connection
                   private network only
                            v        |
                       PostgreSQL (no public address)
```

- **Staff to the web app:** HTTPS only (TLS 1.2+). GAIA's sign-in is unchanged: approved Genesys addresses get an emailed six-digit code. Optional App Service access restrictions limit it to office and VPN addresses.
- **Web app to the database:** the database is inside a virtual network with no public address, and the app joins that network. (Firewall rules on the app's outbound IPs would work, but those IPs are shared with other Azure customers.)
- **Web app to Anthropic and back:** the app opens an outbound HTTPS connection to `api.anthropic.com` with the API key from Key Vault; the answer returns on the same connection. Anthropic never connects into Azure: no inbound port or webhook. Results are saved to the database over the private network.
- **Other outbound:** the email service for sign-in codes, and optionally company websites and icon services for logos. If IT restricts egress, allow these and `api.anthropic.com:443`. A NAT gateway gives one fixed outbound IP if wanted.

## Before you start

- Azure subscription with Owner (or Contributor plus User Access Administrator) on it or the resource group.
- Cloud Shell (Bash) in the Azure portal: has the Azure CLI, `git`, `openssl`.
- A GitHub personal access token with read access to `kjholman/gc` (plus repository webhook permission for automatic builds).
- From Render: the Anthropic API key, email settings (Resend key or SMTP), `SEED_ADMIN_EMAILS`, and the external database URL if data is moving.
- Decisions: clean start or migrate data; web address; office/VPN restriction.

## Step-by-step setup

### 1. Names and resource group

```bash
RG=rg-gaia-prod-cc; LOC=canadacentral
PG=psql-gaia-prod; PLAN=asp-gaia-prod; APP=app-gaia-prod
ACR=crgaiaprod; KV=kv-gaia-prod; VNET=vnet-gaia-prod
PGPASS=$(openssl rand -hex 24)   # letters and digits, safe in a URL
az account set --subscription "<subscription id>"
az group create -n $RG -l $LOC
```

### 2. Private network

```bash
az network vnet create -g $RG -n $VNET --address-prefixes 10.40.10.0/24 \
  --subnet-name snet-app --subnet-prefixes 10.40.10.0/26
az network vnet subnet create -g $RG --vnet-name $VNET -n snet-psql \
  --address-prefixes 10.40.10.64/28 --delegations Microsoft.DBforPostgreSQL/flexibleServers
```

Ranges are examples; IT picks non-overlapping ones.

### 3. Database, private only

```bash
az postgres flexible-server create -g $RG -n $PG -l $LOC --version 16 \
  --tier Burstable --sku-name Standard_B2s --storage-size 128 \
  --admin-user gaiaadmin --admin-password "$PGPASS" --backup-retention 14 \
  --vnet $VNET --subnet snet-psql \
  --private-dns-zone gaia.private.postgres.database.azure.com --database-name genesys_analyst
```

Private access and geo-redundant backup (`--geo-redundant-backup Enabled`) can only be set at creation.

### 4. Key Vault and secrets

```bash
az keyvault create -g $RG -n $KV -l $LOC --enable-rbac-authorization true
KVID=$(az keyvault show -n $KV --query id -o tsv)
az role assignment create --assignee $(az ad signed-in-user show --query id -o tsv) \
  --role "Key Vault Secrets Officer" --scope $KVID
az keyvault secret set --vault-name $KV -n database-url \
  --value "postgresql://gaiaadmin:$PGPASS@$PG.postgres.database.azure.com:5432/genesys_analyst?sslmode=require"
az keyvault secret set --vault-name $KV -n auth-secret --value "$(openssl rand -base64 48)"
az keyvault secret set --vault-name $KV -n anthropic-api-key --value "<Anthropic key from Render>"
az keyvault secret set --vault-name $KV -n resend-api-key --value "<Resend key from Render, if used>"
```

If a `secret set` fails with a permission error, wait a minute for the role assignment and retry.

### 5. Registry and the first image

```bash
az acr create -g $RG -n $ACR --sku Basic
```

| | Option 1: one-off build | Option 2: saved build task |
|---|---|---|
| Code comes from | A clone in Cloud Shell | The registry fetches it from GitHub |
| Each build | `git pull`, then `az acr build` | `az acr task run` |
| Saved in Azure | Only the image | The build definition |
| Automatic builds | No | Optional, on every push to `main` |

Option 1:

```bash
git clone https://github.com/kjholman/gc && cd gc   # GitHub username + personal access token
az acr build -r $ACR -t gaia:v1 .
```

Option 2:

```bash
az acr task create -r $ACR -n gaia-build \
  --context https://github.com/kjholman/gc.git#main --file Dockerfile \
  --image "gaia:{{.Run.ID}}" --image gaia:latest \
  --git-access-token <GitHub personal access token> --commit-trigger-enabled false
az acr task run -r $ACR -n gaia-build
```

### 6. The web app

Portal (Create a resource → Web App):

- Basics: Publish = Container, OS = Linux, Region = Canada Central, plan Premium v3 P1v3.
- Container: Image source = Azure Container Registry, Registry = `crgaiaprod`, Image = `gaia`, Tag = `v1` or `latest`, Authentication = Managed identity, Startup command = `npm run start:render`.
- Networking: virtual network integration with `vnet-gaia-prod` / `snet-app`.

Or CLI:

```bash
az appservice plan create -g $RG -n $PLAN -l $LOC --is-linux --sku P1V3
az webapp create -g $RG -p $PLAN -n $APP --container-image-name $ACR.azurecr.io/gaia:v1
az webapp update -g $RG -n $APP --https-only true
az webapp config set -g $RG -n $APP --always-on true --min-tls-version 1.2 --ftps-state Disabled \
  --startup-file "npm run start:render" \
  --generic-configurations '{"acrUseManagedIdentityCreds": true, "healthCheckPath": "/login"}'
az webapp vnet-integration add -g $RG -n $APP --vnet $VNET --subnet snet-app
az webapp config set -g $RG -n $APP --vnet-route-all-enabled true
```

Permissions for the app's identity (either path):

```bash
APPID=$(az webapp identity assign -g $RG -n $APP --query principalId -o tsv)
az role assignment create --assignee $APPID --role AcrPull --scope $(az acr show -n $ACR --query id -o tsv)
az role assignment create --assignee $APPID --role "Key Vault Secrets User" --scope $KVID
```

### 7. Settings

```bash
ref() { echo "@Microsoft.KeyVault(VaultName=$KV;SecretName=$1)"; }
az webapp config appsettings set -g $RG -n $APP --settings \
  DATABASE_URL="$(ref database-url)" AUTH_SECRET="$(ref auth-secret)" \
  ANTHROPIC_API_KEY="$(ref anthropic-api-key)" RESEND_API_KEY="$(ref resend-api-key)" \
  ALLOWED_EMAIL_DOMAINS=genesyscapital.com SEED_ADMIN_EMAILS="<admin addresses>" \
  ANTHROPIC_MODEL=claude-opus-5-5 ANTHROPIC_FAST_MODEL=claude-sonnet-5-5 \
  ANALYSIS_EFFORT=medium ENABLE_WEB_RESEARCH=true ENABLE_ADMIN_BYPASS=false \
  SESSION_IDLE_HOURS=6 SESSION_TTL_HOURS=168 WEBSITES_PORT=3000 \
  APP_URL="https://$APP.azurewebsites.net"
az webapp restart -g $RG -n $APP
```

Copy any other values set in Render (`EMAIL_FROM`, SMTP settings).

### 8. Check it

```bash
az webapp log tail -g $RG -n $APP
```

Open `https://app-gaia-prod.azurewebsites.net`, sign in with an emailed code, run a test analysis.

### 9. Bring Render's data (optional)

Run from inside the virtual network (a Cloud Shell attached to it, or a temporary VM), before people start using Azure:

```bash
pg_dump "<Render external database URL>" -Fc -f gaia.dump
az webapp stop -g $RG -n $APP
pg_restore --clean --if-exists --no-owner --no-acl \
  -d "postgresql://gaiaadmin:$PGPASS@$PG.postgres.database.azure.com:5432/genesys_analyst?sslmode=require" gaia.dump
az webapp start -g $RG -n $APP
```

### 10. Web address and access

Add a CNAME `gaia.genesyscapital.com` → `app-gaia-prod.azurewebsites.net` and the `asuid` TXT record the portal shows, then:

```bash
az webapp config hostname add -g $RG --webapp-name $APP --hostname gaia.genesyscapital.com
az webapp config ssl create -g $RG -n $APP --hostname gaia.genesyscapital.com
az webapp config access-restriction add -g $RG -n $APP --rule-name office \
  --action Allow --ip-address <office public IP>/32 --priority 100   # optional
```

Bind the certificate under Custom domains and set `APP_URL` to the new address.

## Updating GAIA

| Approach | How a change reaches production |
|---|---|
| By hand | Build, then point the app at the new tag |
| Registry auto-build + continuous deployment | Push to `main` → registry builds `gaia:latest` → App Service is notified and restarts on it |
| GitHub Actions | Push to `main` → checks → registry build → app pointed at the new tag |

By hand:

```bash
az acr task run -r $ACR -n gaia-build     # or: git pull && az acr build -r $ACR -t gaia:v2 .
az webapp config container set -g $RG -n $APP --container-image-name $ACR.azurecr.io/gaia:<new tag>
```

Fully automatic, without GitHub Actions:

```bash
az acr task update -r $ACR -n gaia-build --commit-trigger-enabled true
az webapp config container set -g $RG -n $APP --container-image-name $ACR.azurecr.io/gaia:latest
HOOK=$(az webapp deployment container config -g $RG -n $APP --enable-cd true --query CI_CD_URL -o tsv)
az acr webhook create -r $ACR -n gaiadeploy --uri "$HOOK" --actions push --scope gaia:latest
```

(In the portal: the Continuous deployment switch in Deployment Center.)

GitHub Actions: an Azure identity that trusts the repository's `main` branch (OpenID Connect, no stored password); the workflow runs type checks and lint, `az acr build`, `az webapp config container set`, then waits for the app to answer.

During an update App Service fetches the new image and restarts on it (usually a minute or two). GAIA applies database changes on start, and analyses interrupted by the restart resume from their last saved step.

Rolling back: point the app at an earlier tag (command or Deployment Center). With continuous deployment on `latest`, the next push replaces it.

Zero-downtime staging slots need one small change first (a staging copy must not resume analyses still running in production), and the slot's own identity needs the same registry and Key Vault access.

## Before go-live checklist

- [ ] First image build tested: Render builds from source and has never used the `Dockerfile`.
- [ ] A `.dockerignore` added, so a build from a working copy never includes `node_modules`, build output or `.env`.
- [ ] `ENABLE_ADMIN_BYPASS=false`; no "Continue as administrator" on the sign-in page.
- [ ] A dedicated, least-privilege database user instead of the admin user.
- [ ] Backup retention and geo-redundancy decided; one restore tested.
- [ ] Alerts: app unavailable, server errors, database CPU and storage.
- [ ] Office/VPN restriction decided; custom domain and certificate in place.
- [ ] Data migrated or clean start agreed.
- [ ] Penetration test before real deal materials, if required.
- [ ] Render shut down after cut-over; old keys rotated.

## Later: moving the AI calls into Azure

The AI calls can move from Anthropic's API to Microsoft Foundry without changing this hosting: same Claude models, endpoint inside Genesys's Azure account, private connection, managed-identity authentication, Azure billing. It adds a Foundry resource and a few contained code changes; see `docs/AZURE_ARCHITECTURE.md`.
