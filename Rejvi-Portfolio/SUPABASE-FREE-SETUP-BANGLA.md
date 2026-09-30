# Render Free + Supabase Free setup

এই version-এ Render Persistent Disk দরকার নেই। Website Render Free-তেই চলবে, কিন্তু portfolio data এবং uploaded image/PDF Supabase Storage-এ থাকবে।

## কী persistent থাকবে

- Website content এবং Admin settings
- Admin account hash
- Contact messages
- Articles, comments, reactions
- Content history
- Uploaded PNG/JPG/WebP/PDF
- Admin থেকে Permanent Delete করলে Supabase থেকেও file delete হবে

## 1. Supabase project তৈরি করুন

1. https://supabase.com এ account খুলুন / login করুন।
2. **New project** চাপুন।
3. Project name যেমন `rejvi-portfolio` দিন।
4. Free plan ব্যবহার করুন।
5. Project ready হওয়া পর্যন্ত অপেক্ষা করুন।

## 2. দুইটি value নিন

Supabase Dashboard-এ **Connect** অথবা **Settings > API Keys** থেকে:

- Project URL → `https://xxxxx.supabase.co`
- Server-side **Secret key** → `sb_secret_...`

Secret key কারও সাথে share করবেন না এবং GitHub-এ দেবেন না।

## 3. Render Environment-এ add করুন

Render > আপনার Web Service > **Environment > Edit**

Existing values রাখুন:

```
APP_ORIGIN=https://srrejvi.com
NODE_ENV=production
```

এর সাথে add করুন:

```
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SECRET_KEY=sb_secret_YOUR_KEY
```

Save করুন। `DATA_DIR` লাগবে না।

## 4. Deploy

GitHub-এ এই project push করার পর Render থেকে **Deploy latest commit** দিন।

First start-এ app নিজে:

- private `rejvi-state` bucket তৈরি করবে
- public `rejvi-media` bucket তৈরি করবে
- GitHub deployment-এর পুরোনো `data/portfolio.sqlite` থাকলে content/admin/messages/articles migrate করবে
- পুরোনো `data/uploads` files Supabase-এ upload করবে
- website-এর `/uploads/...` references নতুন Supabase URLs-এ convert করবে

Log-এ `Supabase initialized from existing SQLite data...` দেখলে migration complete হয়েছে।

## 5. First deploy-এর পর test

- `https://srrejvi.com`
- `https://srrejvi.com/admin`
- Admin login
- একটি test image upload
- Media section-এ দেখুন
- Delete permanently করে page refresh করুন
- Render redeploy করে নিশ্চিত করুন file/data হারায়নি

## 6. Migration confirm হওয়ার পর GitHub clean করুন

Supabase-এ data ঠিকমতো চলে যাওয়ার আগে এই step করবেন না। Confirm হওয়ার পরে local repo থেকে tracked runtime data untrack করতে পারেন:

```powershell
git rm -r --cached data
git add .gitignore
git commit -m "Move persistent data to Supabase"
git push
```

`.gitignore`-এ `data/` থাকার কারণে এরপর runtime database/uploads GitHub-এ যাবে না।

## Local development

Supabase variables না দিলে app আগের মতো local SQLite + `data/uploads` ব্যবহার করবে। তাই localhost development সহজ থাকবে।
