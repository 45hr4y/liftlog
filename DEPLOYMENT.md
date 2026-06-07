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


# LiftLog v10 Supabase Manual Sync

1. Go to Supabase.
2. Create a project.
3. Open SQL Editor.
4. Paste and run `supabase-schema.sql`.
5. Go to Project Settings → API.
6. Copy:
   - Project URL
   - anon public key
7. Open LiftLog → More → Backup + Cloud.
8. Paste URL and anon key.
9. Enter a private sync code.
10. Upload from your main device.
11. Download on your second device.
