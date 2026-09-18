'use client';

import { useEffect, useState } from 'react';
import { Button, Card, ErrorBox, Field, Input } from './ui';

type AuthMode = 'client_credentials' | 'admin_token';

interface PublicSettings {
  domain: string;
  apiVersion: string;
  authMode: AuthMode;
  clientId: string;
  clientSecretMasked: string | null;
  adminTokenMasked: string | null;
  source: 'database' | 'env';
}

interface TestResult {
  ok: boolean;
  detail: string;
  scopes?: string[];
  eksikIzinler?: string[];
}

const REQUIRED_SCOPES = ['read_products', 'write_products', 'read_files', 'write_files'];

/**
 * Kullanicinin kendi Shopify magazasini arayuzden baglamasi.
 * Gizli alanlar sunucudan asla acik gelmez; bos birakilirsa kayitli deger korunur.
 */
export function ShopifySettingsForm() {
  const [loaded, setLoaded] = useState<PublicSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const [domain, setDomain] = useState('');
  const [apiVersion, setApiVersion] = useState('2026-04');
  const [authMode, setAuthMode] = useState<AuthMode>('client_credentials');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [adminToken, setAdminToken] = useState('');

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [test, setTest] = useState<TestResult | null>(null);

  function apply(s: PublicSettings | null) {
    setLoaded(s);
    if (!s) return;
    setDomain(s.domain);
    setApiVersion(s.apiVersion);
    setAuthMode(s.authMode);
    setClientId(s.clientId);
    setClientSecret('');
    setAdminToken('');
  }

  useEffect(() => {
    fetch('/api/settings/shopify')
      .then((r) => r.json())
      .then((j) => apply(j.settings))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  async function runTest() {
    setTesting(true);
    setTest(null);
    try {
      const res = await fetch('/api/settings/shopify/test', { method: 'POST' });
      setTest(await res.json());
    } catch (e) {
      setTest({ ok: false, detail: String(e) });
    } finally {
      setTesting(false);
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    setTest(null);
    try {
      const res = await fetch('/api/settings/shopify', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, apiVersion, authMode, clientId, clientSecret, adminToken }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      apply(json.settings);
      setNotice('Ayarlar kaydedildi. Bağlantı test ediliyor…');
      await runTest();
      setNotice('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    if (!confirm('Kayıtlı Shopify ayarları silinsin mi? (.env tanımlıysa ona dönülür)')) return;
    const res = await fetch('/api/settings/shopify', { method: 'DELETE' });
    const json = await res.json();
    apply(json.settings);
    if (!json.settings) {
      setDomain('');
      setClientId('');
    }
    setTest(null);
    setNotice('Kayıtlı ayarlar silindi.');
  }

  if (loading) return <p className="text-sm text-neutral-500">Ayarlar yükleniyor…</p>;

  const secretSaved =
    authMode === 'client_credentials' ? loaded?.clientSecretMasked : loaded?.adminTokenMasked;

  return (
    <div className="space-y-6">
      <Card
        title="Shopify mağazası"
        hint="Ürünlerin gönderileceği mağaza. Bilgiler sunucuda şifreli saklanır ve tarayıcıya asla açık gönderilmez."
      >
        {loaded?.source === 'env' && (
          <p className="mb-4 rounded-md border border-amber-900/60 bg-amber-950/30 px-3 py-2 text-xs text-amber-300">
            Şu an bağlantı <code>.env</code> dosyasındaki değerlerden geliyor. Buradan kaydederseniz
            bu ayarlar önceliği alır.
          </p>
        )}

        <form onSubmit={save} className="space-y-5">
          <Field label="Mağaza adresi *" hint="magaza-adi.myshopify.com — sadece mağaza adını da yazabilirsiniz.">
            <Input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="magaza-adi.myshopify.com"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>

          <div>
            <span className="mb-2 block text-xs font-medium text-neutral-400">Kimlik doğrulama</span>
            <div className="grid gap-2 sm:grid-cols-2">
              <ModeOption
                active={authMode === 'client_credentials'}
                onClick={() => setAuthMode('client_credentials')}
                title="Client ID + Secret"
                desc="Dev Dashboard uygulaması (önerilen, 2026 sonrası yeni uygulamalar)"
              />
              <ModeOption
                active={authMode === 'admin_token'}
                onClick={() => setAuthMode('admin_token')}
                title="Admin API token"
                desc="Eski mağaza içi custom app'in shpat_… token'ı"
              />
            </div>
          </div>

          {authMode === 'client_credentials' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Client ID *">
                <Input
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </Field>
              <Field
                label="Client secret *"
                hint={secretSaved ? `Kayıtlı: ${secretSaved} — değiştirmek istemiyorsanız boş bırakın.` : 'shpss_… ile başlar'}
              >
                <Input
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder={secretSaved ?? 'shpss_…'}
                  autoComplete="new-password"
                />
              </Field>
            </div>
          ) : (
            <Field
              label="Admin API access token *"
              hint={secretSaved ? `Kayıtlı: ${secretSaved} — değiştirmek istemiyorsanız boş bırakın.` : 'shpat_… ile başlar'}
            >
              <Input
                type="password"
                value={adminToken}
                onChange={(e) => setAdminToken(e.target.value)}
                placeholder={secretSaved ?? 'shpat_…'}
                autoComplete="new-password"
              />
            </Field>
          )}

          <Field label="API sürümü" hint="Değiştirmeniz gerekmez.">
            <Input
              value={apiVersion}
              onChange={(e) => setApiVersion(e.target.value)}
              className="max-w-[10rem]"
            />
          </Field>

          <ErrorBox>{error}</ErrorBox>
          {notice && <p className="text-sm text-emerald-400">{notice}</p>}

          <div className="flex flex-wrap items-center gap-3 border-t border-neutral-800 pt-4">
            <Button type="submit" disabled={saving || !domain.trim()}>
              {saving ? 'Kaydediliyor…' : 'Kaydet ve test et'}
            </Button>
            <Button type="button" variant="ghost" onClick={runTest} disabled={testing || !loaded}>
              {testing ? 'Test ediliyor…' : 'Bağlantıyı test et'}
            </Button>
            {loaded?.source === 'database' && (
              <Button type="button" variant="danger" onClick={reset} className="ml-auto">
                Kayıtlı ayarları sil
              </Button>
            )}
          </div>
        </form>
      </Card>

      {test && <TestResultCard result={test} />}

      <Card title="Kimlik bilgileri nereden alınır?">
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-neutral-400">
          <li>
            <a
              href="https://dev.shopify.com/dashboard"
              target="_blank"
              rel="noreferrer"
              className="text-emerald-400 underline"
            >
              Shopify Dev Dashboard
            </a>{' '}
            → <b>Apps</b> → yeni uygulama oluşturun (mağazanızla aynı organizasyonda).
          </li>
          <li>
            Uygulamanın sürümünde şu izinleri verin ve <b>sürümü yayınlayın</b>:{' '}
            <code className="text-neutral-300">{REQUIRED_SCOPES.join(', ')}</code>
          </li>
          <li>Uygulamayı mağazanıza kurun.</li>
          <li>
            <b>Settings</b> sekmesinden <b>Client ID</b> ve <b>Client secret</b>'ı kopyalayıp buraya
            yapıştırın.
          </li>
        </ol>
      </Card>
    </div>
  );
}

function ModeOption({
  active,
  onClick,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-3 py-2.5 text-left transition ${
        active
          ? 'border-emerald-500 bg-emerald-950/30'
          : 'border-neutral-800 hover:border-neutral-600'
      }`}
    >
      <span className={`block text-sm ${active ? 'text-emerald-300' : 'text-neutral-200'}`}>{title}</span>
      <span className="mt-0.5 block text-xs text-neutral-500">{desc}</span>
    </button>
  );
}

function TestResultCard({ result }: { result: TestResult }) {
  const scopes = result.scopes ?? [];
  return (
    <section
      className={`rounded-lg border p-5 ${
        result.ok ? 'border-emerald-800 bg-emerald-950/20' : 'border-red-900/70 bg-red-950/20'
      }`}
    >
      <p className={`text-sm font-medium ${result.ok ? 'text-emerald-300' : 'text-red-300'}`}>
        {result.ok ? '✓ Bağlantı başarılı' : '✕ Bağlantı kurulamadı'}
      </p>
      <p className="mt-1 break-words text-sm text-neutral-300">{result.detail}</p>

      {scopes.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {REQUIRED_SCOPES.map((s) => {
            // write_X izni read_X'i kapsar; token'da read_X ayrica listelenmez.
            const has =
              scopes.includes(s) ||
              (s.startsWith('read_') && scopes.includes(`write_${s.slice(5)}`));
            return (
              <li
                key={s}
                className={`rounded px-2 py-0.5 text-xs ${
                  has ? 'bg-emerald-950 text-emerald-400' : 'bg-red-950 text-red-300'
                }`}
              >
                {has ? '✓' : '✕'} {s}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
