import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Phone, MessageCircle, CheckCircle2, AlertTriangle, ArrowRight, Tag, StickyNote, History,
  Copy, ListChecks, CalendarClock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Lead, CallOutcome, NextActionType, TouchChannel, WaStatus, CallStage, LeadDiscovery, DiscoveryKey, PlannedCall } from '@/myt/lib/types';
import {
  callOutcomes, nextActions, suggestedAction, isoIn, waLink,
  marketplaceTags, tagLabel, isConnected, OWNERSHIP_DAYS,
} from '@/myt/lib/ownership';
import {
  WA_STATUSES, WA_LABELS, suggestedWaLabel, waStatusMeta, CALL_STAGES, stageFields,
  currentStage, filled, missingForStage, missingAll, discoveryProgress,
  nextCallDefaultHours, nextStage, waOpener,
} from '@/myt/lib/call-plan';
import { toast } from 'sonner';

export interface TouchPayload {
  channel: TouchChannel;
  outcome: CallOutcome;
  notes: string;
  action: NextActionType;
  dueAt: string;
  actionNote: string;
  tags: string[];
  waStatus?: WaStatus;
  waLabel?: string;
  stage: CallStage;
  discovery: LeadDiscovery;
  captured: DiscoveryKey[];
  nextCall: PlannedCall;
}

interface Props {
  lead: Lead | null;
  open: boolean;
  /** 'claim' = first contact (abandon releases the lead). 'touch' = repeat contact on an owned lead. */
  mode?: 'claim' | 'touch';
  /** Pre-selected channel from the button the user pressed. */
  channel?: TouchChannel;
  onOpenChange: (v: boolean) => void;
  onComplete: (payload: TouchPayload) => void;
  onAbandon: () => void;
}

const STEP_LABELS = ['WhatsApp', 'Contact', 'Collect info', 'Outcome', 'Next call'];

/**
 * Claim → WhatsApp check & label → contact → collect the info this call owes →
 * log outcome + tags → plan the next call. Call 1 basics, Call 2 schedule, Call 3 booking.
 */
