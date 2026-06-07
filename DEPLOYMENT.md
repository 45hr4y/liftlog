# LiftLog v8 Deployment Guide

## Best hosting option: Vercel

1. Create a GitHub account if needed.
2. Create a new repository called `liftlog`.
3. Upload all files from this folder.
4. Go to Vercel.
5. Import the GitHub repository.
6. Framework preset: Vite.
7. Build command: `npm run build`.
8. Output directory: `dist`.
9. Deploy.

After deployment, open the Vercel URL on your iPhone, then:
Share → Add to Home Screen.

## Supabase setup

1. Create a Supabase project.
2. Open SQL Editor.
3. Paste `supabase-schema.sql`.
4. Run it.
5. Copy your Project URL and anon key.
6. Add them inside LiftLog → Backup tab.

Full automatic sync is intentionally staged for v9 because it needs authentication, conflict rules, and photo storage.
