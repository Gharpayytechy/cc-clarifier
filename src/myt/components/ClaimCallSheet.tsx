import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Phone, MessageCircle, CheckCircle2, AlertTriangle, ArrowRight, Tag, StickyNote, History,
  Copy, CalendarClock, Gauge, Zap, Lock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Lead, CallOutcome, NextActionType, TouchChannel, WaStatus, CallStage, LeadDiscovery, DiscoveryKey, PlannedCall } from '@/myt/lib/types';
import {
  callOutcomes, nextActions, suggestedAction, isoIn, waLink,
  marketplaceTags, tagLabel, isConnected, OWNERSHIP_DAYS,
} from '@/myt/lib/ownership';
import {
  WA_STATUSES, WA_LABELS, suggestedWaLabel, waStatusMeta, CALL_STAGES, stageFields,
  currentStage, filled, missingForStage, missingAll, discoveryProgress, preCallBacklog,
  nextCallDefaultHours, nextStage, waOpener, callScript, closingReadiness, readinessTone,
  readinessVerdict, DEAL_PRESETS, DiscoveryField,
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
  mode?: 'claim' | 'touch';
  channel?: TouchChannel;
  onOpenChange: (v: boolean) => void;
  onComplete: (payload: TouchPayload) => void;
  onAbandon: () => void;
}

const STEP_LABELS = ['WhatsApp', 'Pre-call brief', 'Call', 'Log outcome', 'Next call'];

/**
 * WhatsApp check → pre-call brief (everything owed from Call 1..n, filled BEFORE dialling)
 * → the call itself → outcome → the next planned call. The system decides which call
 * number this is; the rep never picks it.
 */