export function ClaimCallSheet({ lead, open, mode = 'claim', channel = 'call', onOpenChange, onComplete, onAbandon }: Props) {
  const [step, setStep] = useState(0);
  const [ch, setCh] = useState<TouchChannel>(channel);
  const [waStatus, setWaStatus] = useState<WaStatus | null>(null);
  const [waLabel, setWaLabel] = useState<string>('');
  const [discovery, setDiscovery] = useState<LeadDiscovery>({});
  const [outcome, setOutcome] = useState<CallOutcome | null>(null);
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [action, setAction] = useState<NextActionType | null>(null);
  const [dueAt, setDueAt] = useState('');
  const [actionNote, setActionNote] = useState('');
  const [nextAt, setNextAt] = useState('');
  const [nextPurpose, setNextPurpose] = useState('');
  const [nextSt, setNextSt] = useState<CallStage>(1);

  const stage: CallStage = lead ? (currentStage(lead) as CallStage) : 1;

  useEffect(() => {
    if (open && lead) {
      const st = currentStage(lead) as CallStage;
      setStep(0); setCh(channel); setOutcome(null); setNotes('');
      setTags(lead.tags ?? []); setAction(null); setDueAt(''); setActionNote('');
      setWaStatus(lead.waStatus ?? null);
      setWaLabel(lead.waLabel ?? suggestedWaLabel(st));
      setDiscovery({ ...(lead.discovery ?? {}) });
      setNextSt(st); setNextAt(''); setNextPurpose('');
    }
  }, [open, channel, lead?.id]);

  const before = lead?.discovery ?? {};
  const captured = useMemo(
    () => (Object.keys(discovery) as DiscoveryKey[]).filter((k) => (discovery[k] ?? '').trim() && discovery[k] !== before[k]),
    [discovery, before],
  );
  const progress = discoveryProgress(discovery);
  const stillMissing = missingAll(discovery);
  const stageMissing = missingForStage(discovery, stage);

  if (!lead) return null;

  const close = (release: boolean) => {
    if (release) onAbandon();
    onOpenChange(false);
  };

  const setField = (k: DiscoveryKey, v: string) => setDiscovery((p) => ({ ...p, [k]: v }));

  const pickOutcome = (o: CallOutcome) => {
    setOutcome(o);
    const suggested = suggestedAction[o];
    setAction(suggested);
    const def = nextActions.find((a) => a.value === suggested)!;
    setDueAt(toLocalInput(isoIn(def.defaultInHours)));
    const ns = nextStage(stage, discovery);
    setNextSt(ns);
    setNextAt(toLocalInput(isoIn(nextCallDefaultHours(stage, isConnected(o)))));
    setNextPurpose(CALL_STAGES.find((c) => c.stage === ns)!.goal);
    setStep(4);
  };

  const toggleTag = (v: string) =>
    setTags((prev) => (prev.includes(v) ? prev.filter((t) => t !== v) : [...prev, v]));

  const finish = () => {
    if (!outcome || !action || !dueAt || !nextAt) return;
    onComplete({
      channel: ch, outcome, notes, action, dueAt: new Date(dueAt).toISOString(), actionNote, tags,
      waStatus: waStatus ?? undefined,
      waLabel: waLabel || undefined,
      stage,
      discovery,
      captured,
      nextCall: { stage: nextSt, dueAt: new Date(nextAt).toISOString(), purpose: nextPurpose || CALL_STAGES.find((c) => c.stage === nextSt)!.goal },
    });
    onOpenChange(false);
  };

  const history = (lead.touches ?? []).slice().reverse();
  const stageMeta = CALL_STAGES.find((c) => c.stage === stage)!;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(mode === 'claim'); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="text-base">
            {lead.name} · ₹{(lead.budget / 1000).toFixed(0)}k · {lead.area}
          </DialogTitle>
          <DialogDescription className="text-xs">
            <span className="font-medium text-foreground">{stageMeta.title}</span> — {stageMeta.goal}
          </DialogDescription>
        </DialogHeader>

        <Steps step={step} />

        {/* Know-what-we-don't-know strip, visible on every step */}
        <div className="rounded-lg border bg-surface-2/50 p-2 space-y-1">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
            <span className="flex items-center gap-1"><ListChecks className="h-3 w-3" /> Info collected</span>
            <span className="tabular-nums">{progress.done}/{progress.total}</span>
          </div>
          <div className="h-1 rounded-full bg-surface-3 overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress.pct}%` }} />
          </div>
          {stillMissing.length > 0 && (
            <div className="text-[10px] text-muted-foreground">
              Still needed: {stillMissing.slice(0, 6).map((f) => f.label).join(', ')}
              {stillMissing.length > 6 && ` +${stillMissing.length - 6} more`}
            </div>
          )}
        </div>

        {history.length > 0 && (
          <div className="rounded-lg border bg-surface-2/50 p-2 space-y-1 max-h-28 overflow-auto">
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              <History className="h-3 w-3" /> Previous touches
            </div>
            {history.map((t) => (
              <div key={t.id} className="text-[11px] text-muted-foreground">
                <span className="text-foreground">{t.byName}</span> · {t.stage ? `Call ${t.stage} · ` : ''}
                {t.channel === 'call' ? 'Call' : 'Chat'} · {callOutcomes.find((c) => c.value === t.outcome)?.label}
                {t.notes && ` — ${t.notes}`}
              </div>
            ))}
          </div>
        )}

        {/* STEP 0 — WhatsApp state + label */}
        {step === 0 && (
          <div className="space-y-3">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Check WhatsApp first — is there a chat?</Label>
            <div className="grid grid-cols-1 gap-1.5">
              {WA_STATUSES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setWaStatus(s.value)}
                  className={cn(
                    'text-left rounded-lg border px-2.5 py-2 transition-colors',
                    waStatus === s.value ? 'border-primary bg-primary/10' : 'border-border hover:bg-surface-2',
                  )}
                >
                  <div className="text-xs font-medium">{s.label}</div>
                  <div className="text-[10px] text-muted-foreground">{s.hint}</div>
                </button>
              ))}
            </div>

            <div className="rounded-lg border p-2.5 space-y-2">
              <Label className="text-xs">Label this chat on WhatsApp (mandatory while claiming)</Label>
              <div className="flex flex-wrap gap-1.5">
                {WA_LABELS.map((l) => (
                  <button
                    key={l.value}
                    type="button"
                    onClick={() => setWaLabel(l.value)}
                    className={cn(
                      'text-[10px] px-2 py-0.5 rounded-full border transition-colors',
                      waLabel === l.value ? 'bg-primary/15 border-primary/50 text-primary' : 'border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm" variant="outline" className="h-7 text-[11px]"
                  onClick={() => { navigator.clipboard?.writeText(waLabel); toast.success(`Label "${waLabel}" copied — apply it on the chat`); }}
                >
                  <Copy className="h-3 w-3 mr-1" /> Copy label
                </Button>
                <Button asChild size="sm" variant="outline" className="h-7 text-[11px]">
                  <a href={waLink(lead.phone)} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="h-3 w-3 mr-1" /> Open chat
                  </a>
                </Button>
              </div>
            </div>

            {waStatus && waStatus !== 'no-chat' && waStatus !== 'not-on-wa' && (
              <div>
                <Label className="text-xs">What does the chat already tell us?</Label>
                <Textarea
                  rows={2}
                  className="text-xs"
                  placeholder="Paste / summarise: area asked, budget mentioned, move-in, whether they're in Bangalore…"
                  value={discovery.objection ? '' : notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            )}

            {waStatus && (
              <div className={cn('rounded-lg border p-2.5 text-[11px]', waStatusMeta(waStatus)?.tone === 'bad' ? 'border-danger/40 bg-danger/5' : 'bg-muted/40')}>
                {waStatusMeta(waStatus)?.hint}
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => close(mode === 'claim')}>
                {mode === 'claim' ? 'Release lead' : 'Cancel'}
              </Button>
              <Button size="sm" disabled={!waStatus || !waLabel} onClick={() => setStep(1)}>
                Labelled — go to contact <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 1 — contact now */}
        {step === 1 && (
          <div className="space-y-3">
            <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground flex gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-role-hr" />
              {stage === 1
                ? 'Nothing is confirmed until the call. Dial now and collect every basic on this call.'
                : `Call ${stage}: ${stageMeta.goal}`}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button asChild className="h-11">
                <a href={`tel:${lead.phone.replace(/\s/g, '')}`} onClick={() => { setCh('call'); setStep(2); }}>
                  <Phone className="h-4 w-4 mr-1" /> Call {lead.phone}
                </a>
              </Button>
              <Button asChild variant="outline" className="h-11">
                <a
                  href={waLink(lead.phone, waOpener(lead, stage))}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => { setCh('whatsapp'); setStep(2); }}
                >
                  <MessageCircle className="h-4 w-4 mr-1" /> WhatsApp
                </a>
              </Button>
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => setStep(0)}>Back</Button>
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => setStep(2)}>
                Already reached out <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2 — collect the info this call owes */}
        {step === 2 && (
          <div className="space-y-3">
            <div className="text-[11px] text-muted-foreground">
              {stageMeta.title} — fill what you just heard. {stageMissing.length} required field{stageMissing.length === 1 ? '' : 's'} left on this call.
            </div>
            <div className="space-y-2.5">
              {stageFields(stage).map((f) => (
                <div key={f.key}>
                  <Label className="text-xs flex items-center gap-1">
                    {f.label}
                    {f.required && !filled(discovery, f.key) && <span className="text-danger">*</span>}
                  </Label>
                  {f.kind === 'choice' ? (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {f.options!.map((o) => (
                        <button
                          key={o}
                          type="button"
                          onClick={() => setField(f.key, discovery[f.key] === o ? '' : o)}
                          className={cn(
                            'text-[10px] px-2 py-0.5 rounded-full border transition-colors',
                            discovery[f.key] === o ? 'bg-primary/15 border-primary/50 text-primary' : 'border-border text-muted-foreground hover:text-foreground',
                          )}
                        >
                          {o}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <Input
                      type={f.kind === 'date' ? 'date' : 'text'}
                      value={discovery[f.key] ?? ''}
                      onChange={(e) => setField(f.key, e.target.value)}
                      className="text-xs h-8"
                      placeholder={f.why}
                    />
                  )}
                  <div className="text-[10px] text-muted-foreground mt-0.5">{f.why}</div>
                </div>
              ))}
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => setStep(1)}>Back</Button>
              <Button size="sm" onClick={() => setStep(3)}>
                {stageMissing.length ? `Log outcome (${stageMissing.length} still unknown)` : 'Log outcome'}
                <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3 — outcome */}
        {step === 3 && (
          <div className="space-y-3">
            <div className="flex gap-1.5">
              {(['call', 'whatsapp'] as TouchChannel[]).map((c) => (
                <Button key={c} size="sm" variant={ch === c ? 'default' : 'outline'} className="h-7 text-[11px]" onClick={() => setCh(c)}>
                  {c === 'call' ? <Phone className="h-3 w-3 mr-1" /> : <MessageCircle className="h-3 w-3 mr-1" />}
                  {c === 'call' ? 'Call' : 'Chat'}
                </Button>
              ))}
            </div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">What happened?</Label>
            <div className="grid grid-cols-2 gap-2">
              {callOutcomes.map((o) => (
                <Button
                  key={o.value}
                  variant="outline"
                  className={cn(
                    'h-auto py-2 text-xs justify-start',
                    o.tone === 'good' && 'border-role-tcm/40',
                    o.tone === 'bad' && 'border-danger/40'
                  )}
                  onClick={() => pickOutcome(o.value)}
                >
                  {o.label}
                </Button>
              ))}
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1"><StickyNote className="h-3 w-3" /> Notes for the next person</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Budget flexibility, move-in, objections, who decides…"
                className="text-xs"
                rows={2}
              />
            </div>
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => setStep(2)}>Back</Button>
          </div>
        )}

        {/* STEP 4 — tags, next action, next planned call */}
        {step === 4 && (
          <div className="space-y-3">
            <div>
              <Label className="text-xs flex items-center gap-1 mb-1"><Tag className="h-3 w-3" /> Tags (shared with everyone)</Label>
              <div className="flex flex-wrap gap-1.5">
                {marketplaceTags.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => toggleTag(t.value)}
                    className={cn(
                      'text-[10px] px-2 py-0.5 rounded-full border transition-colors',
                      tags.includes(t.value)
                        ? t.tone === 'good' ? 'bg-role-tcm/15 border-role-tcm/50 text-role-tcm'
                          : t.tone === 'bad' ? 'bg-danger/10 border-danger/40 text-danger'
                          : 'bg-role-hr/15 border-role-hr/40 text-role-hr'
                        : 'border-border text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {tagLabel(t.value)}
                  </button>
                ))}
              </div>
            </div>

            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Next action (mandatory)</Label>
            <div className="grid grid-cols-2 gap-2">
              {nextActions.map((a) => (
                <Button
                  key={a.value}
                  size="sm"
                  variant={action === a.value ? 'default' : 'outline'}
                  className="h-8 text-xs justify-start"
                  onClick={() => {
                    setAction(a.value);
                    setDueAt(toLocalInput(isoIn(a.defaultInHours)));
                  }}
                >
                  {a.label}
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Due at</Label>
                <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="text-xs" />
              </div>
              <div>
                <Label className="text-xs">Note</Label>
                <Input value={actionNote} onChange={(e) => setActionNote(e.target.value)} placeholder="e.g. share 3 options" className="text-xs" />
              </div>
            </div>

            {/* The planned next call — never leave a lead without one */}
            <div className="rounded-lg border border-primary/40 bg-primary/5 p-2.5 space-y-2">
              <Label className="text-xs flex items-center gap-1 text-primary">
                <CalendarClock className="h-3 w-3" /> Plan the next call (mandatory)
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {CALL_STAGES.map((c) => (
                  <button
                    key={c.stage}
                    type="button"
                    onClick={() => { setNextSt(c.stage); setNextPurpose(c.goal); }}
                    className={cn(
                      'text-[10px] px-2 py-0.5 rounded-full border transition-colors',
                      nextSt === c.stage ? 'bg-primary/20 border-primary/60 text-primary' : 'border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {c.title}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input type="datetime-local" value={nextAt} onChange={(e) => setNextAt(e.target.value)} className="text-xs" />
                <Input value={nextPurpose} onChange={(e) => setNextPurpose(e.target.value)} placeholder="Purpose of that call" className="text-xs" />
              </div>
              {stillMissing.length > 0 && (
                <div className="text-[10px] text-muted-foreground">
                  Carry forward: {stillMissing.slice(0, 5).map((f) => f.label).join(', ')}
                </div>
              )}
            </div>

            <div className="rounded-lg border bg-muted/40 p-2.5 text-[11px] text-muted-foreground">
              {outcome && isConnected(outcome)
                ? 'Counts as a connected call toward today\'s 80.'
                : 'Not a connect — it still logs, but it does not count toward today\'s 80.'}{' '}
              You own this lead for {OWNERSHIP_DAYS} days. {captured.length} new field{captured.length === 1 ? '' : 's'} captured this call.
            </div>
            <Button className="w-full" disabled={!action || !dueAt || !nextAt} onClick={finish}>
              <CheckCircle2 className="h-4 w-4 mr-1" />
              {mode === 'claim' ? 'Lock ownership, info & next call' : 'Save call & next call'}
            </Button>
            <Button variant="ghost" size="sm" className="text-xs w-full" onClick={() => setStep(3)}>Back</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Steps({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {STEP_LABELS.map((l, i) => (
        <div key={l} className="flex-1">
          <div className={cn('h-1 rounded-full', i <= step ? 'bg-primary' : 'bg-surface-3')} />
          <div className={cn('text-[9px] mt-1', i <= step ? 'text-foreground' : 'text-muted-foreground')}>{l}</div>
        </div>
      ))}
    </div>
  );
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16);
}
