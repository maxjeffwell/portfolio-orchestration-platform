# Database Architecture

This document describes the database architecture for the Portfolio Orchestration Platform.

## Overview

Each application has its own dedicated database instance to ensure isolation, independent scaling, and simplified management.

## Database Instances

### PostgreSQL Instances

#### 1. PostgreSQL for Bookmarked
- **Service Name**: `postgresql-bookmarked.default.svc.cluster.local:5432`
- **Database**: `bookmarked`
- **User**: `bookmarked_user`
- **Password**: `bookmarked_postgres123`
- **Storage**: 2Gi PVC (`postgresql-bookmarked-pvc`)
- **Used By**: Bookmarked application

#### 2. PostgreSQL for Code Talk
- **Service Name**: `postgresql-codetalk.default.svc.cluster.local:5432`
- **Database**: `codetalk`
- **User**: `codetalk_user`
- **Password**: `codetalk_postgres123`
- **Storage**: 2Gi PVC (`postgresql-codetalk-pvc`)
- **Used By**: Code Talk application

### Redis Instance

#### Redis for Code Talk
- **Service Name**: `redis.default.svc.cluster.local:6379`
- **Password**: `redis123`
- **Storage**: 1Gi PVC (`redis-pvc`)
- **Used By**: Code Talk application (caching/sessions)

### MongoDB Instances

#### 1. MongoDB for EducationELLy
- **Service Name**: `mongodb-educationelly.default.svc.cluster.local:27017`
- **Database**: `educationelly`
- **Root User**: `root`
- **Root Password**: `educationelly_mongo123`
- **Storage**: 2Gi PVC (`mongodb-educationelly-pvc`)
- **Used By**: EducationELLy application

#### 2. MongoDB for EducationELLy GraphQL
- **Service Name**: `mongodb-educationelly-graphql.default.svc.cluster.local:27017`
- **Database**: `educationelly_graphql`
- **Root User**: `root`
- **Root Password**: `educationgql_mongo123`
- **Storage**: 2Gi PVC (`mongodb-educationelly-graphql-pvc`)
- **Used By**: EducationELLy GraphQL application

#### 3. MongoDB for IntervalAI
- **Service Name**: `mongodb-intervalai.default.svc.cluster.local:27017`
- **Database**: `intervalai`
- **Root User**: `root`
- **Root Password**: `intervalai_mongo123`
- **Storage**: 2Gi PVC (`mongodb-intervalai-pvc`)
- **Used By**: IntervalAI application

## Connection Strings

### Bookmarked
```
postgres://bookmarked_user:bookmarked_postgres123@postgresql-bookmarked.default.svc.cluster.local:5432/bookmarked
```

### Code Talk
**PostgreSQL:**
```
postgres://codetalk_user:codetalk_postgres123@postgresql-codetalk.default.svc.cluster.local:5432/codetalk
```

**Redis:**
```
redis://:redis123@redis.default.svc.cluster.local:6379
```

### EducationELLy
```
mongodb://root:educationelly_mongo123@mongodb-educationelly.default.svc.cluster.local:27017/educationelly?authSource=admin
```

### EducationELLy GraphQL
```
mongodb://root:educationgql_mongo123@mongodb-educationelly-graphql.default.svc.cluster.local:27017/educationelly_graphql?authSource=admin
```

### IntervalAI
```
mongodb://root:intervalai_mongo123@mongodb-intervalai.default.svc.cluster.local:27017/intervalai?authSource=admin
```

## Resource Allocation

### Per Database Instance

**PostgreSQL:**
- Requests: 256Mi memory, 250m CPU
- Limits: 512Mi memory, 500m CPU

**Redis:**
- Requests: 128Mi memory, 100m CPU
- Limits: 256Mi memory, 250m CPU

**MongoDB:**
- Requests: 256Mi memory, 250m CPU
- Limits: 512Mi memory, 500m CPU

### Total Cluster Resources

**Storage:**
- PostgreSQL: 2 instances × 2Gi = 4Gi
- Redis: 1 instance × 1Gi = 1Gi
- MongoDB: 3 instances × 2Gi = 6Gi
- **Total: 11Gi**

**Memory (Limits):**
- PostgreSQL: 2 instances × 512Mi = 1024Mi
- Redis: 1 instance × 256Mi = 256Mi
- MongoDB: 3 instances × 512Mi = 1536Mi
- **Total: 2816Mi (~2.8Gi)**

**CPU (Limits):**
- PostgreSQL: 2 instances × 500m = 1000m
- Redis: 1 instance × 250m = 250m
- MongoDB: 3 instances × 500m = 1500m
- **Total: 2750m (~2.75 cores)**

## Design Rationale

### Why Separate Instances?

1. **Isolation**: Each application has complete control over its database
2. **Independence**: Database issues in one app don't affect others
3. **Scalability**: Can scale each database independently based on app needs
4. **Security**: No shared credentials or cross-contamination
5. **Migrations**: Database schema changes are isolated to one app
6. **Maintenance**: Can backup, restore, or upgrade databases independently

### Why Not Shared Instances?

While shared instances would use fewer resources, the benefits of isolation outweigh the costs:
- Easier to debug application-specific database issues
- No risk of one app's queries affecting another's performance
- Simpler to move databases to external services later
- Better reflects production architecture patterns

## Backup and Recovery

Each database can be backed up independently:

### PostgreSQL Backup
```bash
kubectl exec -it postgresql-bookmarked-0 -- pg_dump -U bookmarked_user bookmarked > bookmarked-backup.sql
kubectl exec -it postgresql-codetalk-0 -- pg_dump -U codetalk_user codetalk > codetalk-backup.sql
```

### MongoDB Backup
```bash
kubectl exec -it mongodb-educationelly-0 -- mongodump --db=educationelly --out=/data/backup
kubectl exec -it mongodb-educationelly-graphql-0 -- mongodump --db=educationelly_graphql --out=/data/backup
kubectl exec -it mongodb-intervalai-0 -- mongodump --db=intervalai --out=/data/backup
```

### Redis Backup
```bash
kubectl exec -it redis-0 -- redis-cli --pass redis123 SAVE
kubectl cp redis-0:/data/dump.rdb ./redis-backup.rdb
```

## Monitoring

To check database pod status:

```bash
# List all database pods
kubectl get pods -l tier=database

# Check specific database logs
kubectl logs postgresql-bookmarked-0
kubectl logs mongodb-educationelly-0
kubectl logs redis-0

# Check resource usage
kubectl top pods -l tier=database
```

## Security Considerations

**Current Setup (Development):**
- Hardcoded passwords in secrets
- No SSL/TLS encryption
- Root access for MongoDB

**Production Recommendations:**
- Use external secret management (HashiCorp Vault, AWS Secrets Manager)
- Enable SSL/TLS for all database connections
- Use dedicated database users with minimal privileges
- Implement network policies to restrict database access
- Enable audit logging
- Regular security updates and patches
