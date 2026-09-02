# معرفی‌نامهٔ رسمی و مستند محصول VoxelCraft

> **وضعیت سند:** مبتنی بر پیاده‌سازی موجود در همین workspace
>
> **منابع اصلی بررسی‌شده:** `client/index.html`، `server.js`، `build-client.js` و تست‌های `test/`
>
> این متن صرفاً یک توصیف تبلیغاتی یا طرح آینده نیست؛ جزئیات عددی، نام پیام‌ها، محدودیت‌ها و رفتارهای رد درخواست تا حد امکان از implementation واقعی VoxelCraft استخراج شده است. هر جا رفتاری هنوز در کد به‌صورت کامل فعال نشده یا با معنای رایج یک بازی Minecraft تفاوت دارد، صریحاً مشخص شده است.

---

## فهرست مطالب

1. [چکیدهٔ اجرایی](#چکیدهٔ-اجرایی)
2. [هویت، ژانر و وعدهٔ محصول](#هویت-ژانر-و-وعدهٔ-محصول)
3. [چرخهٔ اصلی تجربهٔ بازیکن](#چرخهٔ-اصلی-تجربهٔ-بازیکن)
4. [مشخصات فنی کلیدی](#مشخصات-فنی-کلیدی)
5. [جهان، seed و تولید نقشه](#جهان-seed-و-تولید-نقشه)
6. [فهرست کامل Block Registry](#فهرست-کامل-block-registry)
7. [حرکت، Physics و Collision](#حرکت-physics-و-collision)
8. [حالت‌های Creative و Survival و سلامت](#حالتهای-creative-و-survival-و-سلامت)
9. [رندر سه‌بعدی و ساخت Mesh](#رندر-سهبعدی-و-ساخت-mesh)
10. [Texture Atlas، نور، آسمان و افکت‌ها](#texture-atlas-نور-آسمان-و-افکتها)
11. [کنترل‌ها و رابط کاربری](#کنترلها-و-رابط-کاربری)
12. [Mining، Placing و تعامل با اشیا](#mining-placing-و-تعامل-با-اشیا)
13. [نقشهٔ زنده و رندر Satellite](#نقشهٔ-زنده-و-رندر-satellite)
14. [Multiplayer و قرارداد WebSocket](#multiplayer-و-قرارداد-websocket)
15. [Claim، مالکیت و Permission](#claim-مالکیت-و-permission)
16. [کیف پول، Ledger و اقتصاد](#کیف-پول-ledger-و-اقتصاد)
17. [Property، Market و Escrow](#property-market-و-escrow)
18. [Rental و قرارداد اجاره](#rental-و-قرارداد-اجاره)
19. [Business و درآمدزایی](#business-و-درآمدزایی)
20. [Company و مالکیت سازمانی](#company-و-مالکیت-سازمانی)
21. [Premium Land Auction](#premium-land-auction)
22. [Prefab Store و ساخت سریع](#prefab-store-و-ساخت-سریع)
23. [NPC Construction و ساخت مرحله‌ای](#npc-construction-و-ساخت-مرحلهای)
24. [Persistence، امنیت و استقرار](#persistence-امنیت-و-استقرار)
25. [سناریوهای کامل استفاده](#سناریوهای-کامل-استفاده)
26. [مرزهای فعلی محصول و نکات شفافیت](#مرزهای-فعلی-محصول-و-نکات-شفافیت)
27. [نقشهٔ معماری سورس](#نقشهٔ-معماری-سورس)

---

## چکیدهٔ اجرایی

**VoxelCraft** یک sandbox voxel تحت وب است که در آن جهان از مکعب‌های قابل ساخت، خراب‌کردن، نورپردازی و مالکیت تشکیل می‌شود. بازیکن می‌تواند در یک دنیای تک‌نفرهٔ محلی، بدون نیاز به حساب، زمین را ببیند و بسازد؛ یا با ایجاد/ورود به حساب، به یک سرور WebSocket وصل شود و در جهانی مشترک با بازیکنان دیگر، claim، ملک، کسب‌وکار، اجاره، بازار، شرکت، مزایده و ساخت‌وساز NPCمحور را مدیریت کند.

هویت اصلی محصول از سه لایه ساخته شده است:

- **جهان طبیعی:** terrain ارتفاع‌محور، biome، رودخانه، غار، cavern، ore، درخت، cactus و کابین‌های landmark.
- **آزادی ساخت:** registry کامل blockها، hotbar نه‌تایی، inventory، mining با hardness، placing، door و lantern.
- **لایهٔ اجتماعی/اقتصادی:** بازیکنان صاحب قطعه می‌شوند، روی آن property می‌سازند، ارزش‌گذاری می‌کنند، آن را می‌فروشند یا اجاره می‌دهند و می‌توانند Shop، Hotel، Gallery یا Workshop راه‌اندازی کنند.

در multiplayer، **سرور مرجع نهایی** برای موقعیت بازیکن، mode، edit، object interaction، claim، wallet و معامله است. کلاینت برای روانی تصویر، بعضی editها را optimistic نمایش می‌دهد؛ اما در صورت رد سرور، باید آن‌ها را با `blockUpdate`، `editRejected` یا recovery موقعیت اصلاح کند.

---

## هویت، ژانر و وعدهٔ محصول

### نام و سبک

- **نام:** VoxelCraft
- **سبک:** sandbox voxel، ساخت‌وساز آزاد، اکتشاف، مالکیت زمین و اقتصاد اجتماعی
- **پلتفرم فعلی:** مرورگر مدرن با WebGL
- **رندر:** Three.js روی WebGL
- **شبکه:** WebSocket برای جهان مشترک و HTTP API برای map، economy و عملیات مدیریتی
- **مقیاس تجربه:** تک‌نفرهٔ محلی یا multiplayer با حداکثر پیش‌فرض **۲۰ بازیکن هم‌زمان** (`MAX_PLAYERS` قابل تنظیم است).

### جهان قابل ساخت

بازیکن با یک world خالی و تخت روبه‌رو نمی‌شود؛ جهان با seed ساخته می‌شود و از terrain چندلایه، سطح آب، پوشش زیست‌بومی، غار و ساختارهای کوچک شکل می‌گیرد. پس از ورود، بازیکن می‌تواند هر ستون را با editهای خود تغییر دهد. تفاوت حیاتی محصول با یک تصویر ثابت این است که هر ساخت بازیکن بخشی از state مؤثر جهان می‌شود و در multiplayer برای سایر بازیکنان نیز ارسال می‌گردد.

### تفاوت Singleplayer و Multiplayer

| موضوع | Singleplayer محلی | Multiplayer سروری |
|---|---|---|
| حساب | لازم نیست | Username، Password و Display Name لازم است |
| mode | با `C` یا دکمهٔ Mode قابل تغییر | سرور تعیین می‌کند؛ کلاینت حق تغییر مستقل ندارد |
| زمین | محلی و آزاد | Claim و permission برای build/use لازم است |
| ذخیره | `localStorage` و فایل `.voxelcraft.json` | world JSON، profile، account، ledger و SQLite/JSON سمت سرور |
| edit | مستقیماً روی world محلی | optimistic در کلاینت، commit نهایی در سرور |
| اقتصاد | داشبوردهای سروری در دسترس نیستند | Wallet، market، rental، business، company و auction فعال‌اند |
| بازیکنان دیگر | وجود ندارند | `players` و remote player state دریافت می‌شود |
| منبع map | local Worker یا fallback محلی | ابتدا server raster؛ در صورت خطا fallback محلی |

### هدف کلی بازیکن

هدف واحد و اجباری وجود ندارد. محصول برای چند انگیزه طراحی شده است:

1. پیدا کردن یک biome مناسب و تعیین محل اقامت؛
2. استخراج و شکل‌دادن terrain با blockها؛
3. ساخت خانه، کارگاه، فروشگاه یا landmark شخصی؛
4. گرفتن Claim و محافظت از ساخت؛
5. تحلیل و افزایش ارزش property؛
6. کسب Coin از visitor، NPC traffic، اجاره و فروش؛
7. همکاری در Company یا رقابت بر سر Premium Land؛
8. توسعهٔ تدریجی شهر با prefab و NPC construction.

---

## چرخهٔ اصلی تجربهٔ بازیکن

### چرخهٔ پایه

```text
ورود به جهان
   ↓
خواندن terrain / biome / map
   ↓
حرکت، اکتشاف، انتخاب محل
   ↓
گرفتن Claim یا خرید Property
   ↓
ساخت با block، prefab یا قرارداد NPC
   ↓
تحلیل property و تجهیز objectها
   ↓
ثبت business، اجاره یا listing در market
   ↓
کسب Coin، ارتقای ساختمان و گسترش شهر
```

### یک جلسهٔ نمونه

1. بازیکن seed را می‌بیند و با map، یک منطقهٔ plains نزدیک رودخانه پیدا می‌کند.
2. با `W/A/S/D` و jump به محل می‌رود و با `M` نقشهٔ کامل را باز می‌کند.
3. با ابزار Claim، قطعهٔ ۱۶×۱۶ را preview می‌کند.
4. اگر اولین Claim باشد، قیمت زمین صفر است؛ در غیر این صورت quote بر پایهٔ tier، biome، فاصله از spawn، landmark و demand اعلام می‌شود.
5. با blockهای چوبی کف و دیوار می‌سازد، door و lantern می‌گذارد، سپس property را analyze می‌کند.
6. اگر ساختمان کامل باشد، یک Shop یا Workshop ثبت می‌کند.
7. برای Workshop می‌تواند یک NPC construction plan سفارش دهد؛ برای Shop نیز visitorهای واقعی و NPCها درآمد ایجاد می‌کنند.
8. ملک را اجاره می‌دهد یا با premium بین ۱ تا ۱۰۰ درصد در market عرضه می‌کند.

---

## مشخصات فنی کلیدی

| پارامتر | مقدار واقعی در قرارداد فعلی |
|---|---:|
| `physics.version` | `1` |
| اندازهٔ chunk | `16 × 16` ستون افقی |
| ارتفاع جهان | `80` واحد (`y = 0..79`) |
| سطح دریا | `y = 30` |
| ارتفاع مجاز flight | حداکثر `1000` |
| ارتفاع بازیکن | `1.8` |
| نیمه‌عرض AABB | `0.3` |
| ارتفاع auto-step | `1.05` |
| سرعت walk | `4.4` |
| سرعت sprint | `6.6` |
| سرعت water | `3.4` |
| سرعت flight | `13` |
| tick قراردادی سرور | `50 ms` |
| حداقل فاصلهٔ ارسال player state | `20 ms` |
| شعاع raycast کلاینت | `6.5` |
| فاصلهٔ اعتبار edit در سرور | `8.5` از مرکز بازیکن |
| Claim | `16 × 16` |
| سلامت | `100 / 100` |
| hotbar | `9` slot |
| کمیسیون market | `5%` |
| حداکثر مدت rental | `30` cycle پیش‌فرض، قابل تنظیم تا `365` |
| حداکثر عضو Company | `16` پیش‌فرض |
| حداکثر صف construction | `3` قرارداد فعال برای هر مالک |

این اعداد در پیام `hello` و `joined` با `PHYSICS_CONFIG` ارسال می‌شوند تا client و server دو قرارداد جداگانه و ناسازگار نداشته باشند.

---

## جهان، seed و تولید نقشه

### Seed و deterministic generation

seed پیش‌فرض فعلی در world server برابر `18699877` است، مگر با `WORLD_SEED` یا فایل world تغییر کند. کلاینت و سرور از seed برای ساخت noise permutation، hashهای دوبعدی/سه‌بعدی و تصمیم‌های deterministic استفاده می‌کنند. نتیجه:

- دو کلاینت برای یک seed، terrain پایهٔ یکسان می‌بینند؛
- server می‌تواند بدون نگهداری کل voxelها، `serverBlockIdAt(x,y,z)` را محاسبه کند؛
- editهای بازیکن جدا از base terrain نگهداری می‌شوند؛
- تغییر seed، هویت جهان را تغییر می‌دهد و cacheهای map/terrain باید invalid شوند.

در implementation از `mulberry32` برای ساخت permutation و از noiseهای interpolated برای `fbm2` و `n3` استفاده شده است. بنابراین world تصادفیِ غیرقابل‌بازسازی نیست؛ **تصادفی به‌نظر می‌رسد ولی برای seed ثابت قابل تکرار است**.

### Chunk و حافظهٔ voxel

هر chunk یک آرایهٔ `Uint8Array` با اندازهٔ زیر دارد:

```text
16 × 16 × 80 = 20,480 voxel
```

indexگذاری به شکل فشردهٔ زیر است:

```text
(y << 8) | (z << 4) | x
```

یعنی ۸ بیت برای صفحهٔ ۱۶×۱۶ و بعد y. سرور chunk پایه را lazy و cacheشده تولید می‌کند؛ کلاینت نیز فقط chunkهای نزدیک render distance را stream می‌کند.

### ارتفاع terrain

برای هر ستون `(x,z)` چند مؤلفهٔ noise ترکیب می‌شود:

- `cont`: قاره/پستی‌وبلندی بزرگ‌مقیاس با فرکانس `0.0015` و ۴ octave؛
- `hills`: تپه‌های کوچک‌تر با فرکانس `0.011` و ۳ octave؛
- `mRaw` و `mMask`: mask کوهستان با فرکانس `0.0008`؛
- `ridge`: مؤلفهٔ ridge با فرکانس `0.0055`؛
- `riverNoise` و `river`: نوارهای رودخانه؛
- `temp` و `humid`: دما و رطوبت برای biome.

فرمول ارتفاع، به‌صورت مفهومی و نزدیک به خود کد:

```text
h = SEA_LEVEL + 3
    + cont * 10
    + hills * 4.5
    + mMask * (ridge * ridge * 46)

اگر h < SEA_LEVEL + 24:
    h -= river * 9

h = floor(clamp(h, 4, WORLD_HEIGHT - 4))
```

پس سطح پایه حدود sea level است، ولی کوهستان می‌تواند ده‌ها واحد بالاتر برود و رودخانه در terrain کم‌ارتفاع شیار ایجاد می‌کند.

### Biomeها

| Biome | قاعدهٔ تشخیص | سطح معمول و هویت بصری |
|---|---|---|
| `plains` | حالت پیش‌فرض پس از عبور از شرط‌های دیگر | Grass، خاک، درخت پراکنده، محل مناسب برای ساخت |
| `forest` | `humid > .17` | درختان oak متراکم‌تر و پوشش سبز |
| `desert` | `temp > .22` و `humid < .06` | Sand، sandstone در ساخت‌ها و cactus |
| `snowy` | `temp < -.30` | Snow Block، spruce و فضای سرد |
| `mountains` | `h > SEA + 36` | سنگ، قله‌های بلند و snow در ارتفاع بیشتر |
| `river` | ارتفاع کم و `river > .35` | آب، sand/gravel، پهنهٔ جداکنندهٔ طبیعی |

ترتیب شرط مهم است: ابتدا river کم‌ارتفاع، بعد mountains، سپس desert، snowy، forest و در نهایت plains.

### لایه‌های surface، subsurface، stone و bedrock

برای هر ستون:

1. سطح (`y = h`) با biome تعیین می‌شود.
2. چند لایهٔ زیر سطح با dirt، sand یا gravel پر می‌شود.
3. عمق بیشتر stone است.
4. `y = 0` همیشه Bedrock است و بعضی voxelهای نزدیک کف نیز با hash به Bedrock تبدیل می‌شوند.
5. اگر `h < SEA_LEVEL` باشد، فضای بین سطح terrain و سطح دریا با Water پر می‌شود.
6. ستون‌های کم‌ارتفاع رودخانه معمولاً Sand یا Gravel می‌گیرند.
7. desert از Sand و subsurface شنی استفاده می‌کند؛ snowy سطح Snow Block می‌گیرد؛ mountains در ارتفاع زیاد Snow و در بخش‌های پایین Stone دارد.

### Cave، cavern، lava و ore

#### Cave و cavern

تابع `serverCaveAt(wx,y,wz)` از دو noise سه‌بعدی ترکیبی استفاده می‌کند:

- شرط اصلی: اگر `a*a + b*b < .0022` باشد، حفره ایجاد می‌شود؛
- در عمق‌های کمتر از `y=26`، یک مؤلفهٔ دیگر با آستانهٔ `>.55` cavernهای ثانویه ایجاد می‌کند؛
- زیر `y=3` هیچ cave ایجاد نمی‌شود؛
- در مسیر تولید، voxelهای طبیعیِ جامد در صورت cave به Air تبدیل می‌شوند؛
- در عمق بسیار پایین و با hash مناسب، بعضی caveهای کم‌ارتفاع Glowstone می‌گیرند.

#### Ore

Ore فقط هنگام برخورد با Stone پایه بررسی می‌شود و بر اساس hash سه‌بعدی/کم‌مقیاس جای‌گذاری می‌گردد:

| Ore | قاعدهٔ عمقی/احتمالی پیاده‌سازی |
|---|---|
| Diamond Ore | `y < 14` و noise بسیار بالا، حدود `>.9970` |
| Gold Ore | `y < 26` و noise `>.9952` |
| Iron Ore | `y < 50` و noise `>.9905` |
| Coal Ore | در سایر نواحی با noise `>.9835` |
| Lava pocket | `y < 22` و noise بسیار پایین، حدود `<.004` |

این‌ها drop/inventory recipe جداگانه ندارند؛ در registry به‌عنوان voxel قابل مشاهده، استخراج و استفاده در ساخت حضور دارند.

### Vegetation و ساختارهای طبیعی

- در `forest` تراکم درخت حدود `0.055` است.
- در `snowy` تراکم spruce حدود `0.030` است.
- در `plains` تراکم oak حدود `0.010` است.
- در برخی حالات پشتیبان، تراکم کم‌تر حدود `0.004` نیز دیده می‌شود.
- در desert، cactus با chance حدود `0.006` و ارتفاع ۲ تا ۳ واحد تولید می‌شود.
- در river، cactus در محدودهٔ نزدیک سطح آب و با chance کم قرار می‌گیرد.
- oak از Oak Log و Oak Leaves ساخته می‌شود؛ spruce از Spruce Log و Spruce Leaves.
- تولید vegetation برای جلوگیری از crop شدن در مرز chunk، با حاشیهٔ `M=4` اجرا می‌شود؛ در نتیجه شاخه/برگ و ساختارهای نزدیک مرز، فقط متعلق به یک chunk قابل مشاهده نیستند.

### Cabin و Landmark

هر chunk با hash `serverH2(cx,cz,901) < .035` شانس داشتن cabin دارد. chunk `(0,0)` به‌عنوان showcase cabin ویژه است. cabin فقط در plains/forest مناسب، زمین خشک و نسبتاً صاف ساخته می‌شود؛ footprint تقریبی آن از `(3,3)` با عرض ۱۰ و عمق ۹ آغاز می‌شود.

کابین از Oak Planks، سقف Dark Oak، Wooden Door، Glass، Lantern و objectهایی مثل crate، barrel، sign و bench تشکیل می‌شود. این ساخت‌ها:

- در map با marker کابین نمایش داده می‌شوند؛
- ممکن است به‌عنوان landmark عمومی قابل تعامل باشند؛
- برای claim، prefab و NPC construction حریم حفاظتی/عدم‌هم‌پوشانی ایجاد می‌کنند؛
- با edit بازیکن یکی نیستند و در محاسبهٔ effective world لحاظ می‌شوند.

### Base terrain، player edit و effective voxel

سه مفهوم باید از هم جدا بماند:

1. **Base terrain:** خروجی deterministic generator از seed.
2. **Player edit:** رکورد `world.edits[key]` با key برابر `x,y,z` که می‌تواند block را به id جدید یا Air (`0`) تبدیل کند.
3. **Effective voxel:** نتیجهٔ نهایی `serverBlockIdAt`؛ اگر edit وجود داشته باشد edit بر base مقدم است، وگرنه base خوانده می‌شود.

این تفکیک باعث می‌شود world بزرگ را با ذخیرهٔ تنها تغییرها نگه داشت، ولی map، collision، object validation و property analyzer همچنان تصویر واقعی و ویرایش‌شدهٔ جهان را ببینند.

### Persistence و import/export جهان

در حالت محلی، snapshot شامل این موارد است:

- `format` و `version`؛
- seed و `dayTime`؛
- mode و وضعیت fly؛
- hotbar و slot فعال؛
- موقعیت، yaw و pitch؛
- spawn؛
- doorهای باز و lanternهای خاموش؛
- تنظیمات graphics؛
- overrideهای فشردهٔ chunk.

ذخیره در `localStorage` انجام می‌شود، با `DOWNLOAD WORLD FILE` فایل JSON با پسوند `.voxelcraft.json` ساخته می‌شود و `OPEN WORLD FILE` آن را از طریق `FileReader` وارد می‌کند. seed نامعتبر، ساختار خراب یا id خارج از registry رد می‌شود.

---

## فهرست کامل Block Registry

### قرارداد خواندن جدول

- **ID صفر:** Air است و در فهرست ۵۱ block registry نمی‌آید.
- **IDهای ۱ تا ۵۱:** تمام شناسه‌های تعریف‌شدهٔ فعلی هستند.
- **Hardness:** عدد registry است؛ در Survival زمان استخراج از رابطهٔ `0.55 × hardness` ثانیه به‌دست می‌آید. این عدد لزوماً قدرت ابزار Minecraft استاندارد نیست.
- **شفاف:** در mesher در دستهٔ alpha/transparent قرار می‌گیرد.
- **مایع:** برای collision جامد نیست و raycast عادی آن را target نمی‌کند.
- **Emit:** در مسیر نور/روشنایی با vertex brightness کامل‌تر رسم می‌شود.
- **قابل تخریب:** همهٔ blockها به‌جز Bedrock؛ Water و Lava در منطق place می‌توانند با قرارگیری block جایگزین شوند، اما استخراج معمولی‌شان مثل block جامد نیست.

### Air و Bedrock

| شناسه | نام | نقش |
|---:|---|---|
| `0` | Air | فضای خالی، عبورپذیر، قابل مشاهده نیست، هدف معمول raycast نیست و برای break به‌عنوان خروجی استفاده می‌شود. |
| `22` | Bedrock | سنگ پایهٔ تیره و غیرقابل‌تخریب؛ hardness ثبت‌شده `99` است اما سرور با `unbreakable_block` و کلاینت با پیام «Bedrock cannot be broken» آن را رد می‌کنند. |

### جدول خلاصهٔ فنی

| ID | نام نمایش/English | ظاهر و texture واقعی | رفتار و نقش | شفاف/مایع | Hardness | تخریب/ساخت |
|---:|---|---|---|---|---:|---|
| 1 | Grass Block | سطح سبز Grass، side ترکیب سبز/خاک، bottom خاک | سطح معمول plains و forest | جامد | 1 | هر دو |
| 2 | Dirt | قهوه‌ای دانه‌دار با jitter روی پیکسل‌ها | لایهٔ زیر grass و مادهٔ پرکننده | جامد | 1 | هر دو |
| 3 | Stone | خاکستری با grain تصادفی | بدنهٔ اصلی زیرزمین و میزبان ore/cave | جامد | 1.6 | هر دو |
| 4 | Cobblestone | قطعه‌های سنگی شبکه‌ای با لبه‌های تیره | ساخت‌وساز سنگی و مسیر/دیوار | جامد | 1.6 | هر دو |
| 5 | Sand | زرد-کرم دانه‌دار | سطح desert، river و ساحل/پرکننده | جامد | 1 | هر دو |
| 6 | Gravel | دانه‌های خاکستری با چند shade | بستر river و مصالح خشن | جامد | 1 | هر دو |
| 7 | Oak Log | side چوبی قهوه‌ای، top دارای حلقه | تنهٔ oak و مصالح چوبی | جامد | 1.3 | هر دو |
| 8 | Oak Leaves | تاج سبز با لکه‌های روشن/تیره | پوشش درخت oak | شفاف‌نما/alpha | 0.4 | هر دو |
| 9 | Spruce Log | همان الگوی تنه با رنگ سردتر در کاربرد spruce | تنهٔ spruce در snowy | جامد | 1.3 | هر دو |
| 10 | Spruce Leaves | برگ‌های سبز تیره‌تر و سردتر | تاج spruce مخروطی | شفاف‌نما/alpha | 0.4 | هر دو |
| 11 | Oak Planks | تختهٔ طلایی با seamهای افقی و تیرگی در اتصال | کف، دیوار، cabin و prefab | جامد | 1.2 | هر دو |
| 12 | Dark Oak Planks | تختهٔ قهوه‌ای تیره | سقف cabin و ساخت‌های رسمی | جامد | 1.2 | هر دو |
| 13 | Bricks | آجر قرمز با mortar روشن | دیوار تزئینی و معماری شهری | جامد | 1.7 | هر دو |
| 14 | Stone Bricks | آجر سنگی خاکستری با mortar تیره | قلعه، دیوار و ساخت مقاوم | جامد | 1.7 | هر دو |
| 15 | Mossy Cobblestone | Cobblestone با لکه‌های moss سبز | ویرانه/دکور طبیعی | جامد | 1.6 | هر دو |
| 16 | Sandstone | سنگ ماسه‌ای کرم با خطوط کم‌رنگ | سازه‌های desert و دکور | جامد | 1.4 | هر دو |
| 17 | Snow Block | سفید روشن با نویز ظریف | پوشش snowy و دکور زمستانی | جامد | 1 | هر دو |
| 18 | Ice | آبی-سفید نیمه‌شفاف با شکست‌های روشن | یخ و سطح لغزندهٔ بصری؛ solid محسوب می‌شود | شفاف | 0.6 | هر دو |
| 19 | Glass | لبهٔ روشن و داخل تقریباً شفاف با diagonal highlight | پنجره و سازهٔ نورگیر | شفاف | 0.4 | هر دو |
| 20 | Water | موج آبی با دو shade سینوسی | سطح دریا، river و swimming | شفاف، مایع | 99 | جایگزین/ویرایش؛ target معمول mining نیست |
| 21 | Lava | نارنجی/قرمز با درخشش متغیر | pocketهای عمیق و خطر محیطی/بصری | مایع، نورده | 99 | جایگزین/ویرایش؛ target معمول mining نیست |
| 22 | Bedrock | خاکستری بسیار تیره با لکه‌های تصادفی | کف محافظ جهان | جامد | 99 | غیرقابل‌تخریب، ساخت دستی ممنوع |
| 23 | Coal Ore | Stone با لکه‌های سیاه | منبع سنگی و resource | جامد | 2 | هر دو |
| 24 | Iron Ore | Stone با لکه‌های قهوه‌ای/نارنجی | resource فلزی میانی | جامد | 2.4 | هر دو |
| 25 | Gold Ore | Stone با لکه‌های طلایی | resource ارزشمند | جامد | 2.4 | هر دو |
| 26 | Diamond Ore | Stone با لکه‌های cyan/فیروزه‌ای | resource بسیار کمیاب | جامد | 2.8 | هر دو |
| 27 | Obsidian | بنفش-مشکی با highlightهای تیره | مصالح مقاوم و دکور ویژه | جامد | 4 | هر دو |
| 28 | Glowstone | زرد درخشان با دانه‌های روشن/تیره | نور طبیعی داخل cave یا ساخت | جامد، نورده | 0.6 | هر دو |
| 29 | Cactus | side سبز خاردار و top جدا | vegetation desert، با ارتفاع چند واحد | جامد | 0.6 | هر دو |
| 30 | Crafting Table | top/side مخصوص و bottom چوبی | block utility و نشانهٔ فضای کار | جامد | 1.2 | هر دو |
| 31 | TNT | top و side قرمز/خاکستری | block نمایشی/utility؛ انفجار recipe در این registry پیاده نشده | جامد | 0.4 | هر دو |
| 32 | Quartz Block | سفید مایل به روشن، سطح یکدست | دکور معماری مدرن | جامد | 1.5 | هر دو |
| 33 | Block of Iron | خاکستری فلزی یکدست | بلوک resource فشرده و سازه‌ای | جامد | 2.5 | هر دو |
| 34 | Block of Gold | طلایی یکدست | دکور ارزشمند و storage بصری | جامد | 2.2 | هر دو |
| 35 | Block of Diamond | آبی-فیروزه‌ای درخشان | دکور/نمایش ثروت | جامد | 2.8 | هر دو |
| 36 | White Wool | سفید نرم با jitter | دکور و palette روشن | جامد | 0.5 | هر دو |
| 37 | Red Wool | قرمز روشن و نرم | دکور، پرچم و رنگ‌گذاری | جامد | 0.5 | هر دو |
| 38 | Blue Wool | آبی روشن/متوسط | دکور و رنگ‌گذاری | جامد | 0.5 | هر دو |
| 39 | Yellow Wool | زرد گرم | دکور و نشانه‌گذاری | جامد | 0.5 | هر دو |
| 40 | Green Wool | سبز | دکور و رنگ‌گذاری | جامد | 0.5 | هر دو |
| 41 | Black Wool | سیاه/تیره | کنتراست، قاب و دکور | جامد | 0.5 | هر دو |
| 42 | Dirt Path | سطح path و side dirt | کف‌سازی و مسیر شهری | جامد | 0.8 | هر دو |
| 43 | Wood Fence | بافت چوبی fence | مرزبندی، حصار و محوطه | جامد | 1 | هر دو |
| 44 | Wooden Door | panel چوبی | object تعاملی؛ open/closed و گذرپذیری وابسته به state | جامد در حالت بسته | 1 | هر دو |
| 45 | Lantern | texture نورانی | object utility؛ on/off و emit | جامد/نورده | 0.4 | هر دو |
| 46 | Crate | جعبهٔ چوبی با texture crate | object storage/interaction | جامد | 0.8 | هر دو |
| 47 | Barrel | چوبی با فرم barrel | object storage/interaction | جامد | 1 | هر دو |
| 48 | Sign | صفحهٔ sign | object خواندنی/interactive؛ متن persistent جداگانه ندارد | جامد | 0.5 | هر دو |
| 49 | Bookshelf | قفسه با کتاب/چوب | دکور و amenity برای analyzer | جامد | 1.2 | هر دو |
| 50 | Chest | از texture crate استفاده می‌کند | object storage/interactive | جامد | 1 | هر دو |
| 51 | Table | سطح چوبی با top planks | object دکور/تعامل | جامد | 1 | هر دو |

### دسته‌بندی محصولی blockها

- **Terrain:** Grass، Dirt، Stone، Sand، Gravel، Snow، Ice، Water و بخش‌های پایهٔ جهان.
- **Resource:** Coal Ore، Iron Ore، Gold Ore، Diamond Ore، Obsidian و blockهای فشردهٔ Iron/Gold/Diamond.
- **Decorative:** Bricks، Stone Bricks، Mossy Cobblestone، Sandstone، Quartz، Woolها، Dark Oak، Bookshelf و Table.
- **Utility:** Crafting Table، Fence، Lantern، Door، Path.
- **Interactive/prop:** Wooden Door، Lantern، Crate، Barrel، Sign، Bookshelf، Chest، Table و objectهای cabin.
- **Liquid/flow-like:** Water و Lava؛ کد فعلی آن‌ها را voxel مایع می‌داند و برای collision جامد لحاظ نمی‌کند.

### نکتهٔ Inventory

Registry شامل ۵۱ شناسهٔ idهای `1..51` است، اما inventory picker آیتم‌های `unbreakable` را حذف می‌کند؛ به همین دلیل کاربر **۵۰ گزینهٔ قابل انتخاب** می‌بیند و Bedrock در picker قرار نمی‌گیرد.

---

## حرکت، Physics و Collision

### بدن بازیکن

بازیکن با یک AABB ساده اما واقعی شبیه‌سازی می‌شود:

```text
height   = 1.8
halfWidth = 0.3
eye      = 1.62
stepHeight = 1.05
```

`pos.y` کف بدن است، نه مرکز آن. محدودهٔ voxelهای برخورد از `floor(px-half)` تا `floor(px+half)` و از کف تا `floor(py+height)` بررسی می‌شود.

### ورودی حرکت

| ورودی | عملکرد |
|---|---|
| `W` | حرکت رو به جلو بر اساس yaw |
| `S` | عقب‌رفتن |
| `A` | حرکت چپ |
| `D` | حرکت راست |
| Mouse | yaw/pitch و نگاه اول‌شخص |
| `Space` | jump در زمین یا بالا رفتن در آب |
| `Shift` | sprint در حالت زمینی؛ descend در flight |
| Double `Space` | روشن/خاموش کردن flight در Creative |
| `F` | toggle flight در Creative |
| touch buttons | معادل حرکت، jump، rise، descend و run روی موبایل |

حرکت بر اساس بردار forward/right دوربین ساخته می‌شود و ورودی قطری normalize می‌شود؛ بنابراین W+D سرعت دوبرابر ایجاد نمی‌کند.

### سرعت و شتاب

- Walk: `4.4`
- Sprint: `6.6`
- Water: `3.4`
- Flight: `13`
- در زمین، شتاب افقی روی ground برابر `16` و در هوا حدود `6` است.
- در آب drag افقی `0.85` و drag عمودی `0.90` در هر چرخهٔ frame اعمال می‌شود.
- در حالت پرواز، `Space` سرعت عمودی `0.8 × flightSpeed` رو به بالا و `Shift` رو به پایین می‌دهد.

### گرانش، پرش و افتادن

- گرانش زمینی: `30` واحد بر ثانیهٔ مربع؛ سرعت سقوط تا `-55` محدود می‌شود.
- jump impulse: `9.4`؛ فقط وقتی `onGround` واقعی باشد پذیرفته می‌شود.
- در آب، jump سرعت عمودی را تا `3.6` بالا می‌برد؛ حرکت پایین تا `-3.5` و سقوط آرام تا حدود `-1.5` محدود می‌شود.
- در Lava گرانش نرم‌تر، حدود `9`، اعمال می‌شود.
- اگر player زیر `y=-20` برود، کلاینت او را به spawn برمی‌گرداند.
- اگر بالاتر از `1000` برود، y روی `1000` clamp می‌شود و سرعت عمودی صفر می‌گردد.

### Grounded واقعی

`onGround` صرفاً یک پرچم تزئینی نیست. پس از حرکت عمودی، اگر collision هنگام پایین‌آمدن رخ دهد، `onGround=true` می‌شود. سرور نیز با بررسی collision در `py-.08` وضعیت grounded را خودش محاسبه می‌کند؛ بنابراین ارسال `onGround=true` به‌تنهایی بازیکن را روی هوا grounded نمی‌کند.

### Swept Axis Collision

حرکت در هر محور جداگانه sweep می‌شود:

1. مقصد محور محاسبه می‌شود.
2. مسیر بین مبدا و مقصد با گام‌های حداکثر حدود `0.12` نمونه‌برداری می‌شود.
3. AABB در هر نقطه با voxelهای جامد برخورد داده می‌شود.
4. در صورت برخورد، بازیکن نزدیک‌ترین نقطهٔ امن قبل از دیوار را می‌گیرد.
5. محورهای دیگر از این برخورد جداگانه ادامه پیدا می‌کنند.

Water و Lava در `serverSolidAt` جامد نیستند. Door در حالت باز نیز از collision خارج می‌شود.

### Auto-step با ارتفاع ۱.۰۵

اگر حرکت افقی با مانع برخورد کند و بازیکن روی زمین باشد، کلاینت و سرور مسیر جایگزین را آزمایش می‌کنند:

- AABB تا `1.05` بالا برده می‌شود؛
- مسیر افقی در ارتفاع بالا sweep می‌شود؛
- سپس فرود کنترل‌شده تا y مقصد بررسی می‌شود؛
- اختلاف فرود نباید از ارتفاع step فراتر رود.

این سازوکار یک پلهٔ کوچک یا اختلاف یک block را می‌پذیرد، ولی teleport روی دیوار بلند یا سقوط مصنوعی را قبول نمی‌کند.

### Contract سرور برای Player State

کلاینت به‌صورت دوره‌ای این payload را می‌فرستد:

```json
{
  "type": "playerState",
  "x": 12.5,
  "y": 34.0,
  "z": -8.2,
  "yaw": 1.2,
  "pitch": -0.1,
  "mode": "creative",
  "onGround": true,
  "inWater": false,
  "sprint": false,
  "fly": true,
  "jump": false,
  "selectedBlock": 11
}
```

سرور:

- ورودی را حداقل با فاصلهٔ ۲۰ میلی‌ثانیه پردازش می‌کند؛
- x/z را تا ±۱۰۰۰۰۰ و y را تا محدودهٔ امن clamp می‌کند؛
- `fly=true` را فقط برای mode سروری `creative` می‌پذیرد؛
- بر اساس elapsed time، mode، water، sprint و flight حداکثر مسافت را محاسبه می‌کند؛
- jump edge را فقط از grounded یا swimming واقعی قبول می‌کند؛
- مسیر کامل را با همان voxel collision و auto-step بررسی می‌کند.

در رد شدن، پیام زیر ارسال می‌شود:

```json
{
  "type": "playerStateRejected",
  "reason": "collision_or_teleport",
  "x": 12.5,
  "y": 34.0,
  "z": -8.2
}
```

کلاینت در این حالت position تاییدشده را جایگزین می‌کند، velocity را صفر می‌کند و از ادامهٔ drift optimistic جلوگیری می‌نماید.

---

## حالت‌های Creative و Survival و سلامت

### Creative

- سرعت اصلی حرکت همان walk/sprint است، اما flight فعال می‌شود.
- double Space یا `F`، flight را toggle می‌کند.
- هنگام flight، Space برای ascent و Shift برای descent استفاده می‌شود.
- سرور در multiplayer mode را از world می‌خواند و `fly` را به `mode==='creative'` محدود می‌کند.
- حد ارتفاع flight `1000` است؛ `creativeMaxSpeed=36` در config به‌عنوان سقف قراردادی/قابل توسعه ارسال می‌شود، ولی حرکت فعلی flight با `13` انجام می‌گیرد.

### Survival

- flight خاموش است؛ تلاش برای روشن‌کردن آن توسط کلاینت با پیام «Flight is only available in Creative» متوقف می‌شود.
- mining زمان‌دار است و hardness هر block را رعایت می‌کند.
- سقوط، آب و زمین از نظر حرکت واقعی‌تر محدود می‌شوند.
- در multiplayer، server mode بر انتخاب محلی مقدم است و کلاینت نمی‌تواند با `C` آن را عوض کند.

### Health HUD و damage

- حداکثر سلامت: `100`.
- HUD مقدار `100 / 100`، نوار قرمز و `damageFlash` دارد.
- هر damage با صدای hit، flash کوتاه ۱۵۰ میلی‌ثانیه‌ای و toast نمایش داده می‌شود.
- در implementation فعلی، damage سروری از entity خصمانهٔ `ghost` می‌آید؛ پیام `damage` شامل `amount`، health، maxHealth و source است.
- وقتی health به صفر برسد، سرور player را به spawn slot برمی‌گرداند و `respawn` با health کامل می‌فرستد.
- Water overlay هنگام ورود به آب ظاهر می‌شود و در Lava overlay گرم/قرمز می‌شود؛ Lava گرانش را کم می‌کند. مسیر فعلی کد، damage مستقل و دوره‌ای از Lava برای player اعمال نمی‌کند؛ بنابراین این بخش در وضعیت موجود اثر حرکتی/بصری دارد، نه damage تماسی کامل.

### Entityها و محیط زنده

سرور به‌صورت دوره‌ای entityها را به‌روزرسانی می‌کند:

- شب: `ghost` و `bat`؛
- روز: `cow`، `pig`، `sheep`، `chicken` و `rabbit`؛
- مجموع entityهای فعال حدود `4` تا `18` بر اساس تعداد بازیکنان است؛
- ghost نزدیک‌ترین player را دنبال می‌کند، path را با ارتفاع امن می‌سازد، line-of-sight را بررسی می‌کند و در فاصلهٔ حدود `1.85` حمله می‌نماید؛
- حرکت entityها، spawn آن‌ها و damage سروری است و با `entities` به کلاینت‌ها ارسال می‌شود.

---

## رندر سه‌بعدی و ساخت Mesh

### موتور رندر

کلاینت نسخهٔ inline از Three.js r160 را با WebGL استفاده می‌کند و یک perspective camera برای تجربهٔ first-person می‌سازد. FOV قابل تنظیم است و در بازهٔ `55..110` نگه داشته می‌شود. camera در هر frame روی `player.pos + eye + bobY` قرار می‌گیرد و yaw/pitch دور آن اعمال می‌شود.

### Chunk streaming

کلاینت بر اساس فاصله از بازیکن chunkها را در load queue می‌گذارد، می‌سازد و chunkهای بیرون از محدوده را dispose می‌کند. برای مرزها، همسایه‌های E/W/N/S و چهار همسایهٔ قطری در اختیار mesher قرار می‌گیرند. اگر همسایه هنوز load نشده باشد، Air فرض می‌شود و پس از load همسایه، chunkهای مجاور rebuild می‌شوند.

### Face culling

برای هر voxel و هر ۶ face:

- اگر id برابر Air باشد، voxel کنار گذاشته می‌شود؛
- اگر همسایه opaque باشد، face داخلی حذف می‌شود؛
- اگر همسایه transparent ولی هم‌نوع باشد، face مشترک حذف می‌شود؛
- اگر همسایه Air یا transparent متفاوت باشد، face visible باقی می‌ماند.

این کار از ساختن هزاران سطح پنهان در داخل terrain جلوگیری می‌کند.

### سه دستهٔ Mesh

برای هر chunk سه خروجی جدا ساخته می‌شود:

1. **Opaque:** سنگ، خاک، چوب و blockهای معمول؛
2. **Alpha:** Glass، Ice، Leaves و سایر transparentها با `alphaTest` و `DoubleSide`؛
3. **Water:** با material جدا، opacity حدود `0.78`، `depthWrite:false` و دوطرفه.

هر Mesh شامل position، normal، uv، vertex color و index است. opaque و alpha با `MeshLambertMaterial` روی atlas رسم می‌شوند.

### Greedy Water Top Meshing

سطح بالایی Water به‌صورت تک‌تک quadهای مستقل رسم نمی‌شود. برای هر y:

1. سلول‌های Waterی که بالایشان Water نیست پیدا می‌شوند؛
2. مستطیل افقی پیوسته در x گسترش داده می‌شود؛
3. سپس در z نیز تا جایی که مستطیل کامل Water بماند بزرگ می‌شود؛
4. quad سطح در `y + 0.88` ساخته می‌شود؛
5. side و bottom جداگانه و بر اساس face visibility ساخته می‌شوند.

نتیجه، سطح آب یک‌پارچه‌تر و تعداد triangle کم‌تر است.

### Ambient Occlusion و Vertex Color

برای هر گوشهٔ face، سه همسایهٔ مورب/کناری بررسی می‌شوند. مقدار AO از آرایهٔ زیر brightness می‌گیرد:

```text
AOL = [0.52, 0.70, 0.86, 1.0]
```

اگر block emit کننده باشد، brightness کامل‌تر اعمال می‌شود. برای جلوگیری از diagonal بد در quad، مجموع AO گوشه‌ها تعیین می‌کند diagonal index چگونه چیده شود. این جزئیات باعث می‌شود گوشهٔ بلوک‌ها عمق بصری داشته باشند بدون نیاز به texture normal سنگین.

### First-person hand و raycast

- دست اول‌شخص با block انتخاب‌شدهٔ hotbar نمایش داده می‌شود؛
- راه‌رفتن با سرعت و ضربان view bob همراه است؛
- raycast voxel با grid traversal تا `6.5` واحد می‌رود؛
- Door باز حتی برای انتخاب object قابل مشاهده است؛
- Water و Lava target mining معمولی نیستند؛
- block انتخاب‌شده outline دارد؛
- اگر بازیکن در Claim دیگران باشد، outline قرمز و interaction hint هشدار permission می‌دهد.

---

## Texture Atlas، نور، آسمان و افکت‌ها

### Atlas رویه‌ای ۸×۸

Atlas بدون فایل texture خارجی و به‌صورت procedural تولید می‌شود:

- `COLS=8` و `ROWS=8`؛
- هر tile برابر `16×16` پیکسل؛
- اندازهٔ کل atlas: `128×128`؛
- textureهای grass، dirt، stone، cobble، sand، gravel، log، leaves، planks، bricks، glass، water، lava، ore، snow، obsidian و utilityها با تابع‌های pixel-level ساخته می‌شوند؛
- برای کاهش bleeding، UV با inset حدود `0.5 / ATLAS` بسته می‌شود؛
- blockهای دارای top/side/bottom می‌توانند tile متفاوت برای هر face داشته باشند.

این روش وابستگی به asset pipeline بزرگ را کم می‌کند و ظاهر سبک voxel یک‌دست می‌سازد.

### نور و سایهٔ بصری

- نور مستقیم directional برای sun/moon؛
- نور hemisphere برای پر کردن سایه‌ها؛
- vertex color و face light بر اساس جهت؛
- Glowstone و Lantern به‌صورت emit در mesher brightness بالاتری می‌گیرند؛
- sky dome و shader آسمان با تغییر dayTime؛
- خورشید، ماه و ستاره‌ها در sky scene؛
- fog برای محوکردن فاصله؛
- clouds در ارتفاع حدود `150` با گزینهٔ خاموش/روشن.

نور voxel کاملِ propagation مانند موتور نور اختصاصی در این نسخه وجود ندارد؛ نور محیطی عمدتاً با directional/hemisphere light، AO، vertex brightness و مواد emitشونده شبیه‌سازی می‌شود.

### Quality Presetها

| Preset | Render distance | Pixel ratio | AO | Clouds | Particles |
|---|---:|---:|---|---|---|
| Low | 4 chunk | 1.0 | خاموش | خاموش | خاموش |
| Medium | 6 chunk | 1.25 | روشن | روشن | روشن |
| High | 8 chunk | 1.5 | روشن | روشن | روشن |

Render distance بالاتر تعداد chunk، face، vertex و مصرف GPU را افزایش می‌دهد. Pixel ratio بالاتر روی نمایشگرهای high-DPI تصویر را شارپ‌تر می‌کند اما هزینهٔ fill-rate را بالا می‌برد.

### Vegetation و props

درخت، cabin decoration و propها به‌صورت geometryهای سبک و در موارد مناسب با instancing/گروه‌بندی ساخته می‌شوند تا نسبت به ساخت یک Mesh کامل برای هر leaf یا prop هزینهٔ کم‌تری داشته باشند. هنگام rebuild chunk، decoration root نیز dispose می‌شود.

### ذرات و صدا

- هنگام break ذرات رنگی block ایجاد می‌شود؛
- در mining Survival با احتمال حدود `0.35` ذرات به‌روزرسانی می‌شوند؛
- place/break افکت و swing دست دارد؛
- Web Audio صداهای procedural برای click، step، splash، break، place، coin، hit و محیط تولید می‌کند؛
- footstep بر اساس block زیر پا انتخاب می‌شود؛
- ورود به آب splash ایجاد می‌کند.

---

## کنترل‌ها و رابط کاربری

### جدول کامل کنترل‌های Desktop

| کلید/ورودی | نتیجه |
|---|---|
| `W/A/S/D` | حرکت |
| Mouse | نگاه و چرخش camera |
| `Space` | پرش/شنا؛ double Space برای flight در Creative |
| `Shift` | sprint یا descend در flight |
| `F` | flight on/off در Creative |
| `C` | Creative/Survival در Singleplayer |
| `R` | برگشت به spawn محلی |
| `T` | تغییر زمان/dayTime محلی |
| `E` | بازکردن inventory |
| `1..9` | انتخاب slot hotbar |
| Wheel | جابه‌جایی slot |
| Left click نگه‌داشته | mining |
| Right click | place، toggle object یا interaction |
| Middle click | pick block |
| `F3` | debug HUD |
| `Esc` | menu یا بستن overlay |
| `Enter` | بازکردن chat در multiplayer |
| `M` | live map |

در multiplayer، `C` و دکمهٔ Mode صرفاً پیام «Game mode is controlled by the server» می‌دهند. `R` نیز در جهان سروری جایگاه تخصیص‌یافتهٔ server را دور نمی‌زند.

### Hotbar و inventory

Hotbar نه slot دارد و به‌صورت پیش‌فرض شامل این idهاست:

```text
1 Grass, 2 Dirt, 42 Dirt Path, 43 Wood Fence,
11 Oak Planks, 44 Wooden Door, 45 Lantern,
46 Crate, 47 Barrel
```

Inventory تمام blockهای registry را با icon ایزومتریک ساده نشان می‌دهد، به‌جز Bedrock. کلیک روی یک item آن را در slot فعال hotbar می‌گذارد، hand عوض می‌شود و inventory بسته می‌گردد.

### HUD

HUD فعلی شامل این عناصر است:

- crosshair مرکزی؛
- block selection outline؛
- نام block انتخاب‌شده؛
- health bar؛
- wallet با واحد `COIN`؛
- biome و y فعلی؛
- mode و seed؛
- ownership/claim hint؛
- mining progress bar در Survival؛
- interaction hint برای Door، Lantern، Storage، Sign و Bench؛
- debug panel با FPS، XYZ، chunk count، queue، triangle و particle count؛
- mini-map؛
- multiplayer status، chat و player list.

### Menu و overlayهای محصول

منوی Esc به settings و عملیات جهان دسترسی می‌دهد:

- Fullscreen؛
- کیفیت Low/Medium/High؛
- render distance؛
- FOV، sensitivity و day length؛
- روشن/خاموش AO و clouds؛
- Save Local World؛
- Download World File؛
- Open World File؛
- multiplayer connect/disconnect؛
- inventory، map، chat و داشبوردهای claim/property/business.

Overlayهای اقتصادی شامل `Businesses`، `NPC Construction Contracts`، `Property Rentals`، `Guild / Company` و `Premium Land Auctions` هستند.

---

## Mining، Placing و تعامل با اشیا

### Raycast و انتخاب

کلاینت ابتدا از camera یک ray می‌فرستد. برای voxel، grid traversal انجام می‌شود و اولین block غیر Air و غیر liquid در فاصلهٔ مجاز target می‌شود. هم‌زمان روی decorationها raycast جداگانه اجرا می‌شود؛ اگر prop نزدیک‌تر باشد، interaction target روی prop قرار می‌گیرد.

### Mining

#### Creative

- با نگه‌داشتن click چپ، break به‌صورت سریع و تکرارشونده انجام می‌شود؛
- cooldown حدود `0.16` ثانیه است؛
- mining progress نشان داده نمی‌شود؛
- Bedrock، liquid target و permission نامعتبر رد می‌شوند.

#### Survival

- block target ذخیره می‌شود؛
- با تغییر target progress صفر می‌شود؛
- فرمول پیشرفت:

```text
progress += dt / (0.55 × block.hardness)
```

- progress bar تا ۱۰۰٪ پر می‌شود؛
- هنگام استخراج ذرات، swing و صدای break تولید می‌شود؛
- بعد از تکمیل، client در multiplayer edit optimistic ثبت کرده و `blockBreak` می‌فرستد.

### Placing

1. face عادی target (`nx,ny,nz`) مشخص می‌شود؛
2. جای جدید یک cell کنار block انتخاب‌شده است؛
3. y باید در `1..79` باشد؛
4. اگر cell block جامد داشته باشد، placing رد می‌شود؛ liquid می‌تواند جایگزین شود؛
5. اگر block داخل AABB بازیکن بیفتد، placing رد می‌شود؛
6. در multiplayer claim access و server validation لازم است؛
7. right click نگه‌داشته‌شده هر `0.20` ثانیه تلاش می‌کند.

### Door و Lantern

- Wooden Door با right click toggle می‌شود؛
- Door باز در collision جامد نیست و در mesh ممکن است به‌صورت state متفاوت مدیریت شود؛
- Lantern با right click خاموش/روشن می‌شود؛
- state door و lantern در world snapshot جدا از voxel edit ذخیره می‌شود؛
- در multiplayer پیام `doorToggle` یا `lightToggle` می‌رود و نتیجه با `doorState`/`lightState` broadcast می‌شود؛
- use روی Claim دیگران permission `use` می‌خواهد.

### Crate، Barrel، Chest، Sign و Table

Propهای تعاملی با raycast decoration یا block target تشخیص داده می‌شوند. action labelها شامل:

- `OPEN STORAGE` برای chest، crate و barrel؛
- `READ SIGN` برای sign؛
- `USE BENCH` برای bench طبیعی؛
- تعامل عمومی برای table/lantern/door.

سرور فقط بر اساس نام ارسالی اعتماد نمی‌کند: block واقعی `serverBlockIdAt` و landmark عمومی را بررسی می‌کند. اگر object در آن مکان وجود نداشته باشد، `object_not_found` برمی‌گردد.

---

## نقشهٔ زنده و رندر Satellite

### دو map view

- **Mini Map:** نمای کوچک گوشهٔ صفحه، مرکز آن player است و با yaw بازیکن می‌چرخد.
- **Full Map:** با `M` باز می‌شود، zoom حدود `20%..800%` دارد، pan می‌شود و marker `YOU` را حتی وقتی خارج از قاب است با edge arrow نگه می‌دارد.

نقشه، نمای top-down raster است و جایگزین مشاهدهٔ سه‌بعدی کامل chunk نیست.

### pipeline محلی

اگر server map در دسترس نباشد، Worker داخلی map را می‌سازد:

1. seed و noiseهای همان terrain را آماده می‌کند؛
2. برای هر pixel، ارتفاع، biome و top block را sample می‌کند؛
3. relief را با چهار همسایه shade می‌کند؛
4. tree/cactus/brush و shadow را روی raster می‌کشد؛
5. cabin roof و marker را اضافه می‌کند؛
6. در صورت وجود OffscreenCanvas، `ImageBitmap` قابل انتقال می‌فرستد؛
7. در غیر این صورت RGBA buffer ارسال می‌کند.

Tile cache با tileهای ۳۲ پیکسلی کار می‌کند و برای هر seed invalidation می‌گردد. اگر Worker موجود نباشد، fallback روی main thread با budget حدود ۴ میلی‌ثانیه در هر frame اجرا می‌شود تا UI قفل نشود.

### pipeline سروری

در multiplayer، کلاینت ابتدا `/api/map?x=...&z=...&radius=...&step=...` را درخواست می‌کند. سرور پاسخ `mapRaster` می‌دهد:

```json
{
  "type": "mapRaster",
  "worldId": "main",
  "seed": 18699877,
  "baseX": -96,
  "baseZ": -96,
  "radius": 96,
  "step": 1,
  "grid": 193,
  "colors": "base64 RGB",
  "markers": [{"type":"cabin","x":7.5,"z":7.5}]
}
```

هر pixel سه byte RGB دارد. server در محدودهٔ cache master map می‌تواند مستقیم sub-sample کند؛ خارج از آن، column و edit مؤثر را دوباره محاسبه می‌کند. editهای بازیکن و roof cabin در server raster لحاظ می‌شوند.

### server map در برابر local map

وقتی multiplayer متصل است:

- server raster برای همان request authoritative است؛
- Worker محلی ممکن است هم‌زمان در حال ساخت باشد، اما نباید raster سروری معتبر را overwrite کند؛
- در خطای `/api/map`، map عنوان `LOCAL SATELLITE` می‌گیرد؛
- در حالت عادی عنوان `SERVER SATELLITE` است.

### محتوای map

نقشه شامل:

- relief و hillshade؛
- رنگ‌های biome و top terrain؛
- آب و Lava؛
- shadow و crown درخت؛
- roof/marker کابین؛
- grid خطوط chunkهای ۱۶×۱۶؛
- Claimها؛
- marker بازیکن خودی؛
- remote playerها؛
- markerهای edge برای بازیکن یا هدف خارج از قاب.

---

## Multiplayer و قرارداد WebSocket

### اتصال و ورود

سرور ابتدا روی WebSocket پیام `hello` می‌دهد:

```json
{
  "type":"hello",
  "server":"VoxelCraft Server",
  "version":1,
  "sessionId":"...",
  "maxPlayers":20,
  "physics":{ "version":1, "chunkSize":16, "worldHeight":80 }
}
```

کلاینت سپس `join` می‌فرستد:

```json
{
  "type":"join",
  "username":"builder_01",
  "password":"...",
  "name":"Builder One",
  "sessionToken":"optional remembered token"
}
```

- username باید ۳ تا ۲۴ حرف کوچک، عدد یا underscore باشد؛
- password در UI حداقل ۶ نویسه می‌خواهد؛
- display name برای نمایش بازیکن استفاده می‌شود؛
- سرور در ورود نخست account را ایجاد یا authenticate می‌کند؛
- پس از ورود موفق session token امضاشده برای دفعات بعد صادر می‌شود؛
- password هرگز در browser به‌صورت ذخیره‌شده نگه داشته نمی‌شود؛
- یک account هم‌زمان دوبار وارد نمی‌شود و با `account_in_use` رد می‌گردد.

### پیام‌های چرخهٔ ورود و world

| جهت/پیام | کاربرد |
|---|---|
| `hello` | معرفی server و physics |
| `join` | login/register و ورود به world |
| `authRejected` | rate limit، اعتبار نادرست یا account در حال استفاده |
| `joined` | playerId، session، spawn، health، claim و physics |
| `worldState` | seed، mode، dayTime، edits، claims، economy و object states |
| `serverMode` | تغییر mode از سمت server/admin |
| `players` | خلاصهٔ بازیکنان آنلاین |
| `playerState` | موقعیت و حرکت اعلامی کلاینت |
| `playerStateRejected` | recovery به موقعیت تاییدشده |
| `entities` | entityهای ambient و hostile |
| `worldTime` | زمان روز/شب |
| `chat` | گفت‌وگوی پاک‌سازی‌شده |
| `ping` / `pong` | زنده‌بودن ارتباط |

### Summary بازیکن

خلاصهٔ player شامل id، name، x/y/z، yaw، pitch، mode، fly، sprint، inWater، onGround، jump و selectedBlock است. کلاینت برای remote playerها همین state را نگه می‌دارد و بازو/پا/held block را animate می‌کند.

### پیام‌های edit و object

| درخواست client | پاسخ/رویداد server | رفتار |
|---|---|---|
| `blockBreak` | `blockUpdate` یا `editRejected` | break با oldId اختیاری و بررسی voxel فعلی |
| `blockPlace` | `blockUpdate` یا `editRejected` | place id معتبر و oldId برای جلوگیری از race |
| `doorToggle` | `doorState` یا `permissionRejected` | تغییر state در world.doors |
| `lightToggle` | `lightState` یا `permissionRejected` | تغییر state در world.lights |
| `objectInteract` | `objectInteractAccepted` / `objectInteractRejected` و `objectState` | اعتبارسنجی object واقعی |
| `chat` | broadcast `chat` | پاک‌سازی `< >`، control chars و محدودیت ۲۴۰ نویسه |

### Optimistic client و recovery

در block place/break کلاینت:

1. old voxel را ذخیره می‌کند؛
2. edit را محلی اعمال می‌کند؛
3. particle/sound پخش می‌کند؛
4. پیام را می‌فرستد.

سرور ممکن است به دلیل `block_changed`، `block_occupied`، `block_not_found`، `unbreakable_block`، `too_far_or_invalid` یا permission آن را رد کند. کلاینت با `blockUpdate`های بعدی و snapshotهای world به وضعیت مؤثر برمی‌گردد؛ برای player state نیز موقعیت تاییدشده مستقیماً اعمال و velocity صفر می‌شود.

### فهرست پیام‌های اقتصادی و اجتماعی

Client requestهای موجود:

```text
claimPreview, claimConfirm, claimPermissionSet, claimList,
coOwnerSet, coOwnerRemove, landInspect,
storeCatalog, walletSnapshot,
marketListings, propertyAnalyze, propertyList, propertyUnlist,
propertyBuy, propertySellNpc,
businesses, businessRegister, businessManage, businessVisit,
constructionCatalog, constructionJobs, constructionPreview,
constructionOrder, constructionCancel,
rentals, rentalOfferCreate, rentalOfferCancel, rentalAccept, rentalCancel,
companies, companyCreate, companyInvite, companyJoin, companyLeave,
companyAttachBusiness, companyDetachBusiness,
landAuctions, landAuctionBid, landAuctionSettle,
prefabPreview, prefabPlace
```

برای هر خانواده، پاسخ موفق و پاسخ reject مستقل وجود دارد و معمولاً شامل id رکورد، wallet/claim/property snapshot، reason و message است.

---

## Claim، مالکیت و Permission

### Claim پایه

- اندازهٔ هر Claim دقیقاً `16×16` است؛
- origin روی مختصات grid شانزده‌تایی normalize می‌شود؛
- اولین Claim بازیکن با `hasClaimedFree` رایگان است؛
- claimهای بعدی با Coin خریداری می‌شوند؛
- Claim نباید با Claim دیگر overlap کند؛
- Common Spawn Area و spawn reservationها حریم دارند؛
- Claim جدید زمین طبیعیِ خالی است، ولی خرید claim موجود از player/NPC مسیر جدا دارد.

### مالکیت و member

هر Claim شامل:

- `ownerId` و `ownerName`؛
- `members` با permissionهای جداگانهٔ `build` و `use`؛
- `coOwners` با سهم ۱ تا ۹۹ درصد و مجموع محدود؛
- `kind` برابر `player` یا `npc`؛
- `marketLocked` و `marketListingId`؛
- business license و زمان‌های created/updated.

مالک می‌تواند member را اضافه/حذف کند. target player باید قبلاً به سرور join کرده باشد و حد اعضای عادی ۶۴ است. co-owner نیز از مسیر `coOwnerSet` و `coOwnerRemove` مدیریت می‌شود.

### Permissionهای عملی

| عملیات | شرط |
|---|---|
| مشاهده و حرکت | معمولاً آزاد |
| Build/Break | claim لازم و `build=true` یا مالک/co-owner مجاز |
| Use خصوصی | claim لازم و `use=true`، مگر tenant یا landmark عمومی |
| تعامل landmark عمومی | در نقاط مشخص cabin ممکن است بدون claim پذیرفته شود |
| Prefab | مالکیت/BUILD و قرارگیری کامل داخل Claim |
| Business manage | مالک business claim |
| Market/Rental | مالک Property و بدون lock/قرارداد ناسازگار |

در صورت failure:

- `claim_required`
- `no_permission`
- `property_locked`
- `construction_locked`
- `too_far_or_invalid`

در پاسخ `permissionRejected` پیام کاربرپسند و مختصات block برمی‌گردد.

### Land quote و registry

`landInspect` برای یک نقطه، parcel normalizeشده و موارد زیر را برمی‌گرداند:

- size و coordinates؛
- biome و terrainHeight؛
- tier (`Ordinary`، `Prime`، `Premium`)؛
- access (`Low`، `Medium`، `High`)؛
- traffic؛
- distance تا spawn و نزدیک‌ترین landmark؛
- nearbyClaims و demand؛
- base price و official price؛
- acquisition و purchase breakdown.

فرمول quote از `BASE_LAND_PRICE=1200` شروع می‌شود و با biome multiplier، دسترسی، tier، تقاضا و نزدیکی به spawn/landmark تغییر می‌کند. قیمت به گام‌های ۵۰ Coin گرد می‌شود و حداقل ۵۰ است؛ اولين Claim رایگان بودن خود را جداگانه روی قیمت اعمال می‌کند.

---

## کیف پول، Ledger و اقتصاد

### Coin Wallet

هر profile کیف پولی با این داده‌ها دارد:

- balance؛
- initialBalance؛
- totalEarned؛
- totalSpent؛
- transactionCount؛
- ledger خلاصهٔ transactionها.

واحد همهٔ عملیات اقتصادی `Coin` است و HUD با `COIN` نمایش می‌دهد. در شروع، balance از profile/ledger می‌آید و با هر پرداخت server-side تغییر می‌کند.

### Ledger

هر تراکنش شامل id، playerId، delta، balanceAfter، type، reason، propertyId، businessId و createdAt است. عملیات انتقال تا حد امکان در helperهای مرکزی مثل `commitCoinTransaction`، `marketplaceTransferCoins`، `businessTransferCoins` و `transferRentCoins` انجام می‌شود.

اصل مهم: کلاینت هرگز مجاز نیست با ارسال `balance` یا `delta` دلخواه پول بسازد. server موجودی profile را می‌خواند، کافی‌بودن آن را بررسی می‌کند، تراکنش ایجاد می‌کند و wallet جدید را برمی‌گرداند.

### Store

Store فعلی catalog prefabهای paid را از سرور می‌گیرد. payload شامل نام، category، price، footprint، description، currency و `paid:true` است. قیمت prefab از خود server catalog می‌آید و client اجازهٔ تغییر آن را ندارد.

---

## Property، Market و Escrow

### Property analysis

`propertyAnalyze` یک ساختمان را از روی editهای واقعی Claim تحلیل می‌کند. گزارش شامل این موارد است:

- تعداد blockهای editشده و نوع‌های یکتا؛
- bounds، ارتفاع و تعداد floor؛
- مساحت footprint؛
- roof، door، path و room؛
- object count برای chest، crate، barrel، lantern، sign، bookshelf و table؛
- amenity flags و score؛
- block inventory؛
- flatness، terrain range، biome، traffic و tier؛
- raw material value؛
- quality، usefulness، originality و landscape scores؛
- landValue، buildingValue و certifiedValue.

یک property برای market یا rental باید `propertyCompletion` را پاس کند: floor، roof، room و entrance لازم است و ساختمان ناقص با `property_incomplete` رد می‌شود.

### فروش کامل Property به player

`propertyList` property کامل را با premium بین **۱ تا ۱۰۰ درصد** در market می‌گذارد. قیمت:

```text
askingPrice = certifiedValue × (1 + premium / 100)
```

با گردشدن و حداقل بالاتر از certified value. هنگام listing:

- Claim قفل می‌شود (`marketLocked=true`)؛
- ساخت، permission management، rental و بعضی عملیات متناقض متوقف می‌شوند؛
- snapshot شامل land، building، objects، business license، score و certifiedValue ساخته می‌شود.

در `propertyBuy`:

1. server listing فعال و seller واقعی را دوباره چک می‌کند؛
2. خریدار موجودی لازم را دارد؛
3. کمیسیون `5%` محاسبه می‌شود؛
4. transfer به‌صورت escrow-like اتمیک انجام می‌شود؛
5. seller net و buyer wallet ثبت می‌گردد؛
6. ownership به buyer منتقل می‌شود؛
7. building/object/business license همراه property منتقل می‌شود؛
8. پیوند Company قبلی جدا می‌شود؛
9. market history تا ۲۰۰ رکورد نگه داشته می‌شود؛
10. `claims`، `marketListings`، `businesses` و walletها broadcast می‌شوند.

فروشنده نمی‌تواند listing خودش را بخرد و listing تغییرکرده یا پول ناکافی reject می‌شود.

### خرید player Claim و NPC Property

- player Claim فقط زمانی خریدنی است که seller آن را offer کرده باشد؛
- NPC Property شامل land، building، objects و در صورت وجود business license است؛
- پس از خرید NPC Claim، `kind` از npc به player تبدیل می‌شود، property record purchased می‌شود و Claim جدید به خریدار داده می‌گردد؛
- اگر مالک بخواهد به NPC بفروشد، `propertySellNpc` certified value را می‌گیرد و payout واقعی برابر **۸۰٪ certified value** است؛
- در buyback، Claim به NPC Buyback برمی‌گردد و `npcPropertyAdded` به کلاینت‌ها اعلام می‌شود.

### رفتارهای ناسازگار Market

listing فعال یا market lock باعث رد شدن این عملیات می‌شود:

- ساخت block و prefab؛
- ثبت business جدید؛
- تغییر permission؛
- ایجاد rental؛
- NPC construction جدید.

این قفل برای جلوگیری از فروش هم‌زمان یک asset در حال تغییر طراحی شده است.

---

## Rental و قرارداد اجاره

### ساخت Offer

مالک property کامل می‌تواند در `rentalOfferCreate` این پارامترها را تعیین کند:

- `pricePerCycle`؛
- `deposit`؛
- `durationCycles`.

شرط‌ها:

- property باید owned و player-kind باشد؛
- property ناقص نباشد؛
- market lock، construction active یا rental قبلی نداشته باشد؛
- مدت بین ۱ و حداکثر تنظیم‌شدهٔ ۳۰ cycle پیش‌فرض باشد؛
- تنها یک offer فعال برای هر Claim مجاز است.

### Accept و escrow اولیه

Tenant با `rentalAccept`:

1. offer باز و claim را دوباره validate می‌کند؛
2. نمی‌تواند property خود را اجاره کند؛
3. باید `deposit + first rent` موجودی داشته باشد؛
4. deposit در ledger به‌صورت `rent_deposit_hold` کم می‌شود؛
5. first rent به owner منتقل می‌شود؛
6. contract با `nextDueAt` و `endsAt` ساخته می‌شود؛
7. offer به `leased` تغییر می‌کند.

### دسترسی tenant

tenant در Claim مربوطه:

- `use=true` دارد؛
- `build=false` باقی می‌ماند؛
- می‌تواند objectهای خصوصی را use کند؛
- نمی‌تواند ساختمان را به‌عنوان مالک ویرایش کند.

### cycle و پایان

در هر rental cycle:

- اگر due date برسد، rent خودکار انتقال می‌یابد؛
- در صورت موجودی ناکافی، contract به `past_due` می‌رود و `lastError` می‌گیرد؛
- پس از اتمام duration، contract `completed` می‌شود؛
- deposit در پایان/لغو به tenant برمی‌گردد؛
- cancel توسط tenant یا owner به‌ترتیب `cancelled` یا `terminated` ثبت می‌شود؛
- offer پس از آزادشدن می‌تواند دوباره open گردد.

---

## Business و درآمدزایی

### چهار نوع Business

| نوع | NPC پایه | درآمد هر NPC | fee بازیکن | ظرفیت پایه | maintenance | salary | advertising |
|---|---:|---:|---:|---:|---:|---:|---:|
| Shop | 8 | 18 | 24 | 8 | 18 | 12 | 10 |
| Hotel | 5 | 42 | 55 | 5 | 38 | 28 | 18 |
| Gallery | 6 | 30 | 36 | 6 | 26 | 20 | 14 |
| Workshop | 7 | 24 | 32 | 7 | 22 | 16 | 12 |

اعداد بالا در `BUSINESS_CONFIG` هستند و بر اساس `BUSINESS_TICK_MS` که پیش‌فرض ۳۰ ثانیه است، به period minutes scale می‌شوند.

### ثبت license

مالک Claim:

1. باید property را کامل کند؛
2. type را از Shop، Hotel، Gallery یا Workshop انتخاب کند؛
3. نام حداکثر ۲۴ نویسه بدهد؛
4. با `businessRegister` license دریافت کند.

Property دارای business قبلی، property قفل‌شده، leased یا ناقص reject می‌شود.

### درآمد NPC و هزینهٔ عملیاتی

در هر cycle:

- traffic از land tier و demand به‌دست می‌آید؛
- reputation و advertising factor تعداد مشتری را تغییر می‌دهند؛
- staff level ظرفیت را افزایش می‌دهد؛
- gross از `npcCustomers × npcRate × periodMinutes` محاسبه می‌شود؛
- operating cost شامل maintenance، salary و advertising است؛
- gross به owner و co-ownerها بر اساس سهم تقسیم می‌شود؛
- هزینه از wallet مالک کم می‌شود؛
- اگر پرداخت هزینه شکست بخورد، business suspended می‌شود؛
- reputation در پرداخت موفق افزایش و در failure کاهش می‌یابد؛
- `businessCycle` و `businessUpdate` برای HUD ارسال می‌شوند.

### Visitor واقعی

بازیکن دیگری با `businessVisit` باید:

- به claim محل نزدیک‌تر از ۲۴ واحد باشد؛
- owner نباشد؛
- در cooldown یک‌دقیقه‌ای نباشد؛
- ظرفیت cycle تمام نشده باشد؛
- fee مشخص business را بپردازد.

پول با `business_customer_payment` از visitor کم و با `business_player_income` بین مالک و co-ownerها توزیع می‌شود. visit موفق reputation را یک واحد بالا می‌برد.

### Upgrade و قلمرو پوشش

مالک می‌تواند:

- staff را از level ۱ تا ۱۰ ارتقا دهد؛
- advertising را از level ۱ تا ۱۰ ارتقا دهد؛
- چند Claim owned خود را در `coverageClaimIds` به business assign کند؛
- business را toggle و enable/disable کند.

Claimی که business مستقل خود را دارد یا market locked است نمی‌تواند به business دیگر assign شود.

### نقش business در محصول

Business باعث می‌شود property فقط یک ساختمان ایستا نباشد؛ location، traffic، NPC visitor، بازدید player، capacity، salary، maintenance، advertising، reputation و co-owner share را به یک چرخهٔ اقتصادی پیوسته تبدیل می‌کند.

---

## Company و مالکیت سازمانی

### ساختار Company

هر Company شامل:

- id و name؛
- owner؛
- members با roleهای owner، manager یا member؛
- invites؛
- treasury؛
- businessIds؛
- createdAt/updatedAt.

پیش‌فرض هر بازیکن نمی‌تواند بیش از یک Company را own کند. سقف member، ۱۶ نفر است مگر environment آن را تغییر دهد.

### عملیات

| درخواست | شرط و نتیجه |
|---|---|
| `companyCreate` | name حداقل ۲ نویسه و نداشتن Company owned قبلی |
| `companyInvite` | فقط owner/manager؛ target باید قبلاً server join کرده باشد |
| `companyJoin` | وجود invitation و آزاد بودن ظرفیت |
| `companyLeave` | member می‌تواند خارج شود؛ owner تا انتقال مالکیت نمی‌تواند خارج شود |
| `companyAttachBusiness` | owner business و manager/owner Company لازم است |
| `companyDetachBusiness` | owner business می‌تواند link را بردارد |

Company treasury در ساخت با صفر شروع می‌شود. اتصال business، business license را به company id پیوند می‌دهد، اما مالکیت Claim همچنان باید با بازیکن کنترل شود. در فروش property، link Company قبلی از license جدا می‌شود تا Company دارایی فروخته‌شده را خودکار از دست ندهد یا برعکس، مالکیت قانونی مبهم ایجاد نشود.

---

## Premium Land Auction

### مدل مزایده

قطعهٔ Premium به‌جای خرید عادی در `landAuctions` قرار می‌گیرد و شامل:

- x/z و size شانزده؛
- tier؛
- reservePrice؛
- currentBid؛
- minNextBid؛
- bidder؛
- heldAmount؛
- start/end time؛
- status (`open`, `ended`, `settled`, `cancelled`).

حداقل bid بعدی برابر reserve یا bid فعلی به‌علاوهٔ حداقل ۵٪/حداقل ۱۰۰ Coin است.

### Bid و escrow

در `landAuctionBid`:

1. مزایده باید open و هنوز تمام‌نشده باشد؛
2. parcel نباید قبلاً claim شده باشد؛
3. مبلغ باید از minNextBid بالاتر باشد؛
4. اگر همان bidder bid خود را بالا ببرد، فقط delta از wallet کم می‌شود؛
5. اگر bidder جدید برنده شود، مبلغ held bidder قبلی به او refund می‌گردد؛
6. current bid و held amount ذخیره و broadcast می‌شود؛
7. پیام موفق با `landAuctionBidAccepted` و پیام خطا با `landAuctionBidRejected` می‌آید.

### Settlement

پس از پایان زمان، `landAuctionSettle`:

- bidder برنده و مبلغ held را بررسی می‌کند؛
- اگر bid معتبر باشد، یک Claim برای او می‌سازد؛
- auction به settled می‌رود؛
- wallet و claims به‌روزرسانی می‌شوند؛
- اگر شرایط settlement تغییر کرده باشد، با `auction_ended`، `parcel_claimed` یا دلیل مناسب رد می‌شود.

این مدل از خرید خارج از نوبت جلوگیری می‌کند و pool پول bid را تا پایان در escrow نگه می‌دارد.

---

## Prefab Store و ساخت سریع

همهٔ ۲۴ prefab فعلی از catalog سرور می‌آیند و **همه paid هستند**. هر مورد نام، id، category، قیمت Coin، footprint، ارتفاع و description دارد.

### کاتالوگ کامل prefabها

| ID | نام | دسته | قیمت | footprint `w×d×h` |
|---|---|---|---:|---:|
| `cottage_small` | Pine Cottage | Residence | 450 | 10×8×5 |
| `cottage_garden` | Garden Cottage | Residence | 650 | 12×10×5 |
| `farmhouse` | Field Farmhouse | Residence | 850 | 14×10×6 |
| `townhouse` | Brick Townhouse | Residence | 1100 | 8×12×8 |
| `modern_house` | Modern Courtyard House | Residence | 1450 | 14×12×6 |
| `glass_house` | Glass Atrium House | Residence | 1750 | 12×12×7 |
| `desert_villa` | Desert Villa | Residence | 2100 | 16×12×6 |
| `snow_chalet` | Snowline Chalet | Residence | 2300 | 14×12×8 |
| `mountain_lodge` | Mountain Lodge | Residence | 2800 | 16×14×9 |
| `bakery_shop` | Corner Bakery | Shop | 900 | 10×8×5 |
| `general_store` | General Store | Shop | 1250 | 12×10×6 |
| `cafe_corner` | Corner Cafe | Shop | 1400 | 12×12×5 |
| `market_stall` | Covered Market Hall | Shop | 1650 | 16×10×6 |
| `inn_small` | Roadside Inn | Hotel | 1900 | 14×12×7 |
| `hotel_grand` | Grand Hotel | Hotel | 3200 | 16×14×10 |
| `gallery_white` | White Cube Gallery | Gallery | 1550 | 12×12×6 |
| `gallery_museum` | Town Museum | Gallery | 2600 | 16×14×8 |
| `craft_workshop` | Craft Workshop | Workshop | 1000 | 10×10×6 |
| `maker_loft` | Maker Loft | Workshop | 1500 | 12×10×8 |
| `auto_workshop` | Auto Workshop | Workshop | 1850 | 16×10×6 |
| `greenhouse` | Community Greenhouse | Civic | 1200 | 14×10×6 |
| `library` | Neighborhood Library | Civic | 1750 | 14×12×7 |
| `clocktower` | Clocktower Pavilion | Civic | 2900 | 10×10×14 |
| `workshop_courtyard` | Arts Courtyard | Workshop | 2200 | 16×14×6 |

### Preview و rotation

کلاینت پیش از خرید `prefabPreview` می‌فرستد و ghost شفاف سازه را نشان می‌دهد. rotationهای `0/90/180/270` footprint را تغییر می‌دهند؛ در ۹۰/۲۷۰ عرض و عمق جابه‌جا می‌شود. پس از تایید:

- server قیمت را از catalog می‌خواند؛
- زمین و Claim را validate می‌کند؛
- از wallet Coin کم می‌کند؛
- editهای prefab را commit می‌کند؛
- `prefabPlaced` با placement و blocksPlaced برمی‌گرداند.

### محدودیت placement

Placement با موارد زیر reject می‌شود:

- prefab ناشناخته؛
- origin غیرصحیح و غیرinteger؛
- نداشتن Claim؛
- نداشتن BUILD permission؛
- خارج بودن کل footprint از Claim؛
- آب/terrain خشک‌نبودن (`terrain.h <= 31` یا river)؛
- mountains؛
- اختلاف ارتفاع footprint بیش از ۴؛
- وجود edit قبلی در footprint؛
- overlap با cabin/landmark؛
- عبور از `WORLD_HEIGHT=80`؛
- `property_locked` یا wallet ناکافی.

Placement فقط با paid transaction انجام می‌شود و preview به‌تنهایی پول کم نمی‌کند.

---

## NPC Construction و ساخت مرحله‌ای

### پیش‌شرط

NPC construction یک قابلیت Workshopمحور است. مالک باید:

1. Claim را داشته باشد؛
2. property را کامل کرده باشد؛
3. Business License از type `workshop` داشته باشد؛
4. Workshop فعال و suspended نباشد؛
5. market lock، rental یا construction فعال نداشته باشد؛
6. footprint مناسب و خالی داشته باشد.

### Planهای فعلی

| Plan ID | نام | قیمت | footprint | توضیح |
|---|---|---:|---:|---|
| `workshop_annex` | Workshop Annex | 650 | 4×4×4 | extension کوچک با door، window و lamp |
| `guest_room` | Guest Room | 900 | 5×4×4 | اتاق محصور با Builder و Decorator |
| `gallery_wing` | Gallery Wing | 1250 | 6×5×5 | wing نمایشگاهی با glass، lighting و entrance |

### Preview و contract

`constructionPreview`:

- workshop Claim و plan را می‌سنجد؛
- footprint، y پایه، edit count و stage count را برمی‌گرداند؛
- هزینهٔ contract را قبل از پرداخت نشان می‌دهد.

در `constructionOrder`:

- حداکثر ۳ job فعال برای هر owner مجاز است؛
- قیمت از wallet کم می‌شود؛
- job با status `queued` ایجاد می‌گردد؛
- contract شامل amount و paidTransactionId است؛
- تا زمان order هیچ editی در world قرار نمی‌گیرد.

### نقش‌های NPC

مراحل رسمی job:

1. **Architect:** تعریف placement و plan؛
2. **Builder:** قرار دادن Oak Planks در کف، دیوار و ساخت اصلی؛
3. **Decorator:** door، glass، lantern و chest را می‌گذارد؛
4. **Inspector:** property analyzer را اجرا و structure را certify می‌کند.

در هر construction tick پیش‌فرض هر ۲ ثانیه، حداکثر `۴` edit اعمال می‌شود. هر edit با `blockUpdate` broadcast می‌شود؛ بنابراین بازیکنان ساخت تدریجی را زنده می‌بینند.

### تکمیل، شکست و refund

- وقتی editها تمام شد، Inspector گزارش می‌سازد؛
- اگر building value مثبت باشد، job `completed` و inspection `passed` می‌شود؛
- اگر player edit ناسازگار footprint را اشغال کند، ساخت rollback و contract refund می‌شود؛
- اگر Claim/owner از بین برود یا market lock ایجاد شود، job `failed` و rollback می‌شود؛
- cancel توسط owner همهٔ editهای همان contract را اگر هنوز با id مورد انتظار باشند حذف می‌کند و مبلغ را refund می‌نماید؛
- job عمومی progress را به شکل `done/total/percent` نشان می‌دهد.

این طراحی ساخت را از یک عملیات یک‌بارهٔ فوری به یک فرآیند قابل مشاهده، قابل بازرسی و قابل بازگردانی تبدیل می‌کند.

---

## Persistence، امنیت و استقرار

### مسیرهای داده

سرور داده‌ها را زیر `DATA_DIR` قرار می‌دهد؛ در نبود env، مسیر workspace/server استفاده می‌شود:

| فایل/مسیر | داده |
|---|---|
| `worlds/<id>.json` | world، edits، claims، market، rentals، companies، auctions، jobs |
| `worlds/backups/` | backupهای world |
| `players.json` | profile، wallet، claim flag و identity |
| `accounts.json` | username، password digest و account metadata |
| `coin-ledger.json` | ledger تراکنش‌ها |
| `spawn-reservations.json` | رزروهای spawn |
| `database.json` | snapshot سازگاری/SQLite metadata |

برای deployهایی مثل Render که filesystem موقتی دارند، باید `DATA_DIR` روی persistent disk قرار گیرد.

### Atomic JSON writes

`atomicWriteJson` ابتدا snapshot را در فایل موقت می‌نویسد و سپس replace می‌کند تا قطع‌شدن process وسط write، JSON اصلی را نیمه‌کاره نگذارد. server:

- world را تقریباً هر ۳۰ ثانیه save می‌کند؛
- هنگام shutdown profile، account، ledger، spawn reservation و world را ذخیره می‌کند؛
- برای world تا ۵ backup نگه می‌دارد؛
- در SQLite در shutdown `wal_checkpoint(TRUNCATE)` اجرا می‌کند.

### Password و Session

- password با `PBKDF2-SHA256`، ۱۲۰۰۰۰ iteration و salt digest می‌شود؛
- password خام در account ذخیره نمی‌شود؛
- authentication بر اساس `username/password` یا remembered session token انجام می‌گردد؛
- rate limit بر اساس remote address برای تلاش‌های join وجود دارد؛
- در production، `ADMIN_TOKEN` پیش‌فرض ممنوع و حداقل ۲۴ نویسه لازم است؛
- `SESSION_SECRET` باید جدا از admin token، صریح و حداقل ۳۲ نویسه باشد؛
- token در URL پذیرفته نمی‌شود و در localStorage فقط remembered session قرار می‌گیرد.

### Server validation و ضد spoof

سرور به هیچ‌کدام از داده‌های زیر از طرف کلاینت اعتماد مستقیم نمی‌کند:

- fly و mode؛
- x/y/z و onGround؛
- block id و oldId؛
- object name؛
- claim owner/member؛
- market price و seller؛
- rental deposit/rent؛
- wallet balance؛
- prefab price/footprint؛
- auction bid و bidder.

تمام این موارد با state سرور، effective voxel، profile و world record دوباره محاسبه می‌شوند. این امر جلوی spoof کردن fly، teleport، edit، object، claim، bid و Coin را می‌گیرد.

### Rate limit، اندازه و sanitize

- پیام WebSocket بزرگ‌تر از ۶۴ KiB پردازش نمی‌شود؛
- JSON خراب با `bad_json` رد می‌شود؛
- chat به ۲۴۰ نویسه محدود و از tag/control character پاک می‌شود؛
- نام‌ها با `safeName` محدود و sanitize می‌شوند؛
- account authentication rate-limited است؛
- ownership و permission قبل از هر build/use بررسی می‌شود.

### Admin و world management

endpointهای admin با header `x-admin-token` محافظت می‌شوند و شامل:

- لیست worldها؛
- ساخت و انتخاب world؛
- download/upload/save world؛
- تغییر time و mode؛
- مشاهدهٔ players؛
- kick player.

Admin token نباید در URL قرار بگیرد تا در history، proxy log یا Referer ذخیره نشود.

---

## سناریوهای کامل استفاده

### سناریو ۱: اولین Claim رایگان

1. حساب ساخته می‌شود و player به spawn slot تخصیص می‌یابد.
2. `worldState` seed، mode و claims را می‌فرستد.
3. کلاینت map را باز می‌کند و `claimPreview` با x/z می‌فرستد.
4. سرور parcel شانزده‌تایی، spawn buffer، overlap و auction را چک می‌کند.
5. quote اعلام می‌شود؛ چون `hasClaimedFree=false` است، قیمت نهایی صفر است.
6. `claimConfirm` می‌رسد و server دوباره همه‌چیز را validate می‌کند.
7. Claim ذخیره می‌شود، `hasClaimedFree=true`، `claimGranted` و `claims` broadcast می‌شوند.
8. property report اولیه برای dashboard ارسال می‌گردد.

### سناریو ۲: ساخت و راه‌اندازی Shop

1. بازیکن در Claim خود floor، roof، room و door می‌سازد.
2. با `propertyAnalyze` buildingValue و certifiedValue را می‌بیند.
3. در business dashboard نوع Shop و نام فروشگاه را انتخاب می‌کند.
4. server کامل‌بودن property، ownership و نبود rental/market lock را بررسی می‌کند.
5. license با capacity پایهٔ ۸، player fee برابر ۲۴ و هزینه‌های عملیاتی ثبت می‌شود.
6. هر cycle NPC traffic بر اساس tier و demand مشتری می‌سازد.
7. gross income وارد wallet می‌شود و maintenance/salary/advertising کسر می‌گردد.
8. بازیکن دیگر نزدیک می‌شود و `businessVisit` می‌فرستد؛ پس از پرداخت ۲۴ Coin، owner income می‌گیرد.

### سناریو ۳: اجارهٔ یک property

1. owner property کامل، قیمت cycle، deposit و duration را تعیین می‌کند.
2. offer با status `open` منتشر می‌شود.
3. tenant offer را می‌بیند و `rentalAccept` می‌فرستد.
4. server مبلغ deposit + first rent را atomic بررسی می‌کند.
5. deposit hold، rent income و contract ثبت می‌شود.
6. tenant use access دارد ولی build ندارد.
7. در due time، rent خودکار منتقل می‌شود؛ در صورت کمبود wallet، contract past_due می‌شود.
8. با completion/cancel، deposit refund می‌گردد.

### سناریو ۴: فروش کامل خانه در Market

1. owner property را analyze می‌کند و باید completion را پاس کند.
2. premium مثلاً ۲۰٪ می‌دهد.
3. server certified value را از report می‌گیرد و asking price را حساب می‌کند.
4. Claim market locked می‌شود و snapshot building/object/business ایجاد می‌گردد.
5. buyer listing را انتخاب و مبلغ را می‌پردازد.
6. کمیسیون ۵٪ جدا می‌شود؛ seller net دریافت می‌کند.
7. Claim، edits و license business به buyer منتقل می‌شود؛ company link قبلی detach می‌گردد.
8. history، wallet، claims و businesses برای طرفین/جهان refresh می‌شود.

### سناریو ۵: ساخت NPC برای Workshop

1. بازیکن property کامل و Workshop license فعال دارد.
2. از catalog، `Workshop Annex` با قیمت ۶۵۰ Coin را preview می‌کند.
3. اگر footprint چهاردرچهار در Claim جا شود، زمین خشک و صاف باشد و edit/landmark مزاحم نباشد، preview موفق است.
4. order، مبلغ را از wallet کم و job را queued می‌کند.
5. Architect سپس Builder و Decorator با tickهای دوثانیه‌ای edit می‌گذارند.
6. کلاینت blockUpdateها را می‌گیرد و پیشرفت را نشان می‌دهد.
7. Inspector property را analyze می‌کند؛ در موفقیت job completed می‌شود.
8. در conflict، rollback و refund خودکار انجام می‌شود.

### سناریو ۶: رقابت برای Premium Parcel

1. Auction در dashboard با reserve و min next bid دیده می‌شود.
2. player مبلغ اولیه می‌فرستد؛ server آن را held می‌کند.
3. player دوم bid بالاتر می‌دهد؛ مبلغ held نفر اول refund می‌شود.
4. تا پایان timer، current bid و bidder تغییر می‌کند.
5. پس از پایان، winner settle می‌کند و Claim Premium می‌گیرد.
6. تلاش برای خرید عادی همان parcel با `premium_auction` رد می‌شود.

---

## مرزهای فعلی محصول و نکات شفافیت

برای معرفی رسمی، این تمایزها باید دقیق باقی بمانند:

1. VoxelCraft یک پروژهٔ اختصاصی voxel است، نه clone کامل Minecraft و نه ادعای داشتن تمام recipeها، ابزارها یا سیستم‌های vanilla.
2. Registry دارای TNT است، ولی explosion/effect recipe کامل TNT در کد فعلی تعریف نشده است.
3. Chest، crate، barrel و sign interactive هستند، اما سیستم کامل item stack/container یا متن sign مانند یک inventory بازی کامل در این نسخه تعریف نشده است.
4. Water و Lava در rendering و حرکت وجود دارند؛ آب swimming و overlay دارد، Lava گرانش را تغییر می‌دهد، اما Lava damage دوره‌ای مستقل در مسیر فعلی وجود ندارد.
5. نور voxel propagation کامل جایگزین نشده و با lighting، AO، emit brightness، sky و fog ترکیب شده است.
6. world از نظر generator بسیار بزرگ و seedمحور است، ولی مختصات player state در server به ±۱۰۰۰۰۰ و map raster به radius حداکثر ۴۲۰ محدود می‌شوند.
7. player editها persistence دارند؛ base terrain دوباره از seed ساخته می‌شود و به ذخیرهٔ تمام voxelهای طبیعی نیاز ندارد.
8. local mode آزادتر است؛ multiplayer عمداً server-authoritative است و UI محلی نمی‌تواند mode، flight، money یا claim را جعل کند.
9. همهٔ prefabها paid هستند؛ خرید preview با تأیید server و wallet انجام می‌شود.
10. claim اول رایگان است، اما زمین‌های بعدی و propertyهای آماده، NPC property و Premium Auction اقتصاد Coin را فعال می‌کنند.

این شفافیت به محصول کمک می‌کند وعدهٔ درست بدهد: VoxelCraft هم‌زمان یک sandbox قابل ساخت، یک نمونهٔ فنی client/server و یک هستهٔ شهرسازی-اقتصادی است؛ نه یک فهرست بی‌پایان از قابلیت‌هایی که هنوز در source وجود ندارند.

---

## نقشهٔ معماری سورس

### `client/index.html`

منبع اصلی کلاینت و شامل:

- UI و overlayها؛
- Block Registry و procedural atlas؛
- terrain noise و `generateChunkData`؛
- chunk stream و mesh builder؛
- water greedy mesher؛
- AO و materials؛
- camera، raycast، physics و auto-step؛
- mining/place/object interaction؛
- local save/import/export؛
- WebSocket client و state recovery؛
- claim/property/economy dashboards؛
- map Worker و local/server raster؛
- remote player و ambient entity rendering.

### `server.js`

مرجع authority و شامل:

- HTTP server و WebSocket server؛
- account/session/auth؛
- physics config و validation؛
- server noise، terrain، cave، ore، vegetation و cabin؛
- effective voxel و edit commit؛
- claims، permission، co-owner؛
- land registry و quote؛
- wallet، Coin ledger و transfer؛
- market، property، NPC buyback و escrow؛
- rentals و recurring cycle؛
- business cycle، NPC traffic و operating costs؛
- companies و business linking؛
- Premium Land Auction؛
- prefab placement؛
- NPC construction job queue، incremental edit و rollback؛
- world state، save و backup؛
- map raster و master map cache.

### `build-client.js` و `public/index.html`

`build-client.js` source کلاینت را به خروجی قابل سرو public تبدیل می‌کند. `public/index.html` artefact تولیدشده است؛ تغییر اصلی باید در `client/index.html` انجام شود و سپس build اجرا گردد.

### تست‌ها

- `test/server-smoke.test.js`: HTTP/WebSocket، physics config، mode authority، survival flight rejection و player summary.
- `test/physics-contract.test.js`: parity قرارداد client/server و voxel-based collision.
- `test/client-build.test.js`: موفقیت build HTML.

آخرین validation ثبت‌شده برای این workspace:

```text
node --test        ✅ 4 passed, 0 failed
npm run build      ✅ success
node --check server.js ✅ success
git diff --check   ✅ success
```

---

## جمع‌بندی نهایی

VoxelCraft یک جهان مکعبی قابل ساخت را به یک سیستم محصولی چندلایه تبدیل می‌کند: terrain deterministic برای اکتشاف، registry شفاف برای ساخت، physics همسان در client و server برای حرکت قابل اعتماد، renderer کم‌هزینه برای مرورگر، map raster برای مشاهدهٔ مقیاس‌بالا، و لایهٔ مالکیت/اقتصاد برای تبدیل ساختمان به دارایی زنده.

بازیکن می‌تواند از یک قدم ساده—برداشتن block، گذاشتن Door یا ساختن یک مسیر—به چرخه‌ای کامل برسد: Claim بگیرد، property بسازد، ارزش آن را اندازه‌گیری کند، business راه بیندازد، بازدیدکننده جذب کند، با Company همکاری کند، اجاره بدهد، در market بفروشد یا با NPCها توسعه دهد. در پس‌زمینه، server هر حرکت، edit، permission، wallet و معامله را اعتبارسنجی و persistent می‌کند تا جهان هم برای بازیکن خلاق و هم برای یک محصول اجتماعی/اقتصادی قابل اتکا باشد.
