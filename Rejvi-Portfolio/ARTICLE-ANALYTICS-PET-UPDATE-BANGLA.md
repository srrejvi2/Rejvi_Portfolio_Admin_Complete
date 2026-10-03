# Article + Analytics + Living Pet Update

এই build আগের FAQ/branding/theme/Supabase features-এর উপর তৈরি। আগের project data replace বা reset করে না।

## নতুন কী আছে

- 20টি bundled professional English technology essay। প্রথম deploy-এ existing database-এ missing article হিসেবে একবার add হবে। পরে admin থেকে edit/delete করলে restart-এ আবার ফিরে আসবে না।
- প্রতিটি article-এর custom text thumbnail এবং একটি concept-map image আছে `public/article-media/`-এ।
- Article editor-এ cover image-এর পাশাপাশি article body-তে image Upload এবং existing Media থেকে image insert করা যায়।
- Article শেষে Subscribe form এবং Contact CTA আছে। Subscriber email Admin → Subscribers-এ দেখা ও remove করা যায়।
- Admin Overview-এ Unique visitors, Total visits, Subscribers count আছে। Unique visitor একটি anonymous first-party browser identifier; এটি real account identity নয়।
- Article page-এ protected-reading deterrence: selection/copy/context menu/print/common shortcuts block করার চেষ্টা করে এবং page blur হলে article blur হয়।
- Share Article Web Share API ব্যবহার করে; unsupported browser-এ link copy fallback হয়।
- Pet list বড় করা হয়েছে এবং pet এখন viewport-এর বিভিন্ন জায়গায় roam করে, scroll speed/direction অনুযায়ী mood দেখায়, click-এ animal-like synthesized sound করে, এবং rapid click করলে 5-second full-screen sprint হয়।

## Screenshot protection সম্পর্কে গুরুত্বপূর্ণ সত্য

Normal website JavaScript/CSS দিয়ে operating-system screenshot, external camera, browser extension, developer tools, বা screen recorder সম্পূর্ণ বন্ধ করা যায় না। এই build browser-level copy/selection/print/common shortcut deterrence দেয়, কিন্তু 100% screenshot prevention claim করে না।

## Article originality

Articles এই project-এর জন্য নতুন করে লেখা ও আলাদা topic/structure-এ তৈরি। তবে পৃথিবীর সব published text-এর সাথে zero phrase overlap বা কোনো AI detector-এর result guarantee করা technically সম্ভব নয়।

## Deploy

Existing `Rejvi-Portfolio` folder-এর উপর এই ZIP-এর files replace করুন। তারপর:

```powershell
git status
git add .
git commit -m "Add 20 articles analytics subscriptions and living pets"
git push origin main
```

Render auto deploy না হলে **Manual Deploy → Deploy latest commit** দিন। Deploy শেষে browser hard refresh করুন। Service worker cache version update করা হয়েছে।
