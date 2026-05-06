# ✅ Deployment Checklist - Intel Reddit (Netlify)

This document confirms the project has been configured according to `NETLIFY_DEPLOYMENT_DATABASE_GUIDE.txt`

---

## 1. ✅ DATABASE SCHEMA (Section 3 of Guide)

All tables now match the canonical schema:

### investigation_cases
- ✅ Added: `department`, `lead_investigator`, `is_sensitive`, `case_password_hash`, `cache_duration_days`

### audit_logs
- ✅ Renamed: `table_name` → `resource_type`
- ✅ Renamed: `record_id` → `resource_id`
- ✅ Added: `details` (jsonb)
- ✅ Removed: `old_values`, `new_values`, `user_agent`

### investigation_reports
- ✅ Renamed: `content` → `report_data`
- ✅ Renamed: `file_path` → `export_format`
- ✅ Added: `selected_modules` (jsonb)
- ✅ Removed: `title`, `metadata`

### analysis_results
- ✅ Renamed: `target_id` → `target`
- ✅ Renamed: `results` → `result_data`
- ✅ Added: `sentiment_data` (jsonb)
- ✅ Removed: `target_type`, `confidence_score`, `metadata`

### monitoring_sessions
- ✅ Added: `search_type`, `activities`, `profile_data`, `started_at`, `ended_at`, `new_activity_count`, `word_cloud_data`
- ✅ Removed: `target_type`, `monitoring_type`, `status`, `config`, `last_check`, `next_check`

### reddit_comments & reddit_posts
- ✅ Added: `metadata`, `sentiment`, `sentiment_explanation`

### user_profiles_analyzed
- ✅ Added: `account_age`, `active_subreddits`, `activity_pattern`, `analyzed_at`, `behavior_patterns`, `comment_sentiments`, `location_indicators`, `post_sentiments`, `sentiment_analysis`, `word_cloud`
- ✅ Removed: `account_created`, `profile_data`, `analysis_data`, `scraped_at`, `is_verified`, `is_mod`, `has_verified_email`, `avatar`

---

## 2. ✅ RLS ENABLED (Section 4 of Guide)

All 11 tables have RLS enabled:
- ✅ profiles
- ✅ user_roles
- ✅ investigation_cases
- ✅ reddit_posts
- ✅ reddit_comments
- ✅ user_profiles_analyzed
- ✅ analysis_results
- ✅ monitoring_sessions
- ✅ investigation_reports
- ✅ audit_logs
- ✅ user_invites

---

## 3. ✅ RLS POLICIES (Section 4 of Guide)

### Profiles
- ✅ user_select_own (auth.uid() = id)
- ✅ user_update_own (auth.uid() = id)
- ✅ admin_select_all (has_role(auth.uid(), 'admin'))
- ✅ admin_update_all (has_role(auth.uid(), 'admin'))

### User Roles
- ✅ user_select_own (auth.uid() = user_id)
- ✅ admin_all (has_role(auth.uid(), 'admin'))

### Investigation Cases
- ✅ owner_select (created_by = auth.uid())
- ✅ owner_insert (created_by = auth.uid())
- ✅ owner_update (created_by = auth.uid())
- ✅ owner_delete (created_by = auth.uid())
- ✅ admin_all (has_role(auth.uid(), 'admin'))

### Case-Scoped Tables (posts, comments, profiles_analyzed, analysis_results, sessions, reports)
- ✅ owner_select (EXISTS check on investigation_cases)
- ✅ owner_insert (EXISTS check on investigation_cases)
- ✅ owner_delete (EXISTS check on investigation_cases)
- ✅ admin_all (has_role(auth.uid(), 'admin'))

### Audit Logs
- ✅ user_select_own (auth.uid() = user_id)
- ✅ admin_select_all (has_role(auth.uid(), 'admin'))
- ✅ allow_insert (WITH CHECK true - intentional for SECURITY DEFINER function)

### User Invites
- ✅ admin_all (has_role(auth.uid(), 'admin'))
- ✅ select_unused (accepted_at IS NULL AND expires_at > NOW())

---

## 4. ✅ SECURITY DEFINER FUNCTIONS (Section 6 of Guide)

- ✅ `has_role(_user_id uuid, _role app_role)` - prevents infinite recursion
- ✅ `handle_new_user()` - trigger function for auth.users
- ✅ `update_updated_at_column()` - updates updated_at timestamp
- ✅ `hash_case_password(text)` - bcrypt password hashing
- ✅ `verify_case_password(case_id, text)` - password verification
- ✅ `generate_invite_token()` - creates secure tokens
- ✅ `mark_invite_used(token)` - marks invites as used
- ✅ `log_audit_event()` - writes to audit_logs

---

## 5. ✅ TRIGGERS

- ✅ `on_auth_user_created` on auth.users (calls handle_new_user)
- ✅ `trg_profiles_updated` on profiles
- ✅ `trg_investigation_cases_updated` on investigation_cases
- ✅ `trg_monitoring_sessions_updated` on monitoring_sessions

---

## 6. ✅ INDEXES (Section 3 of Guide)

