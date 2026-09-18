'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, ErrorBox, Input } from '@/components/ui';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      // Yalnizca site ici yollara yonlendir (acik yonlendirme olmasin).
      const next = params.get('next') ?? '/';
      router.replace(next.startsWith('/') && !next.startsWith('//') ? next : '/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Şifre"
        autoFocus
        autoComplete="current-password"
      />
      <ErrorBox>{error}</ErrorBox>
      <Button type="submit" disabled={busy || !password} className="w-full">
        {busy ? 'Giriş yapılıyor…' : 'Giriş yap'}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="mx-auto mt-16 max-w-sm">
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-6">
        <h2 className="text-base font-medium text-neutral-100">Giriş</h2>
        <p className="mb-5 mt-1 text-sm text-neutral-500">Devam etmek için şifreyi girin.</p>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
