# FireBook Algolia Search Fix

## Issue Summary

FireBook's Algolia search was not working because the application requires Algolia credentials to be embedded at build time (not runtime). The Docker image needed to be rebuilt with the correct environment variables.

## Root Cause

Vite applications using `import.meta.env` read environment variables during the build process, not at runtime. This means:

1. Algolia credentials must be provided as Docker build arguments
2. The credentials get baked into the compiled JavaScript bundle
3. Any change to credentials requires rebuilding and redeploying the image

## Solution Applied

### 1. GitHub Secrets Configuration ✅

The following secrets were configured in the GitHub repository:

- `VITE_ALGOLIA_APP_ID` → `8DX5VDLLK6`
- `VITE_ALGOLIA_INDEX_NAME` → `bookmarks`
- `VITE_ALGOLIA_SEARCH_API_KEY` → `[configured]`

These secrets are now automatically passed to the Docker build via GitHub Actions.

### 2. Docker Image Rebuild ✅

The Docker image was rebuilt (latest: Dec 16, 2025 20:01 UTC) with the correct Algolia credentials embedded.

### 3. Kubernetes Deployment Update Required ⚠️

The Kubernetes deployment on your VPS needs to pull the new image. Run the following commands on your VPS:

```bash
# SSH into your VPS
ssh your-vps

# Run the update script
cd /path/to/portfolio-orchestration-platform
./scripts/update-firebook.sh
```

Or manually:

```bash
# Force restart the deployment to pull latest image
kubectl rollout restart deployment/firebook -n default

# Wait for rollout to complete
kubectl rollout status deployment/firebook -n default

# Verify the update
kubectl get pods -l app=firebook -n default
```

## Verification Steps

After updating the deployment:

1. **Visit the Application**
   Navigate to https://firebook-k8s.el-jefe.me/

2. **Test Search Functionality**
   - Click the search icon or button
   - The Algolia search modal should open without warnings
   - Search should return results instantly

3. **Check for Errors**
   Open browser DevTools console and look for:
   - ✅ `✅ Algolia search initialized` (good)
   - ❌ `⚠️ Algolia not configured` (bad - needs rebuild)

4. **Verify Pod Logs**
   ```bash
   kubectl logs -l app=firebook -n default
   ```

## How Algolia Integration Works

### Firebase Extension

FireBook uses the "Search with Algolia" Firebase Extension to automatically sync Firestore data to Algolia:

- **Collection**: `store` (bookmarks)
- **Index**: `bookmarks`
- **Indexed Fields**: title, description, url, tags, rating, siteName, favicon
- **Sync Mode**: Automatic on Firestore changes

Configuration: `extensions/firestore-algolia-search.env`

### Frontend Integration

The frontend uses Algolia's Lite Client for search:

```javascript
// src/services/algolia.js
const appId = import.meta.env.VITE_ALGOLIA_APP_ID;
const searchApiKey = import.meta.env.VITE_ALGOLIA_SEARCH_API_KEY;
const indexName = import.meta.env.VITE_ALGOLIA_INDEX_NAME;
```

- **Search Component**: `src/components/AlgoliaSearch.jsx`
- **Uses**: `react-instantsearch` for UI components
- **Features**: Real-time search, user filtering (by userId), hit highlighting

## Security Considerations

### Search-Only API Key

The API key embedded in the frontend is a **search-only key** that:
- ✅ Can only perform read operations (searches)
- ✅ Cannot modify or delete data
- ✅ Safe to expose in client-side code
- ✅ Already filtered by CSP (Content Security Policy)

### Admin API Key

The admin key for write operations is:
- Stored in Google Cloud Secret Manager
- Only accessible by Firebase Cloud Functions
- Used by the Firebase Extension to sync data
- Never exposed to the frontend

## Troubleshooting

### If Search Still Doesn't Work

1. **Verify Image Tag**
   Check that the Kubernetes deployment is using `latest` or the most recent tag:
   ```bash
   kubectl describe deployment firebook -n default | grep Image
   ```

2. **Force Pull New Image**
   Update `imagePullPolicy` to `Always` if it's set to `IfNotPresent`:
   ```yaml
   # k8s/deployments/firebook-deployment.yaml
   imagePullPolicy: Always
   ```

3. **Check Image Build Logs**
   Verify the build included Algolia vars:
   ```bash
   cd /home/maxjeffwell/GitHub_Projects/bookmarks-capstone-api
   gh run view --log | grep ALGOLIA
   ```

4. **Verify Firestore → Algolia Sync**
   - Go to Firebase Console → Extensions
   - Check "Search with Algolia" status
   - Verify index has data: https://www.algolia.com/apps/8DX5VDLLK6/explorer

5. **Test Algolia Index Directly**
   ```bash
   curl -X POST \
     -H "X-Algolia-API-Key: 99bc143df6b1747e1184e42c9c8fb925" \
     -H "X-Algolia-Application-Id: 8DX5VDLLK6" \
     --data '{"params":"query=test"}' \
     "https://8DX5VDLLK6-dsn.algolia.net/1/indexes/bookmarks/query"
   ```

## Future Improvements

### Runtime Configuration Alternative

To avoid rebuilding for credential changes, consider:

1. **Environment Variables at Runtime**
   Use a small backend proxy to inject credentials server-side

2. **ConfigMap Injection**
   Store credentials in Kubernetes ConfigMap and inject via init container

3. **Service Worker Pattern**
   Fetch credentials from a secure endpoint on app load

However, for a static site served by nginx, build-time configuration is the standard approach.

## Related Files

- **Dockerfile**: `/home/maxjeffwell/GitHub_Projects/bookmarks-capstone-api/Dockerfile`
- **GitHub Workflow**: `.github/workflows/docker-build-push.yml`
- **K8s Deployment**: `/home/maxjeffwell/GitHub_Projects/portfolio-orchestration-platform/k8s/deployments/firebook-deployment.yaml`
- **Algolia Service**: `src/services/algolia.js`
- **Search Component**: `src/components/AlgoliaSearch.jsx`
- **Firebase Extension**: `extensions/firestore-algolia-search.env`

## Contact

If issues persist, check:
- GitHub Actions build logs
- Kubernetes pod logs
- Browser console for Algolia initialization messages
- Algolia dashboard for index status
