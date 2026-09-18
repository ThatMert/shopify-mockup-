# Mockup Şablon Görselleri

Her materyal için kendi klasörüne, mockup'ı yapılacak **boş ürün fotoğraflarını** koyun.

```
storage/templates/
├─ wood/     front.png  angle.png  detail.png
├─ glass/    front.png  angle.png  backlit.png
├─ metal/    front.png  angle.png  detail.png
├─ plexi/    front.png  angle.png  standing.png
└─ canvas/   front.png  angle.png  interior.png
```

- Dosya adları `config/materials/<materyal>.json` içindeki `templates[].file` ile eşleşmelidir.
- Klasöre **fazladan** attığınız her görsel (`.png/.jpg/.jpeg/.webp`) otomatik olarak yeni bir açı
  şablonu sayılır — JSON'a eklemeniz gerekmez. Etiketi dosya adından türetilir.
- Bir açıya özel prompt vermek isterseniz JSON'daki `templates[].prompt` alanını kullanın.
- Önerilen çözünürlük: kısa kenar en az 1024 px, kare veya 4:5 oran.

Yeni bir materyal eklemek için: `config/materials/<yeni>.json` oluşturun ve
`storage/templates/<yeni>/` klasörüne görselleri atın. Kod değişikliği gerekmez.
