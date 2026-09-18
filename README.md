# AI Mockup → Shopify

Local PC'de çalışan otomatik ürün üretim sistemi: Pinterest'ten (veya elle yüklenen) bir tasarımı
ComfyUI ile farklı ürün materyalleri üzerine gerçekçi mockup'lara dönüştürür, ürün bilgileri ve
sınırsız varyasyon (her biri kendi ölçüsü, SKU'su ve **ayrı fiyatı** ile) tanımlatır, onaydan sonra
Shopify Admin API üzerinden ürünü tüm görselleri ve varyasyonlarıyla oluşturur.

## Akış

İki mod var:

**Toplu üretim (`/board`)** — bir Pinterest koleksiyonundan çok sayıda ürün:

```
board linki → pin grid'inden seçim → materyal + açı seçimi
   → (tasarım × materyal × açı) kuyruğu → inceleme/onay → CSV veya Shopify push
```

Bir **ürün = (pin × materyal)**; seçilen açılar o ürünün görselleri olur. Ölçü/fiyat
tablosu materyalin config dosyasından otomatik uygulanır.

**Tek ürün (`/new`)** — bir pin veya yüklenen dosyadan tek ürün:

```
Pinterest URL / upload  →  ön işleme (sharp)  →  mockup üretimi
      →  ürün + varyasyon formu  →  preview & onay  →  Shopify
```

## Kurulum

```bash
npm install
npx prisma db push
cp .env.example .env    # değerleri doldurun
npm run dev
```

`http://localhost:3000` açılır.

### Ön koşullar

**ComfyUI** çalışıyor olmalı (varsayılan `http://127.0.0.1:8188`) ve **Flux.1 Kontext dev** modelleri kurulu olmalı:

| Dosya | Klasör | Boyut |
|---|---|---|
| `flux1-dev-kontext_fp8_scaled.safetensors` | `models/diffusion_models/` | ~11.9 GB |
| `clip_l.safetensors` | `models/text_encoders/` | ~246 MB |
| `t5xxl_fp8_e4m3fn_scaled.safetensors` | `models/text_encoders/` | ~4.9 GB |
| `ae.safetensors` | `models/vae/` | ~335 MB |

İndirme adresleri:

```
https://huggingface.co/Comfy-Org/flux1-kontext-dev_ComfyUI/resolve/main/split_files/diffusion_models/flux1-dev-kontext_fp8_scaled.safetensors
https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/clip_l.safetensors
https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp8_e4m3fn_scaled.safetensors
```

Modeller eksikse `/api/health` bunu `eksikModeller` altında listeler ve üretim
başlamadan anlaşılır bir hata verilir.

**Pinterest** (opsiyonel): `PINTEREST_ACCESS_TOKEN` tanımlarsanız board pinleri resmî v5 API ile
sayfalı olarak (tümü) çekilir. Token yoksa board sayfası okunur; bu yolda yalnızca ilk yüklenen
pinler görünür ve arayüz bunu "sayfa okuma" etiketiyle uyarır. Gizli board'lar için token gerekir.

**Shopify**: Shopify **1 Ocak 2026'dan itibaren mağaza admin'inde yeni "custom app" oluşturmayı
kaldırdı**; artık uygulamalar [Dev Dashboard](https://shopify.dev/docs/apps/build/dev-dashboard)'da
açılıyor ve tek seferlik `shpat_` token yerine **Client ID + Client Secret** veriliyor. Access token
bu ikisiyle *client credentials grant* ile alınır (24 saat geçerli; `lib/shopify/client.ts` token'ı
bellekte tutup süresi dolmadan yeniler).

1. Dev Dashboard → **Apps** → uygulamanı oluştur (aynı organizasyonda olan bir development store ile).
2. Uygulamanın **Settings** sekmesinden **Client ID** ve **Client secret**'ı kopyala.
3. İzinleri (scope) uygulamanın Dev Dashboard ayarlarından ver: `write_products`, `read_products`,
   `write_files`, `read_files`. Bunlar token isteğinde gönderilmez, uygulama sürümünden gelir.
4. `.env`: `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`.

> Client credentials akışı **yalnızca uygulama ile mağaza aynı Shopify organizasyonundaysa** çalışır.
> Elinde eski bir admin custom app'in `shpat_` token'ı varsa onu `SHOPIFY_ADMIN_TOKEN` olarak
> vermek de yeterlidir; kod ikisini de destekler.
>
> `shpss_…` değeri **client secret**'tir, doğrudan API token olarak kullanılamaz — `X-Shopify-Access-Token`
> başlığında gönderilirse Shopify `401 Invalid API key or access token` döner. Kod bu karışıklığı
> istek gitmeden önce yakalayıp açıklıyor.

Kurulumun doğruluğunu `http://localhost:3000/api/health` adresinden kontrol edebilirsiniz.

## Kullanım

1. **Şablonları yönet** (`/templates`) — her materyal için boş ürün fotoğraflarını yükleyin.
2. **Yeni ürün oluştur** (`/new`) — Pinterest pin URL'si yapıştırın veya tasarımı yükleyin.
3. Materyal ve açıları seçip mockup üretin (tek GPU için sırayla işlenir).
4. Ürün bilgilerini ve varyasyonları girin.
5. Önizlemeyi kontrol edip Shopify'a gönderin.

> Ürün mağazada **DRAFT** olarak oluşturulur; kontrol edip kendiniz yayınlarsınız.

## Yeni materyal eklemek

Kod değişikliği gerekmez:

1. `config/materials/<yeni>.json` oluşturun (mevcut bir dosyayı örnek alın).
2. `/templates` sayfasından o materyalin görsellerini yükleyin.

Bir materyale **yeni açı** eklemek için `/templates` sayfasındaki "Yeni açı ekle" kutusunu kullanın —
klasöre düşen her ekstra görsel otomatik olarak yeni bir açı sayılır. Açıya özel prompt vermek
isterseniz materyalin JSON'undaki `templates[].prompt` alanını doldurun.

## Yeni ComfyUI workflow'u eklemek

`workflows/` altına API-format bir JSON atın, parametreleri `%%PLACEHOLDER%%` olarak işaretleyin ve
materyal JSON'undaki `workflow` alanında adını verin. Desteklenen placeholder'lar
`workflows/flux_kontext_mockup.json` içindeki `_meta.placeholders` bölümünde listelidir.

## Taşınabilir paket (tek tıkla çalıştırma)

```bash
npm run package
```

`dist/MockupShopify/` altında, Node kurulumu gerektirmeyen, çift tıklanıp çalıştırılabilen bir
klasör üretir (~600 MB, 69 MB'ı gömülü `node.exe`):

| Dosya | İş |
|---|---|
| `Baslat.vbs` | Sunucuyu gizli başlatır ve tarayıcıda `http://localhost:3210` açar |
| `Baslat (konsollu).cmd` | Aynısı, ama logları gösterir (sorun ararken) |
| `Durdur.cmd` | 3210 portundaki sunucuyu kapatır |
| `.env` | Ayarlar — Shopify/Pinterest bilgileri buradan düzenlenir |
| `app/` | `next build --output standalone` çıktısı + config, workflows, şablonlar, veritabanı |

Pakete **materyal/fiyat tabloları**, **mockup şablonları ve `.placement.json` yerleşimleri**,
**ComfyUI workflow'ları** ve **veritabanı** dahildir. Daha önce üretilmiş mockup görselleri
varsayılan olarak alınmaz (yüzlerce MB olabiliyor); istenirse:

```bash
npm run package -- --with-media
```

Paketleme sırasında dikkat edilenler (hepsi `scripts/package-portable.mjs` içinde yorumlu):

- `outputFileTracingRoot` sabitlenmezse Next, `D:\` altındaki başka bir lock dosyası yüzünden
  çalışma alanı kökünü yanlış tahmin ediyor ve çıktı iç içe giriyor.
- Next'in dosya izleyicisi `storage/` altını da standalone çıktısına kopyalıyor; paketleyici bunu
  temizleyip yalnızca şablonları koyuyor.
- İzleyici bazı çalışma zamanı dosyalarını atlıyor (`cpu-profile.js`, `@swc/helpers`). Proje içinde
  test ederken fark edilmiyor çünkü Node üst klasördeki `node_modules`'a düşüyor. Bu yüzden
  bağımlılıklar pakette `npm ci --omit=dev` ile baştan kuruluyor.
- Prisma `file:` yollarını **şema dosyasına göre** çözüyor; pakette `DATABASE_URL="file:./dev.db"`
  olmalı (`app/prisma/` içinden).

Klasörü olduğu gibi başka bir Windows bilgisayara kopyalayabilirsiniz.

## Mimari

| Klasör | Sorumluluk |
|---|---|
| `lib/source/` | Pinterest pin ve **board** çözümleme (v5 API + sayfa okuma) ve indirme |
| `lib/batch/` | Toplu üretim orkestrasyonu: (pin × materyal) taslakları ve iş kuyruğu |
| `lib/export/` | Shopify içe aktarma CSV'si |
| `lib/image/` | sharp ön işleme (trim, resize, padding) ve çıktı kaydetme |
| `lib/comfy/` | ComfyUI client (HTTP + WebSocket), graph placeholder motoru, seri job kuyruğu |
| `lib/registry/` | `config/materials/*.json` yükleyici + disk şablonlarıyla birleştirme |
| `lib/product/` | Varyasyon doğrulama, SKU üretimi, fiyat normalizasyonu |
| `lib/shopify/` | Admin GraphQL client ve yayınlama akışı |
| `app/api/` | REST uçları |
| `components/` | Sihirbaz arayüzü |

Katmanlar birbirine yalnızca DB kayıtları ve dosya yolları üzerinden bağlıdır.

### Flux.1 Kontext dev hakkında

`workflows/flux_kontext_mockup.json`, ComfyUI'nin resmî *Image Edit (Flux.1 Kontext Dev)*
şablonundan türetilmiştir; ancak iki noktada ondan ayrılır:

Resmî şablon iki referansı `ImageStitch` ile **yan yana birleştirip** çıktıyı da o birleşik
tuval boyutunda üretir — yani sonuçta iki görsel yan yana çıkar. Burada şablonun kendi
notunda önerilen yol kullanıldı: her referans ayrı ayrı VAE'den geçirilip **`ReferenceLatent`
zinciriyle** koşullandırılıyor, örnekleme latenti ise şablonun latenti oluyor. Böylece çıktı
mockup şablonuyla aynı ölçüde kalıyor.

- `image_1` = mockup şablonu (boş ürün fotoğrafı)
- `image_2` = uygulanacak tasarım
- Flux negatif prompt kullanmaz; negatif koşul `ConditioningZeroOut` ile üretilir.
- Materyal JSON'undaki `defaults.cfg` değeri Kontext'te **FluxGuidance**'a gider (KSampler cfg'si
  sabit 1.0'dır). 2.0–3.5 arası önerilir.

> 8 GB VRAM'de fp8 model tam sığmaz; ağırlıklar RAM'den akıtılır ve ilk üretim uzun sürer.
> Model VRAM'de kaldığı sürece sonraki işler hızlanır.

### Üretim yöntemi seçimi

Bir açı üç yoldan biriyle üretilir:

| method | Ne yapar | Süre |
|---|---|---|
| `composite` | Tasarımı yerleşim dörtgenine homografi ile oturtur; maske warp'ın alfasından üretilir, şablonun ışık/gölgesi luminans modülasyonuyla (multiply karşılığı), cam/pleksi yansıması parlaklık eşiğiyle (screen karşılığı) uygulanır. Tasarım piksel piksel korunur. | ~0.3 sn |
| `composite+harmonize` | Yukarıdakinin çıktısını `workflows/harmonize_flux.json` ile **denoise 0.25** bir FLUX img2img pasından geçirir: kenarları yumuşatır, renk geçişlerini doğallaştırır. Kompozisyon değişmez. Pas başarısız olursa kompozisyon çıktısı korunur ve karta uyarı düşer. | GPU'ya bağlı |
| `comfy` | Baştan sona ComfyUI (Flux Kontext) — sahne/ortam üretebilir, tutarlılığı düşüktür. | dakikalar |

Sıra: `templates[].method` → `defaultMethod` (materyal) → **auto** (yerleşim tanımlıysa
`composite`, değilse `comfy`). Materyaller `auto` ile gelir; yerleşimi `/templates` sayfasından
tanımladığınız her açı otomatik olarak anında kompozisyona geçer.

Yansıma (`screen`) katkısı materyalin `reflective` alanına bağlıdır: cam/pleksi/metal'de açık,
ahşap/canvas'ta kapalıdır. İnce ayar için yerleşim dosyasındaki `multiplyOpacity` /
`screenOpacity` alanlarını kullanabilirsiniz.

Harmonizasyon pası yalnızca çekirdek ComfyUI node'larını kullanır; ek custom node kurulumu
gerekmez.

## Notlar

- Tek GPU varsayımıyla işler `lib/comfy/queue.ts` içinde **sırayla** çalıştırılır.
- `storage/` altındaki üretilmiş dosyalar git'e girmez; `storage/templates/` içindekiler kalıcıdır.
- Fiyatlar ondalık hassasiyeti korumak için string olarak saklanır.
