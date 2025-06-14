# Vercel Deployment Guide

## Prerequisites

1. A Vercel account
2. A PostgreSQL database (e.g., Vercel Postgres, Supabase, Neon, Railway, etc.)

## Deployment Steps

### 1. Database Setup

Choose a PostgreSQL provider and create a database. Popular options:
- **Vercel Postgres**: Integrated with Vercel dashboard
- **Supabase**: Free tier available
- **Neon**: Serverless PostgreSQL
- **Railway**: Simple deployment

### 2. Environment Variables

Set the following environment variables in your Vercel dashboard:

```bash
# Database (PostgreSQL for production)
DATABASE_URL=postgresql://[user]:[password]@[host]:[port]/[database]?schema=public

# XRPL Configuration
XRPL_NETWORK=wss://testnet.xrpl-labs.com
XRPL_SIGNATURE_SECRET=[your-secret]
XRPL_SIGNATURE_ADDRESS=[your-address]

# Xumm Configuration
XUMM_API_KEY=[your-api-key]
XUMM_API_SECRET=[your-api-secret]

# Agora Configuration
AGORA_APP_ID=[your-app-id]
AGORA_APP_CERTIFICATE=[your-certificate]

# IPFS Configuration (optional)
IPFS_API_URL=[your-ipfs-url]
IPFS_API_KEY=[your-ipfs-key]

# Public Environment Variables
NEXT_PUBLIC_XRPL_NETWORK=wss://testnet.xrpl-labs.com
NEXT_PUBLIC_AGORA_APP_ID=[your-app-id]
NEXT_PUBLIC_XUMM_API_KEY=[your-api-key]
```

### 3. Deploy to Vercel

1. Connect your GitHub repository to Vercel
2. Vercel will automatically detect Next.js
3. The build command in `vercel.json` will:
   - Generate Prisma Client
   - Push schema to PostgreSQL
   - Build Next.js app

### 4. Post-Deployment

After deployment:
1. Verify database schema is created
2. Test authentication flow
3. Test XRPL connectivity
4. Test Agora audio streaming

## Local Development

For local development with SQLite:

1. Copy `.env.example` to `.env`
2. Set `DATABASE_URL=file:./db.sqlite`
3. Run migrations: `npm run db:generate`
4. The dev command will automatically use the local schema file

## Troubleshooting

### Database Connection Issues
- Ensure PostgreSQL URL is correctly formatted
- Check SSL requirements (add `?sslmode=require` if needed)
- Verify database credentials

### Build Failures
- Check Prisma schema compatibility
- Ensure all environment variables are set
- Review build logs in Vercel dashboard

### Migration Issues
- For production, we use `prisma db push` instead of migrations
- This ensures schema is synced without migration history
- For major schema changes, consider manual migration strategy