export function ClaimCallSheet({ lead, open, mode = 'claim', channel = 'call', onOpenChange, onComplete, onAbandon }: Props) {
  const [step, setStep] = useState(0);
  const [ch, setCh] = useState<TouchChannel>(channel);
  const [waStatus, setWaStatus] = useState<WaStatus | null>(null);
  const [waLabel, setWaLabel] = useState<string>('');
  const [discovery, setDiscovery] = useState<LeadDiscovery>({});
  const [outcome, setOutcome] = useState<CallOutcome | null>(null);
  const [notes, setNotes] = useState('');
  const [chatNotes, setChatNotes] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [action, setAction] = useState<NextActionType | null>(null);
  const [dueAt, setDueAt] = useState('');
  const [actionNote, setActionNote] = useState('');
  const [nextAt, setNextAt] = useState('');
  const [nextPurpose, setNextPurpose] = useState('');
  const [nextSt, setNextSt] = useState<CallStage>(1);

  const stage: CallStage = lead ? currentStage(lead) : 1;

  useEffect(() => {
    if (open && lead) {
      const st = currentStage(lead);
      setStep(0); setCh(channel); setOutcome(null); setNotes(''); setChatNotes('');
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
  const backlog = preCallBacklog(discovery, stage);
  const preCallFields = stageFields(stage).filter((f) => f.preCall);
  const brief = [...backlog, ...preCallFields];
  const briefMissing = brief.filter((f) => f.required && !filled(discovery, f.key));
  const onCallFields = stageFields(stage).filter((f) => !f.preCall);
  const readiness = closingReadiness({ ...(lead ?? {} as Lead), discovery });
  const tone = readinessTone(readiness.pct);

  if (!lead) return null;

  const close = (release: boolean) => {
    if (release) onAbandon();
    onOpenChange(false);
  };

  const setField = (k: DiscoveryKey, v: string) => setDiscovery((p) => ({ ...p, [k]: v }));
  const applyPreset = (patch: LeadDiscovery) => {
    setDiscovery((p) => ({ ...patch, ...p, ...Object.fromEntries(Object.entries(patch).filter(([k]) => !filled(p, k as DiscoveryKey))) }));
    toast.success('Preset merged — your filled answers were kept');
  };

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
  };

  const toggleTag = (v: string) =>
    setTags((prev) => (prev.includes(v) ? prev.filter((t) => t !== v) : [...prev, v]));

  const finish = () => {
    if (!outcome || !action || !dueAt || !nextAt) return;
    onComplete({
      channel: ch, outcome,
      notes: [chatNotes.trim(), notes.trim()].filter(Boolean).join(' · '),
      action, dueAt: new Date(dueAt).toISOString(), actionNote, tags,
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
  const tryNearby = discovery.dealRead === 'Try nearby';

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(mode === 'claim'); }}>
      <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto p-0 gap-0" onInteractOutside={(e) => e.preventDefault()}>
        {/* ---------- Sticky header: who + can I close this ---------- */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-5 pt-5 pb-3 space-y-3">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-base leading-tight">
              {lead.name} · ₹{(lead.budget / 1000).toFixed(0)}k · {lead.area}
            </DialogTitle>
            <DialogDescription className="text-xs">
              <span className="font-medium text-foreground">{stageMeta.title}</span> — {stageMeta.goal}
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-3 rounded-xl border bg-surface-2/60 p-3">
            <Ring pct={readiness.pct} tone={tone} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-xs font-medium">
                <Gauge className="h-3.5 w-3.5" />
                Closing readiness
                <span className={cn(
                  'ml-auto text-[10px] px-1.5 py-0.5 rounded-full border',
                  tone === 'good' ? 'bg-role-tcm/10 border-role-tcm/40 text-role-tcm'
                    : tone === 'warn' ? 'bg-role-hr/10 border-role-hr/40 text-role-hr'
                    : 'bg-danger/10 border-danger/40 text-danger',
                )}>
                  {readiness.closeable ? 'Closeable' : 'Not closeable'}
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{readinessVerdict(readiness)}</div>
              {readiness.blockers.length > 0 && (
                <div className="text-[10px] text-muted-foreground mt-1 truncate">
                  Blocking: {readiness.blockers.slice(0, 4).join(', ')}
                  {readiness.blockers.length > 4 && ` +${readiness.blockers.length - 4}`}
                </div>
              )}
            </div>
          </div>

          <Steps step={step} />
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* ---------- STEP 0 — WhatsApp ---------- */}
          {step === 0 && (
            <div className="space-y-3">
              <SectionTitle>Check WhatsApp first — is there a chat?</SectionTitle>
              <div className="grid grid-cols-1 gap-1.5">
                {WA_STATUSES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setWaStatus(s.value)}
                    className={cn(
                      'text-left rounded-lg border px-3 py-2 transition-all',
                      waStatus === s.value ? 'border-primary bg-primary/10 shadow-sm' : 'border-border hover:bg-surface-2',
                    )}
                  >
                    <div className="text-xs font-medium">{s.label}</div>
                    <div className="text-[10px] text-muted-foreground">{s.hint}</div>
                  </button>
                ))}
              </div>

              <div className="rounded-xl border p-3 space-y-2">
                <Label className="text-xs">Label this chat on WhatsApp (mandatory while claiming)</Label>
                <div className="flex flex-wrap gap-1.5">
                  {WA_LABELS.map((l) => (
                    <Chip key={l.value} active={waLabel === l.value} onClick={() => setWaLabel(l.value)}>{l.label}</Chip>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="h-7 text-[11px]"
                    onClick={() => { navigator.clipboard?.writeText(waLabel); toast.success(`Label "${waLabel}" copied — apply it on the chat`); }}>
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
                  <Textarea rows={2} className="text-xs mt-1"
                    placeholder="Area asked, budget mentioned, move-in, whether they're in Bangalore…"
                    value={chatNotes} onChange={(e) => setChatNotes(e.target.value)} />
                </div>
              )}

              <Footer
                left={<Button variant="ghost" size="sm" className="text-xs" onClick={() => close(mode === 'claim')}>
                  {mode === 'claim' ? 'Release lead' : 'Cancel'}
                </Button>}
                right={<Button size="sm" disabled={!waStatus || !waLabel} onClick={() => setStep(1)}>
                  Next — pre-call brief <ArrowRight className="h-3 w-3 ml-1" />
                </Button>}
              />
            </div>
          )}

          {/* ---------- STEP 1 — pre-call brief (fill BEFORE dialling) ---------- */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 text-[11px]">
                <div className="font-medium text-primary flex items-center gap-1"><Lock className="h-3.5 w-3.5" /> Fill this before you dial</div>
                <div className="text-muted-foreground mt-0.5">
                  {backlog.length > 0
                    ? `${backlog.length} answer${backlog.length === 1 ? '' : 's'} from earlier calls are still blank — pull them forward now, then make the ${stageMeta.title}.`
                    : 'Set the frame first. The call happens after the brief is complete.'}
                </div>
              </div>

              <div className="space-y-2">
                <SectionTitle icon={<Zap className="h-3 w-3" />}>One-tap presets · merges with what you've filled</SectionTitle>
                <div className="grid grid-cols-2 gap-1.5">
                  {DEAL_PRESETS.map((p) => (
                    <button key={p.label} type="button" onClick={() => applyPreset(p.patch)}
                      className={cn(
                        'text-left rounded-lg border px-2.5 py-1.5 transition-all hover:shadow-sm',
                        p.tone === 'good' ? 'border-role-tcm/40 hover:bg-role-tcm/5'
                          : p.tone === 'bad' ? 'border-danger/40 hover:bg-danger/5'
                          : 'border-role-hr/40 hover:bg-role-hr/5',
                      )}>
                      <div className="text-[11px] font-medium">{p.label}</div>
                      <div className="text-[10px] text-muted-foreground leading-tight">{p.hint}</div>
                    </button>
                  ))}
                </div>
              </div>

              {tryNearby && (
                <div className="rounded-xl border border-danger/40 bg-danger/5 p-2.5 text-[11px] text-danger flex gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Deal read is "Try nearby" — don't burn a call. Release the lead so it reroutes to the right zone.
                </div>
              )}

              <FieldList fields={brief} discovery={discovery} setField={setField} />

              <Footer
                left={<Button variant="ghost" size="sm" className="text-xs" onClick={() => setStep(0)}>Back</Button>}
                right={<Button size="sm" disabled={briefMissing.length > 0} onClick={() => setStep(2)}>
                  {briefMissing.length ? `${briefMissing.length} left before you can call` : 'Brief done — go to the call'}
                  <ArrowRight className="h-3 w-3 ml-1" />
                </Button>}
              />
            </div>
          )}

          {/* ---------- STEP 2 — the call ---------- */}
          {step === 2 && (
            <div className="space-y-3">
              <div className="rounded-xl border bg-surface-2/60 p-3 space-y-1.5">
                <div className="text-xs font-medium">{stageMeta.title} — talk track</div>
                {callScript(stage).map((s, i) => (
                  <div key={s} className="text-[11px] text-muted-foreground flex gap-2">
                    <span className="text-primary font-mono">{i + 1}.</span>{s}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button asChild className="h-12">
                  <a href={`tel:${lead.phone.replace(/\s/g, '')}`} onClick={() => { setCh('call'); setStep(3); }}>
                    <Phone className="h-4 w-4 mr-1" /> Call {lead.phone}
                  </a>
                </Button>
                <Button asChild variant="outline" className="h-12">
                  <a href={waLink(lead.phone, waOpener(lead, stage))} target="_blank" rel="noopener noreferrer"
                    onClick={() => { setCh('whatsapp'); setStep(3); }}>
                    <MessageCircle className="h-4 w-4 mr-1" /> WhatsApp
                  </a>
                </Button>
              </div>
              <Footer
                left={<Button variant="ghost" size="sm" className="text-xs" onClick={() => setStep(1)}>Back</Button>}
                right={<Button variant="ghost" size="sm" className="text-xs" onClick={() => setStep(3)}>
                  Already reached out <ArrowRight className="h-3 w-3 ml-1" />
                </Button>}
              />
            </div>
          )}

          {/* ---------- STEP 3 — log what you heard + outcome ---------- */}
          {step === 3 && (
            <div className="space-y-4">
              {onCallFields.length > 0 && (
                <div className="space-y-2">
                  <SectionTitle>Log what you just heard · {stageMeta.short}</SectionTitle>
                  <FieldList fields={onCallFields} discovery={discovery} setField={setField} />
                </div>
              )}

              <div className="space-y-2">
                <SectionTitle>What happened on this call?</SectionTitle>
                <div className="flex gap-1.5">
                  {(['call', 'whatsapp'] as TouchChannel[]).map((c) => (
                    <Button key={c} size="sm" variant={ch === c ? 'default' : 'outline'} className="h-7 text-[11px]" onClick={() => setCh(c)}>
                      {c === 'call' ? <Phone className="h-3 w-3 mr-1" /> : <MessageCircle className="h-3 w-3 mr-1" />}
                      {c === 'call' ? 'Call' : 'Chat'}
                    </Button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {callOutcomes.map((o) => (
                    <Button key={o.value} variant={outcome === o.value ? 'default' : 'outline'}
                      className={cn('h-auto py-2 text-xs justify-start',
                        outcome !== o.value && o.tone === 'good' && 'border-role-tcm/40',
                        outcome !== o.value && o.tone === 'bad' && 'border-danger/40')}
                      onClick={() => pickOutcome(o.value)}>
                      {o.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-xs flex items-center gap-1"><StickyNote className="h-3 w-3" /> Notes for the next person</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                  placeholder="Budget flexibility, move-in, objections, who decides…" className="text-xs mt-1" rows={2} />
              </div>

              <Footer
                left={<Button variant="ghost" size="sm" className="text-xs" onClick={() => setStep(2)}>Back</Button>}
                right={<Button size="sm" disabled={!outcome} onClick={() => setStep(4)}>
                  Plan the next call <ArrowRight className="h-3 w-3 ml-1" />
                </Button>}
              />
            </div>
          )}

          {/* ---------- STEP 4 — tags, next action, next planned call ---------- */}
          {step === 4 && (
            <div className="space-y-4">
              <div>
                <SectionTitle icon={<Tag className="h-3 w-3" />}>Notes &amp; signals · tap to mark</SectionTitle>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {marketplaceTags.map((t) => (
                    <Chip key={t.value} active={tags.includes(t.value)} onClick={() => toggleTag(t.value)}>
                      {tagLabel(t.value)}
                    </Chip>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <SectionTitle>Next action (mandatory)</SectionTitle>
                <div className="grid grid-cols-2 gap-2">
                  {nextActions.map((a) => (
                    <Button key={a.value} size="sm" variant={action === a.value ? 'default' : 'outline'}
                      className="h-8 text-xs justify-start"
                      onClick={() => { setAction(a.value); setDueAt(toLocalInput(isoIn(a.defaultInHours))); }}>
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
              </div>

              <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 space-y-2">
                <Label className="text-xs flex items-center gap-1 text-primary">
                  <CalendarClock className="h-3 w-3" /> Next call — the system picked {CALL_STAGES.find((c) => c.stage === nextSt)?.title}
                </Label>
                <div className="text-[10px] text-muted-foreground">
                  Based on what is still blank. Override only if you know better.
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {CALL_STAGES.map((c) => (
                    <Chip key={c.stage} active={nextSt === c.stage} onClick={() => { setNextSt(c.stage); setNextPurpose(c.goal); }}>
                      {c.title}
                    </Chip>
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

              <div className="rounded-xl border bg-surface-2/60 p-3 text-[11px] text-muted-foreground">
                {outcome && isConnected(outcome)
                  ? "Counts as a connected call toward today's 80."
                  : "Not a connect — it still logs, but it does not count toward today's 80."}{' '}
                You own this lead for {OWNERSHIP_DAYS} days. {captured.length} new field{captured.length === 1 ? '' : 's'} captured ·
                readiness {readiness.pct}% ({progress.done}/{progress.total} dossier answers).
              </div>

              <Button className="w-full h-11" disabled={!action || !dueAt || !nextAt} onClick={finish}>
                <CheckCircle2 className="h-4 w-4 mr-1" />
                {mode === 'claim' ? 'Lock ownership, dossier & next call' : 'Save call & next call'}
              </Button>
              <Button variant="ghost" size="sm" className="text-xs w-full" onClick={() => setStep(3)}>Back</Button>
            </div>
          )}

          {history.length > 0 && step === 0 && (
            <div className="rounded-xl border bg-surface-2/50 p-2.5 space-y-1 max-h-28 overflow-auto">
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
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------ pieces ------------------------------ */

function FieldList({ fields, discovery, setField }: {
  fields: DiscoveryField[];
  discovery: LeadDiscovery;
  setField: (k: DiscoveryKey, v: string) => void;
}) {
  const groups = Array.from(new Set(fields.map((f) => f.group)));
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <div key={g} className="rounded-xl border p-3 space-y-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{g}</div>
          {fields.filter((f) => f.group === g).map((f) => (
            <div key={f.key} className="space-y-1">
              <Label className="text-xs flex items-center gap-1">
                {f.label}
                {f.required && !filled(discovery, f.key) && <span className="text-danger">*</span>}
                {filled(discovery, f.key) && <CheckCircle2 className="h-3 w-3 text-role-tcm" />}
              </Label>
              {f.kind === 'choice' ? (
                <div className="flex flex-wrap gap-1.5">
                  {f.options!.map((o) => (
                    <Chip key={o} active={discovery[f.key] === o} onClick={() => setField(f.key, discovery[f.key] === o ? '' : o)}>{o}</Chip>
                  ))}
                </div>
              ) : (
                <Input type={f.kind === 'date' ? 'date' : 'text'} value={discovery[f.key] ?? ''}
                  onChange={(e) => setField(f.key, e.target.value)} className="text-xs h-8" placeholder={f.label} />
              )}
              <div className="text-[10px] text-muted-foreground">{f.why}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={cn('text-[10px] px-2 py-1 rounded-full border transition-all',
        active ? 'bg-primary/15 border-primary/60 text-primary font-medium' : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30')}>
      {children}
    </button>
  );
}

function SectionTitle({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium flex items-center gap-1">
      {icon}{children}
    </div>
  );
}

function Footer({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return <div className="flex items-center justify-between pt-1">{left}{right}</div>;
}

function Ring({ pct, tone }: { pct: number; tone: 'good' | 'warn' | 'bad' }) {
  const color = tone === 'good' ? 'var(--role-tcm, currentColor)' : undefined;
  return (
    <div className="relative h-14 w-14 shrink-0">
      <div
        className="h-14 w-14 rounded-full transition-all"
        style={{
          background: `conic-gradient(${color ?? 'hsl(var(--primary))'} ${pct * 3.6}deg, hsl(var(--muted)) 0deg)`,
        }}
      />
      <div className="absolute inset-[5px] rounded-full bg-background flex items-center justify-center">
        <span className={cn('text-xs font-semibold tabular-nums',
          tone === 'good' ? 'text-role-tcm' : tone === 'warn' ? 'text-role-hr' : 'text-danger')}>{pct}%</span>
      </div>
    </div>
  );
}

function Steps({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {STEP_LABELS.map((l, i) => (
        <div key={l} className="flex-1">
          <div className={cn('h-1 rounded-full transition-all', i <= step ? 'bg-primary' : 'bg-surface-3')} />
          <div className={cn('text-[9px] mt-1 truncate', i <= step ? 'text-foreground' : 'text-muted-foreground')}>{l}</div>
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
