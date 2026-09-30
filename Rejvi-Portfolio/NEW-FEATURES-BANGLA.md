# Rejvi Portfolio — New Experience Update

এই ভার্সনে মূল layout/format একই রেখে নতুন visitor experience এবং admin control যোগ করা হয়েছে।

## 1) Theme Studio
Admin → Appearance → Theme studio

- Cloud — bright & minimal
- Midnight — dark & cinematic
- Warm paper — soft & personal
- Glass — airy & modern
- Ink — monochrome & focused

Font options:
- Modern sans serif
- Humanist tech
- Friendly rounded
- Editorial serif
- Classic serif
- Developer mono

Accent color, corner style, animation এবং page swipe আগের মতো control করা যাবে। Theme admin UI-তেও apply হবে।

## 2) Visitor appearance + translation
Admin → Appearance → Visitor experience

- visitor light/dark/auto switch
- website translation tool
- translation list থেকে common language select করা যাবে
- “More languages” Google Translate-এর website translator খুলবে

## 3) Special Events
Admin → Special events

Quick templates:
- Birthday
- National / Independence Day
- New Year
- Custom celebration

প্রতিটি event-এ title, message, date range, emoji, style, enabled/disabled এবং yearly repeat আছে। Event active date-এ visitor-এর website-এ special animated banner/celebration দেখাবে।

## 4) Website Pet
Admin → Appearance → Visitor experience

Pet options:
- Cat
- Dog
- Bird
- Fox
- Robot

Pet website-এর নিচে চলাফেরা করবে, মাঝে মাঝে খেলবে এবং visitor-কে greeting/message দেবে। Pet name, custom messages, interval admin panel থেকে change করা যাবে। Visitor চাইলে current session-এর জন্য pet hide করতে পারবে।

## 5) Admin Session Security
Admin session এখন 30 মিনিট inactivity হলে automatically sign out হবে। Active editing থাকলে secure heartbeat session alive রাখবে। 28 মিনিটে warning দেখাবে।

## 6) Back Office link removed
Public website/footer থেকে Back office/Admin link সম্পূর্ণ remove করা হয়েছে। Admin এখনও direct URL দিয়ে খোলা যাবে:

`https://srrejvi.com/admin`

## 7) Render Free sleep improvement
Render Free Web Service provider-level idle sleep সম্পূর্ণ app code দিয়ে disable করা যায় না। এই update-এ Service Worker cache যোগ করা হয়েছে:

- returning visitor-এর cached shell instant load হতে পারে
- public content/articles cached থাকে
- background-এ Render service wake/update হতে পারে
- static CSS/JS/theme offline-friendly cache পায়

প্রথমবার আসা visitor-এর browser-এ cache না থাকলে Render cold start এখনও হতে পারে। একেবারে zero-sleep public site চাইলে public frontend-কে Static Site/edge hosting-এ split করতে হবে এবং Render-কে শুধু backend হিসেবে রাখতে হবে।

## Deploy
Updated files existing GitHub project folder-এর উপর Replace করুন, তারপর:

```powershell
git status
git add .
git commit -m "Add themes events pet translation and session timeout"
git push origin main
```

Render automatic deploy না করলে:

Render Dashboard → Manual Deploy → Deploy latest commit

## Important
`.env` GitHub-এ push করবেন না। Production Supabase secret শুধু Render Environment-এ রাখবেন।
