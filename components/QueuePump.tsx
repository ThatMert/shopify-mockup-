'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Bulut modunda mockup kuyrugunu ilerletir.
 *
 * Netlify'da arka planda surekli calisan bir surec yok: isler veritabaninda
 * "queued" olarak bekler ve ancak biri /api/queue/tick'i cagirdiginda islenir.
 * Bu bilesen sayfa acikken bekleyen is kaldikca tick'i arka arkaya cagirir;
 * kuyruk bosalinca durur ve yeni is acildiginda ('queue:kick' olayi) yeniden
 * baslar. Yerelde sunucu "local" dondugu icin ilk cagridan sonra tamamen susar.
 *
 * Ayni anda birden fazla sekme acik olsa da sorun yok: sunucu isleri atomik
 * olarak kapar, ayni is iki kez calismaz.
 */
export function QueuePump() {
  const pathname = usePathname();
  const onLogin = pathname === '/login';

  useEffect(() => {
    // Oturum yokken tick 401 doner; giris sayfasinda pompa hic calismaz.
    if (onLogin) return;
    let stopped = false;
    let running = false;
    let localMode = false;

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    async function pump() {
      if (running || stopped || localMode) return;
      running = true;
      let failures = 0;

      try {
        while (!stopped) {
          let json: { mode?: string; remaining?: number; error?: string };
          try {
            const res = await fetch('/api/queue/tick', { method: 'POST' });
            // Oturum dusmusse tekrar denemenin anlami yok; sessizce dur.
            if (res.status === 401) break;
            json = await res.json();
            if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
            failures = 0;
          } catch (err) {
            // Fonksiyon zaman asimi vb. gecici hatalarda artan beklemeyle tekrar dene.
            failures++;
            console.warn('[queue] tick başarısız:', err);
            if (failures >= 6) break;
            await sleep(Math.min(30_000, 2_000 * 2 ** failures));
            continue;
          }

          if (json.mode === 'local') {
            localMode = true;
            break;
          }
          if (!json.remaining) break;
          // Baska bir sekme ayni anda calisiyorsa islenecek is bulamayabiliriz;
          // kisa bir nefes payi birakip devam et.
          await sleep(500);
        }
      } finally {
        running = false;
      }
    }

    const kick = () => void pump();
    window.addEventListener('queue:kick', kick);
    void pump(); // sayfa yeniden yuklendiginde yarim kalan isleri de surdur

    return () => {
      stopped = true;
      window.removeEventListener('queue:kick', kick);
    };
  }, [onLogin]);

  return null;
}
