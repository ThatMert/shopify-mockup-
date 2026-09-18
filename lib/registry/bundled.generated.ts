// BU DOSYA OTOMATIK URETILIR — elle duzenlemeyin.
// Kaynak: config/materials/*.json, config/csv.json  ·  Uretici: scripts/bundle-config.mjs

export const BUNDLED_MATERIALS: Array<{ file: string; data: unknown }> = [
  {
    "file": "canvas.json",
    "data": {
      "id": "canvas",
      "label": "Canvas",
      "enabled": true,
      "workflow": "flux_kontext_mockup.json",
      "defaultMethod": "auto",
      "reflective": false,
      "shopifyTag": "canvas",
      "vendor": "",
      "productType": "Canvas Tablo",
      "productCategory": "Home & Garden > Decor > Artwork",
      "tags": [
        "kanvas tablo",
        "duvar dekoru",
        "tablo"
      ],
      "optionName": "Ölçü",
      "titleTemplate": "{{design}} Canvas Tablo",
      "bodyTemplate": "<p>{{title}} — gerdirilmiş kanvas üzerine baskı ile üretilen dekoratif kanvas tablo.</p>\n<ul>\n  <li>380 gr kanvas kumaş üzerine solmaz mürekkeple baskı.</li>\n  <li>Ahşap şasiye gerdirilmiş, kenarlardan katlanmış (galeri sarımı) olarak gönderilir.</li>\n  <li>Mat yüzey — ışık yansıması yapmaz.</li>\n  <li>Arkasında hazır askı aparatı ile gelir.</li>\n</ul>\n<p>Ölçünüzü seçerek sepete ekleyebilirsiniz. Ürün özel üretim olduğu için kargoya veriliş süresi 2-4 iş günüdür.</p>",
      "sizes": [
        {
          "size": "50cm x 70cm",
          "price": "1099.00",
          "grams": 0
        },
        {
          "size": "70cm x 100cm",
          "price": "1299.00",
          "grams": 0
        },
        {
          "size": "100cm x 150cm",
          "price": "1599.00",
          "grams": 0
        }
      ],
      "basePrompt": "Replace the artwork on the stretched canvas in the first image with the artwork from the second image. Cover the printed area completely, edge to edge, wrapping naturally around the frame edges. Match the canvas perspective so the artwork lies flat, and let the woven fabric texture remain visible through the ink. Keep the frame, the wall, the room, the lighting and the cast shadow exactly as they are.",
      "defaults": {
        "width": 1024,
        "height": 1024,
        "steps": 20,
        "cfg": 2.5,
        "sampler": "euler",
        "scheduler": "simple",
        "shift": 3.16,
        "negativePrompt": ""
      },
      "harmonize": {
        "workflow": "harmonize_flux.json",
        "denoise": 0.25,
        "steps": 20,
        "guidance": 2.5,
        "prompt": "blend the artwork seamlessly into the product surface, soften the seams, natural lighting and material texture, photorealistic product photo"
      },
      "templates": [
        {
          "id": "front",
          "label": "Önden",
          "file": "front.png",
          "method": "auto",
          "prompt": "Keep the straight-on frontal framing of the canvas on the wall."
        },
        {
          "id": "angle",
          "label": "Açılı",
          "file": "angle.png",
          "method": "auto",
          "prompt": "Keep the three-quarter angle and the gallery-wrapped side edge."
        },
        {
          "id": "interior",
          "label": "Ortam",
          "file": "interior.png",
          "method": "auto",
          "prompt": "Keep the interior room, the furniture, the floor and the daylight untouched; only the artwork on the canvas changes."
        }
      ]
    }
  },
  {
    "file": "glass.json",
    "data": {
      "id": "glass",
      "label": "Cam",
      "enabled": true,
      "workflow": "flux_kontext_mockup.json",
      "defaultMethod": "auto",
      "reflective": true,
      "shopifyTag": "cam",
      "vendor": "",
      "productType": "Cam Tablo",
      "productCategory": "Home & Garden > Decor > Artwork",
      "tags": [
        "cam tablo",
        "duvar dekoru",
        "tablo"
      ],
      "optionName": "Ölçü",
      "titleTemplate": "{{design}} Cam Tablo",
      "bodyTemplate": "<p>{{title}} — 4mm temperli cam üzerine UV baskı ile üretilen dekoratif cam tablo.</p>\n<ul>\n  <li>4mm temperli cam, UV baskı — solmaz, ısıya ve neme dayanıklıdır.</li>\n  <li>Cilalı kenarlar; duvara montaj için krom aynalı tutucular ürünle birlikte gönderilir.</li>\n  <li>Masaüstü ölçüsü (14cm x 20cm) ayaklı olarak gönderilir, montaj gerektirmez.</li>\n  <li>Renkler ekran ayarlarına göre hafif farklılık gösterebilir.</li>\n</ul>\n<p>Ölçünüzü seçerek sepete ekleyebilirsiniz. Ürün özel üretim olduğu için kargoya veriliş süresi 2-4 iş günüdür.</p>",
      "sizes": [
        {
          "size": "14cm x 20cm (Masaüstü, ayaklı)",
          "price": "1000.00",
          "grams": 0
        },
        {
          "size": "30cm x 45cm",
          "price": "1999.00",
          "grams": 0
        },
        {
          "size": "45cm x 65cm",
          "price": "2699.00",
          "grams": 0
        },
        {
          "size": "70cm x 100cm",
          "price": "4499.00",
          "grams": 0
        }
      ],
      "basePrompt": "Replace the artwork printed on the glass panel in the first image with the artwork from the second image. Cover the printed area completely, edge to edge, leaving no trace of the previous design. Match the panel's perspective and tilt so the artwork lies flat on the surface. Keep the panel's shape, thickness, polished edges, mounting standoffs, the background, the lighting and the cast shadow exactly as they are. Keep the glass reflections and specular highlights visible over the new artwork.",
      "defaults": {
        "width": 1024,
        "height": 1024,
        "steps": 20,
        "cfg": 2.5,
        "sampler": "euler",
        "scheduler": "simple",
        "shift": 3.16,
        "negativePrompt": ""
      },
      "harmonize": {
        "workflow": "harmonize_flux.json",
        "denoise": 0.25,
        "steps": 20,
        "guidance": 2.5,
        "prompt": "blend the artwork seamlessly into the product surface, soften the seams, natural lighting and material texture, photorealistic product photo"
      },
      "templates": [
        {
          "id": "front",
          "label": "Önden",
          "file": "front.png",
          "method": "auto",
          "prompt": "Keep the straight-on frontal framing."
        },
        {
          "id": "angle",
          "label": "Açılı",
          "file": "angle.png",
          "method": "auto",
          "prompt": "Keep the three-quarter angle and the bright highlight along the near polished edge."
        },
        {
          "id": "backlit",
          "label": "Arkadan Işıklı",
          "file": "backlit.png",
          "method": "auto",
          "prompt": "Keep the backlight passing through the glass and the glowing edges."
        }
      ]
    }
  },
  {
    "file": "metal.json",
    "data": {
      "id": "metal",
      "label": "Metal",
      "enabled": true,
      "workflow": "flux_kontext_mockup.json",
      "defaultMethod": "auto",
      "reflective": true,
      "shopifyTag": "metal",
      "vendor": "",
      "productType": "Metal Tablo",
      "productCategory": "Home & Garden > Decor > Artwork",
      "tags": [
        "metal tablo",
        "duvar dekoru",
        "tablo"
      ],
      "optionName": "Ölçü",
      "titleTemplate": "{{design}} Metal Tablo",
      "bodyTemplate": "",
      "sizes": [],
      "basePrompt": "Replace the artwork on the metal panel in the first image with the artwork from the second image. Cover the printed area completely, edge to edge. Match the panel's perspective so the artwork lies flat, and keep the brushed metal texture and metallic specular reflections visible over the print. Keep the panel's shape, edges, mounting hardware, the background, the lighting and the cast shadow exactly as they are.",
      "defaults": {
        "width": 1024,
        "height": 1024,
        "steps": 20,
        "cfg": 2.5,
        "sampler": "euler",
        "scheduler": "simple",
        "shift": 3.16,
        "negativePrompt": ""
      },
      "harmonize": {
        "workflow": "harmonize_flux.json",
        "denoise": 0.25,
        "steps": 20,
        "guidance": 2.5,
        "prompt": "blend the artwork seamlessly into the product surface, soften the seams, natural lighting and material texture, photorealistic product photo"
      },
      "templates": [
        {
          "id": "front",
          "label": "Önden",
          "file": "front.png",
          "method": "auto",
          "prompt": "Keep the straight-on frontal framing."
        },
        {
          "id": "angle",
          "label": "Açılı",
          "file": "angle.png",
          "method": "auto",
          "prompt": "Keep the three-quarter angle and the metallic sheen along the edge."
        },
        {
          "id": "detail",
          "label": "Yakın Detay",
          "file": "detail.png",
          "method": "auto",
          "prompt": "Keep the close-up framing and the brushed metal grain."
        }
      ]
    }
  },
  {
    "file": "plexi.json",
    "data": {
      "id": "plexi",
      "label": "Plexi",
      "enabled": true,
      "workflow": "flux_kontext_mockup.json",
      "defaultMethod": "auto",
      "reflective": true,
      "shopifyTag": "plexi",
      "vendor": "",
      "productType": "Pleksiglas Tablo",
      "productCategory": "Home & Garden > Decor > Artwork",
      "tags": [
        "pleksi tablo",
        "duvar dekoru",
        "tablo"
      ],
      "optionName": "Ölçü",
      "titleTemplate": "{{design}} Pleksiglas Tablo",
      "bodyTemplate": "<p>{{title}} — parlak pleksiglas (akrilik) üzerine UV baskı ile üretilen dekoratif tablo.</p>\n<ul>\n  <li>Şeffaf akrilik panel üzerine UV baskı; derinlikli, parlak bir görünüm sağlar.</li>\n  <li>Cilalı kalın kenarlar ışığı kırar ve tabloya çerçevesiz bir hacim kazandırır.</li>\n  <li>Duvara montaj için standoff (mesafeli) tutucular ürünle birlikte gönderilir.</li>\n  <li>Cama göre hafiftir, kırılma riski düşüktür.</li>\n</ul>\n<p>Ölçünüzü seçerek sepete ekleyebilirsiniz. Ürün özel üretim olduğu için kargoya veriliş süresi 2-4 iş günüdür.</p>",
      "sizes": [
        {
          "size": "30cm x 30cm",
          "price": "799.00",
          "grams": 0
        },
        {
          "size": "50cm x 70cm",
          "price": "2499.00",
          "grams": 0
        },
        {
          "size": "60cm x 60cm",
          "price": "1999.00",
          "grams": 0
        },
        {
          "size": "70cm x 100cm",
          "price": "4499.00",
          "grams": 0
        },
        {
          "size": "90cm x 90cm",
          "price": "3999.00",
          "grams": 0
        },
        {
          "size": "100cm x 150cm",
          "price": "8999.00",
          "grams": 0
        }
      ],
      "basePrompt": "Replace the artwork on the acrylic plexiglass panel in the first image with the artwork from the second image. Cover the printed area completely, edge to edge. Match the panel's perspective so the artwork lies flat behind the glossy acrylic. Keep the thick clear edge glow, the polished surface, the panel's shape, the background, the lighting and the cast shadow exactly as they are.",
      "defaults": {
        "width": 1024,
        "height": 1024,
        "steps": 20,
        "cfg": 2.5,
        "sampler": "euler",
        "scheduler": "simple",
        "shift": 3.16,
        "negativePrompt": ""
      },
      "harmonize": {
        "workflow": "harmonize_flux.json",
        "denoise": 0.25,
        "steps": 20,
        "guidance": 2.5,
        "prompt": "blend the artwork seamlessly into the product surface, soften the seams, natural lighting and material texture, photorealistic product photo"
      },
      "templates": [
        {
          "id": "front",
          "label": "Önden",
          "file": "front.png",
          "method": "auto",
          "prompt": "Keep the straight-on frontal framing."
        },
        {
          "id": "angle",
          "label": "Açılı",
          "file": "angle.png",
          "method": "auto",
          "prompt": "Keep the three-quarter angle and the thick polished acrylic edge with its light glow."
        },
        {
          "id": "standing",
          "label": "Ayaklı",
          "file": "standing.png",
          "method": "auto",
          "prompt": "Keep the panel standing on its stand with its soft cast shadow."
        }
      ]
    }
  },
  {
    "file": "wood.json",
    "data": {
      "id": "wood",
      "label": "Ahşap",
      "enabled": true,
      "workflow": "flux_kontext_mockup.json",
      "defaultMethod": "auto",
      "reflective": false,
      "shopifyTag": "ahsap",
      "vendor": "",
      "productType": "Ahşap Tablo",
      "productCategory": "Home & Garden > Decor > Artwork",
      "tags": [
        "ahşap tablo",
        "duvar dekoru",
        "tablo"
      ],
      "optionName": "Ölçü",
      "titleTemplate": "{{design}} Ahşap Tablo",
      "bodyTemplate": "<p>{{title}} — birinci sınıf ahşap panel üzerine doğrudan baskı ile üretilen dekoratif ahşap tablo.</p>\n<ul>\n  <li>Ahşap panel üzerine UV baskı; ahşabın doğal dokusu baskının altından görünür.</li>\n  <li>Mat, yansımasız yüzey — her ışıkta net görünüm.</li>\n  <li>Arkasında hazır askı aparatı ile gelir, montaj için ek parça gerekmez.</li>\n  <li>Ahşap doğal bir malzeme olduğu için doku ve ton her üründe kendine özgüdür.</li>\n</ul>\n<p>Ölçünüzü seçerek sepete ekleyebilirsiniz. Ürün özel üretim olduğu için kargoya veriliş süresi 2-4 iş günüdür.</p>",
      "sizes": [
        {
          "size": "30cm x 45cm",
          "price": "1999.00",
          "grams": 0
        },
        {
          "size": "45cm x 65cm",
          "price": "1699.00",
          "grams": 0
        },
        {
          "size": "70cm x 100cm",
          "price": "4499.00",
          "grams": 0
        }
      ],
      "basePrompt": "Replace the artwork on the wooden panel in the first image with the artwork from the second image. Cover the printed area completely, edge to edge. Match the panel's perspective so the artwork lies flat on the surface, and let the wood grain texture remain subtly visible through the print. Keep the panel's shape, thickness, edges, the background, the lighting and the cast shadow exactly as they are.",
      "defaults": {
        "width": 1024,
        "height": 1024,
        "steps": 20,
        "cfg": 2.5,
        "sampler": "euler",
        "scheduler": "simple",
        "shift": 3.16,
        "negativePrompt": ""
      },
      "harmonize": {
        "workflow": "harmonize_flux.json",
        "denoise": 0.25,
        "steps": 20,
        "guidance": 2.5,
        "prompt": "blend the artwork seamlessly into the product surface, soften the seams, natural lighting and material texture, photorealistic product photo"
      },
      "templates": [
        {
          "id": "front",
          "label": "Önden",
          "file": "front.png",
          "method": "auto",
          "prompt": "Keep the straight-on frontal framing."
        },
        {
          "id": "angle",
          "label": "Açılı",
          "file": "angle.png",
          "method": "auto",
          "prompt": "Keep the three-quarter angle and the visible side edge of the panel."
        },
        {
          "id": "detail",
          "label": "Yakın Detay",
          "file": "detail.png",
          "method": "auto",
          "prompt": "Keep the close-up framing and the visible wood grain detail."
        }
      ]
    }
  }
];

export const BUNDLED_CSV: unknown = {
  "_comment": "Shopify urun ice aktarma CSV'sinde sabit kalan sutun degerleri. Magazanizin mevcut export'una gore duzenleyin.",
  "published": "true",
  "status": "active",
  "giftCard": "false",
  "inventoryTracker": "shopify",
  "inventoryQty": 100,
  "inventoryPolicy": "continue",
  "fulfillmentService": "manual",
  "requiresShipping": "true",
  "taxable": "true",
  "weightUnit": "kg",
  "defaultVendor": ""
};