- ✅ idx_reddit_posts_case_id_created
- ✅ idx_reddit_comments_case_id_created
- ✅ idx_monitoring_sessions_case_id_started
- ✅ idx_analysis_results_case_id_analyzed
- ✅ idx_audit_logs_user_id_created
- ✅ idx_user_roles_user_id
- ✅ idx_investigation_cases_created_by

---

## 7. ✅ FRONTEND CONFIGURATION (Section 1 of Guide)

### Environment Variables (.env.local)
```env
VITE_SUPABASE_URL=https://askszqcuajalewwuwzvc.supabase.co
VITE_SUPABASE_PROJECT_ID=askszqcuajalewwuwzvc
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### netlify.toml
- ✅ Build command: `npm run build`
- ✅ Publish directory: `dist`
- ✅ Node version: `20`
- ✅ SPA redirects configured

### public/_redirects
- ✅ `/* /index.html 200` - for React Router deep links

---

## 8. ✅ PROJECT STRUCTURE

```
intel-reddit/
├── src/                        # React source (Vite project)
│   ├── components/            # 72 UI components
│   ├── pages/                 # 13 page components
│   ├── hooks/                 # 3 custom hooks
│   ├── contexts/              # 2 contexts
│   ├── integrations/supabase/ # Supabase client
│   └── lib/                   # Utilities
├── public/                    # Static assets
│   ├── _redirects             # SPA fallback rules ✅
│   ├── favicon.ico/png
│   └── robots.txt
├── index.html                 # Entry point
├── vite.config.ts             # Vite config
├── package.json               # Dependencies
├── netlify.toml               # Netlify config ✅
├── tailwind.config.ts         # Tailwind config
├── postcss.config.js          # PostCSS config
├── .env.local                 # Local env vars ✅
├── .env.example               # Env template ✅
└── DEPLOYMENT_CHECKLIST.md    # This file
```

---

## 🚀 DEPLOYMENT STEPS

### Step 1: Install Dependencies
```bash
cd "d:\Books & Notes\FYP 2\Development\intel-reddit"
npm install
```

### Step 2: Local Test
```bash
npm run dev
# Open http://localhost:8080
```

### Step 3: Commit to Git
```bash
git add .
git commit -m "Configured for Netlify deployment per guide"
git push origin main
```

### Step 4: Deploy to Netlify

**Option A - Netlify Dashboard:**
1. Go to [netlify.com](https://netlify.com) → Sign in with GitHub
2. Click "Add new site" → "Import from Git"
3. Select `intel-reddit` repository
4. Build settings (auto-detected):
   - Build command: `npm run build`
   - Publish directory: `dist`
5. Add Environment Variables:
   - `VITE_SUPABASE_URL`: `https://askszqcuajalewwuwzvc.supabase.co`
   - `VITE_SUPABASE_PROJECT_ID`: `askszqcuajalewwuwzvc`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFza3N6cWN1YWphbGV3d3V3enZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MTEyNzAsImV4cCI6MjA4ODE4NzI3MH0.eqWswOWDRXg-_ays0e-c53B_E6ViuQfIOCvwmTPTeck`
6. Click "Deploy"

**Option B - Netlify CLI:**
```bash
npm install -g netlify-cli
netlify login
netlify init
netlify deploy --prod
```

---

## 🔧 POST-DEPLOY SUPABASE CONFIG (Section 7 of Guide)

After deployment, configure these in Supabase Dashboard:

### Authentication → URL Configuration:
- Site URL: `https://<your-site>.netlify.app`
- Redirect URLs:
  - `https://<your-site>.netlify.app/**`
  - `http://localhost:5173/**` (for local dev)

### Authentication → Email Templates:
- Update confirmation URLs to point at your Netlify domain

---

## ⚠️ IMPORTANT NOTES

1. **Edge Functions:** The guide mentions Edge Functions (reddit-scraper, analyze-content, etc.) These are NOT set up yet. They need to be created in Supabase separately if you need them.

2. **Local Python Server:** The `analyze-offline` edge function calls a local Python server. For production, you need to either:
   - Use only `analyze-content` (cloud-based)
   - Deploy the Python server separately (Fly.io/Railway/Render)

3. **RLS Warning:** There's a security advisor warning about the `allow_insert` policy on `audit_logs`. This is **intentional** per the guide - the audit log uses a SECURITY DEFINER function.

4. **Leaked Password Protection:** Enable this in Supabase Auth settings for better security.

---

## 📋 VERIFICATION CHECKLIST (Section 10 of Guide)

After deployment, verify:
- [ ] Sign up creates profile + user_roles rows
- [ ] Login returns a valid session
- [ ] Create case adds row with correct created_by
- [ ] Reddit scrape adds rows with correct case_id
- [ ] Second user cannot see first user's cases (RLS isolation)
- [ ] Admin can see all cases
- [ ] Deep link refresh works (`/case/<id>/analysis`)
- [ ] No CORS errors in browser console

---

## 📞 Support

If any verification step fails:
- Check Section 2 of the guide for RLS debugging
- Check Section 4 for policy reference
- Check browser console for specific errors
