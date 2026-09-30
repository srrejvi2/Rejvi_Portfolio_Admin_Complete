# পুরোনো Portfolio থেকে Version 2-এ Upgrade

আপনার পুরোনো website কাজ করছে, তাই আবার admin account তৈরি করতে হবে না। নিচের পদ্ধতিতে আপনার login, লেখা, ছবি, CV ও contact messages রাখা যাবে।

1. পুরোনো website-এর Command Prompt-এ **Ctrl+C** দিয়ে server বন্ধ করুন।
2. পুরোনো `Rejvi-Portfolio` folder-এর সম্পূর্ণ একটি backup অন্য জায়গায় রাখুন।
3. নতুন ZIP একটি **আলাদা folder-এ** extract করুন। পুরোনো folder-এর ওপর extract করবেন না।
4. পুরোনো folder-এর **`data`** folder copy করে নতুন `Rejvi-Portfolio` folder-এর ভেতরে paste করুন। এই folder-এ database ও uploaded ছবি/CV থাকে।
5. পুরোনো `.env` file তৈরি করে থাকলে সেটিও নতুন folder-এ copy করুন। `DATA_DIR` আলাদা কোথাও set করা থাকলে আগের একই directory ব্যবহার করুন; সেই directory-র backup রাখুন।
6. নতুন `Rejvi-Portfolio` folder-এর address bar-এ `cmd` লিখে Enter চাপুন।
7. লিখুন:

```bat
npm start
```

`.env` ব্যবহার না করলে এটিও চলবে:

```bat
node server.mjs
```

8. Command Prompt খোলা রাখুন। Browser-এ `http://localhost:3000` খুলে **Ctrl+Shift+R** চাপুন। Admin: `http://localhost:3000/admin`।
9. **আগের email/password দিয়েই login করুন।** নতুন database tables প্রথমবার স্বয়ংক্রিয়ভাবে তৈরি হবে।

## নতুন কোন কাজ কোথায় করবেন

| Admin section | কাজ |
|---|---|
| Profile | নাম, পরিচিতি, animated text, ছবি, CV, email/social links |
| Projects | Project overview, challenge, approach, outcome, gallery, draft/published |
| Pages | Page title/menu text, show/hide, order, custom page |
| Home layout | Home section-এর order ও visibility |
| Appearance | Branding, accent color, typography, corners, animations, swiping, forms |
| Website text | Main headings, buttons, labels, privacy text, form messages |
| Articles | Article লিখুন, Preview দেখুন, Draft বা Published করুন |
| Comments | Comment approve/hide/delete ও public reply |
| Media | ছবি/PDF upload, পুরোনো asset নির্বাচন, URL copy |
| Settings | Login email/password, export, website content history |

## Article প্রকাশ

1. **Articles → Write article**।
2. Title, content, category, excerpt ও cover দিন। বাংলা লেখা যায়।
3. **URL slug** ইংরেজি ছোট অক্ষর/সংখ্যা/hyphen দিয়ে লিখুন, যেমন `my-first-article`।
4. **Preview** দেখে নিন। Status **Published** করে **Save article** চাপুন।
5. পাঠক `/articles` পেজ থেকে পড়তে পারবেন। Draft থাকলে শুধু admin দেখতে পারবেন।

Markdown toolbar দিয়ে heading, bold, list, code block ও quote যোগ করতে পারবেন। Raw HTML বা embedded scripts চালানো হয় না।

## Comment ও reply

পাঠক নাম, email এবং comment দেবেন। Comment শুরুতে **Pending** থাকবে। **Comments → Approve & save reply** করলে comment ও আপনার reply article-এর নিচে দেখা যাবে। Email address শুধু admin দেখতে পারবেন। Email self-reported; verification করা হয় না। Reply স্বয়ংক্রিয় email হিসেবে পাঠানো হয় না।

Reaction একটি browser cookie দিয়ে মনে রাখা হয়। একজন একই browser-এ reaction বদলাতে বা সরাতে পারেন। এটি verified-person voting নয়; cookie মুছে দিলে বা অন্য browser ব্যবহার করলে নতুন visitor হিসেবে গণনা হতে পারে।

## Save করার নিয়ম

- Profile, pages, layout, collections ও appearance: **Save website**।
- Article: নিজস্ব **Save article**।
- Comment moderation ও inbox actions: সঙ্গে সঙ্গে save হয়।
- Media upload: সঙ্গে সঙ্গে file save হয়; field-এ ব্যবহার করলে তারপর website/article save করুন।
- Shortcut: **Ctrl+S** / **Cmd+S**।
- একাধিক tab-এ একই content edit করলে conflict দেখাতে পারে। আগে পরিবর্তন অন্যত্র copy করে রাখুন, তারপর reload করে সর্বশেষ version edit করুন।

## Animations ও page swiping

Page link-এ click করলে slide transition, scroll করলে reveal এবং Home-এ animated tagline আছে। Mobile-এ page-এর নিচের Previous/Next navigation strip-এর ওপর ডানে/বামে swipe করে page বদলানো যাবে। Article পড়ার সময় accidental swipe এড়াতে পুরো screen জুড়ে swipe রাখা হয়নি। Reduced-motion পছন্দ করা device-এ animations কমে যাবে।

## কী editable, কী source-level

Admin থেকে portfolio content, built-in page titles, navigation order/visibility, custom pages, text labels, social links, media, accent/font/corners ও section order বদলানো যায়। একেবারে নতুন widget, ভিন্ন layout engine, custom JavaScript, authentication logic বা server behavior বদলাতে source code edit লাগবে। এটি drag-and-drop arbitrary-code website builder নয়।

## সমস্যা হলে

- `ERR_CONNECTION_REFUSED`: server চালু আছে কি না দেখুন।
- Port busy: পুরোনো server-এর window-তে Ctrl+C দিন।
- `.bat` Windows-এ block হলে: ওই file চালানোর প্রয়োজন নেই; folder থেকে CMD খুলে `npm start` দিন। Windows Security বন্ধ করবেন না।
- Node missing: Node.js 24+ install করে নতুন CMD খুলুন।
- পুরোনো design দেখা গেলে: Ctrl+Shift+R দিন।
- Data দেখা না গেলে: নতুন server কোন `data` / `DATA_DIR` ব্যবহার করছে দেখুন; backup মুছবেন না।

পরে public hosting-এ deploy করার জন্য README.md-এর নির্দেশনা অনুসরণ করুন। Localhost শুধু আপনার computer-এর local website।
