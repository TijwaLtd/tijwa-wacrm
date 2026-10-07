'use client';

// ============================================================
// /<slug>/c/<contactId> — customer's personal data page.
//
// Public capability URL (tenant slug + contact UUID, no login):
//   • Profile form — name / email / phone (used for order confirmations)
//   • Your data    — download a JSON copy of everything we hold,
//                    or request deletion (anonymise-if-law-requires,
//                    otherwise full erase — the server decides)
//
// Every fetch is scoped to the slug; a wrong slug or UUID 404s.
// ============================================================

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  Download,
  FileText,
  Loader2,
  Save,
  ShieldCheck,
  Trash2,
} from 'lucide-react';

import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';

/** Local email check (kept local — customer.ts pulls in the admin
 *  client and must never enter the browser bundle). */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type PageParams = { slug: string; contactId: string };

interface ProfileResponse {
  ok: boolean;
  account: { name: string; logo_url: string | null };
  contact: {
    name: string | null;
    email: string | null;
    phone: string | null;
    profile_completed: boolean;
    consent_accepted: boolean;
  };
}

type DeleteMode = 'anonymised' | 'erased';

export default function CustomerDataPage() {
  const params = useParams<PageParams>();
  const slug = params?.slug ?? '';
  const contactId = params?.contactId ?? '';
  const base = `/api/public/${slug}/profile/${contactId}`;
  const dataUrl = `/api/public/${slug}/data/${contactId}`;

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [brand, setBrand] = useState<string>('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [profileDone, setProfileDone] = useState(false);
  const [consentAccepted, setConsentAccepted] = useState(false);
  // Last-saved values — used to enable Save only when something changed.
  const [saved, setSaved] = useState({ name: '', email: '', phone: '' });

  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletedMode, setDeletedMode] = useState<DeleteMode | null>(null);

  // Initial load — inline async IIFE with a cancel flag (same
  // pattern as /join/[token]: satisfies react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!slug || !contactId || !base) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(base, { cache: 'no-store' });
        if (cancelled) return;
        if (!res.ok) {
          setNotFound(true);
          return;
        }
        const data: ProfileResponse = await res.json();
        if (cancelled) return;
        setBrand(data.account.name);
        setLogoUrl(data.account.logo_url);
        setName(data.contact.name ?? '');
        setEmail(data.contact.email ?? '');
        setPhone(data.contact.phone ?? '');
        setSaved({
          name: data.contact.name ?? '',
          email: data.contact.email ?? '',
          phone: data.contact.phone ?? '',
        });
        setProfileDone(data.contact.profile_completed);
        setConsentAccepted(data.contact.consent_accepted);
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, contactId, base]);

  const trimmedEmail = email.trim();
  const emailInvalid = trimmedEmail !== '' && !EMAIL_RE.test(trimmedEmail);
  const dirty = name !== saved.name || email !== saved.email || phone !== saved.phone;

  const save = async () => {
    if (!name.trim() || emailInvalid) return;
    setSaving(true);
    try {
      const res = await fetch(base, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email: trimmedEmail, phone }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error || 'Could not save your details');
        return;
      }
      setProfileDone(!!data?.profile_completed);
      setSaved({ name, email: trimmedEmail, phone });
      toast.success('Details saved');
    } catch {
      toast.error('Could not save your details');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(dataUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete' }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error || 'Could not complete your request');
        setConfirmOpen(false);
        return;
      }
      setDeletedMode(data.mode as DeleteMode);
      setConfirmOpen(false);
    } catch {
      toast.error('Could not complete your request');
      setConfirmOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
        <Card className="max-w-md text-center">
          <CardHeader>
            <CardTitle>Link not valid</CardTitle>
            <CardDescription>
              This data page link is no longer valid — it may have been used to delete your data, or
              the link was mistyped. You can message the business directly to get a new link.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (deletedMode) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
        <Card className="max-w-md text-center">
          <CardHeader>
            <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <ShieldCheck className="size-6" />
            </div>
            <CardTitle>
              {deletedMode === 'erased' ? 'Your data has been deleted' : 'Your data has been anonymised'}
            </CardTitle>
            <CardDescription>
              {deletedMode === 'erased'
                ? 'Your profile, conversations and message history have been fully erased. Nothing personally identifying is kept.'
                : 'Because you have orders or bookings we must keep for accounting law, your personal details, messages and contact information have been removed and those records are now anonymous. Your name, number and email are no longer stored anywhere.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              If you change your mind or need anything else, message the business on WhatsApp — you
              can start a fresh conversation at any time.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/40">
      <div className="mx-auto max-w-xl px-4 py-8 sm:py-14">
        <header className="mb-6 flex items-center gap-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="size-10 rounded-lg object-cover" />
          ) : (
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-base font-bold text-primary-foreground">
              {brand.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-sm font-semibold text-foreground">{brand}</p>
            <p className="text-xs text-muted-foreground">Your profile &amp; data</p>
          </div>
        </header>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>Your details</CardTitle>
              {consentAccepted ? (
                <Badge className="border-emerald-300 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                  Terms accepted
                </Badge>
              ) : (
                <Badge variant="outline" className="border-amber-300 text-amber-600">
                  Terms not accepted yet
                </Badge>
              )}
            </div>
            <CardDescription>
              We use these to confirm orders and bookings. Name and email are required before you
              can place an order.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">
                Full name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Wanjiku"
                autoComplete="name"
                aria-required="true"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">
                Email address <span className="text-destructive">*</span>
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@example.com"
                autoComplete="email"
                aria-invalid={emailInvalid || undefined}
                aria-required="true"
              />
              {emailInvalid && (
                <p className="text-xs text-destructive">
                  That doesn&apos;t look like a valid email address — or leave it empty for now.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">WhatsApp number</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+254 700 000 000"
                autoComplete="tel"
              />
              <p className="text-xs text-muted-foreground">
                Prefilled from this conversation — edit only if it&apos;s wrong.
              </p>
            </div>
            <Button
              onClick={save}
              disabled={saving || !name.trim() || !dirty || emailInvalid}
            >
              {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
              Save details
            </Button>
            {profileDone ? (
              <p className="text-xs text-emerald-600">
                Profile complete — order confirmations are on.
              </p>
            ) : (
              <p className="text-xs text-amber-600">
                Profile incomplete — add an email address before you place an order.
              </p>
            )}
            {!consentAccepted && (
              <p className="text-xs text-muted-foreground">
                You haven&apos;t accepted the{' '}
                <Link className="text-primary underline" href={`/${slug}/legal/terms`}>
                  Terms
                </Link>{' '}
                yet — you&apos;ll be asked when you next place an order.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="mt-5">
          <CardHeader>
            <CardTitle>Your data</CardTitle>
            <CardDescription>
              Download a copy of everything we hold about you, or ask us to delete it.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <a
              href={dataUrl}
              download
              className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}
            >
              <Download className="mr-2 size-4" />
              Download my data (JSON)
            </a>
            <Button
              variant="outline"
              className="w-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2 className="mr-2 size-4" />
              Delete my data
            </Button>
          </CardContent>
        </Card>

        <div className="mt-6 flex items-center justify-center gap-4 text-xs text-muted-foreground">
          <Link href={`/${slug}/legal/terms`} className="inline-flex items-center gap-1 hover:text-foreground">
            <FileText className="size-3" /> Terms
          </Link>
          <Link href={`/${slug}/legal/privacy`} className="inline-flex items-center gap-1 hover:text-foreground">
            <FileText className="size-3" /> Privacy
          </Link>
        </div>

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent className="bg-popover border-border sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-popover-foreground">
                <Trash2 className="size-5 text-red-600" />
                Delete your data?
              </DialogTitle>
              <DialogDescription className="text-popover-foreground/70">
                We&apos;ll check the law first: if you have no orders or bookings, everything
                (profile, messages, conversations) is fully erased. If you do have them, we keep
                only anonymous financial records — your name, number, email and all messages are
                removed. Either way your personal data stops being linked to you. This cannot be
                undone.
              </DialogDescription>
            </DialogHeader>
            <label className="flex items-start gap-2 text-sm text-popover-foreground">
              <Checkbox
                checked={confirmChecked}
                onCheckedChange={(v) => setConfirmChecked(v === true)}
                className="mt-0.5"
              />
              <span>I understand this cannot be undone.</span>
            </label>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={deleting}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={confirmDelete}
                disabled={!confirmChecked || deleting}
              >
                {deleting ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Trash2 className="mr-2 size-4" />}
                Yes, delete my data
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
