import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Phone, MessageCircle, CheckCircle2, AlertTriangle, ArrowRight, Tag, StickyNote, History } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Lead, CallOutcome, NextActionType, TouchChannel } from '@/myt/lib/types';
import {
  callOutcomes, nextActions, suggestedAction, isoIn, waLink,
  marketplaceTags, tagLabel, isConnected, OWNERSHIP_DAYS,
} from '@/myt/lib/ownership';

export interface TouchPayload {
  channel: TouchChannel;
  outcome: CallOutcome;
  notes: string;
  action: NextActionType;
  dueAt: string;
  actionNote: string;
  tags: string[];
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

/**
 * Enforced on-spot flow: Claim → contact (call or chat) → log outcome + tags + note → set next action.
 * Repeatable: the same sheet logs every later touch, so the lead history keeps compounding.
 */
export function ClaimCallSheet({ lead, open, mode = 'claim', channel = 'call', onOpenChange, onComplete, onAbandon }: Props) {
  const [step, setStep] = useState(0);
  const [ch, setCh] = useState<TouchChannel>(channel);
  const [outcome, setOutcome] = useState<CallOutcome | null>(null);
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [action, setAction] = useState<NextActionType | null>(null);
  const [dueAt, setDueAt] = useState('');
  const [actionNote, setActionNote] = useState('');

  useEffect(() => {
    if (open) {
      setStep(0); setCh(channel); setOutcome(null); setNotes('');
      setTags(lead?.tags ?? []); setAction(null); setDueAt(''); setActionNote('');
    }
  }, [open, channel, lead?.id]);

  if (!lead) return null;

  const close = (release: boolean) => {
    if (release) onAbandon();
    onOpenChange(false);
  };

  const pickOutcome = (o: CallOutcome) => {
    setOutcome(o);
    const suggested = suggestedAction[o];
    setAction(suggested);
    const def = nextActions.find((a) => a.value === suggested)!;
    setDueAt(toLocalInput(isoIn(def.defaultInHours)));
    setStep(2);
  };

  const toggleTag = (v: string) =>
    setTags((prev) => (prev.includes(v) ? prev.filter((t) => t !== v) : [...prev, v]));

  const finish = () => {
    if (!outcome || !action || !dueAt) return;
    onComplete({ channel: ch, outcome, notes, action, dueAt: new Date(dueAt).toISOString(), actionNote, tags });
    onOpenChange(false);
  };

  const history = (lead.touches ?? []).slice().reverse();

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(mode === 'claim'); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="text-base">
            {lead.name} · ₹{(lead.budget / 1000).toFixed(0)}k · {lead.area}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {mode === 'claim'
              ? 'Claiming means contacting now. Finish all 3 steps or the lead goes back to the marketplace.'
              : `Touch ${history.length + 1} — log what happened and set the next action.`}
          </DialogDescription>
        </DialogHeader>

        <Steps step={step} />

        {history.length > 0 && (
          <div className="rounded-lg border bg-surface-2/50 p-2 space-y-1 max-h-28 overflow-auto">
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              <History className="h-3 w-3" /> Previous touches
            </div>
            {history.map((t) => (
              <div key={t.id} className="text-[11px] text-muted-foreground">
                <span className="text-foreground">{t.byName}</span> · {t.channel === 'call' ? 'Call' : 'Chat'} ·{' '}
                {callOutcomes.find((c) => c.value === t.outcome)?.label}
                {t.notes && ` — ${t.notes}`}
              </div>
            ))}
          </div>
        )}

        {step === 0 && (
          <div className="space-y-3">
            <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground flex gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-role-hr" />
              No "I'll do it later". Reach out on the spot — first contact inside 5 minutes is the rule.
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button asChild className="h-11">
                <a href={`tel:${lead.phone.replace(/\s/g, '')}`} onClick={() => { setCh('call'); setStep(1); }}>
                  <Phone className="h-4 w-4 mr-1" /> Call {lead.phone}
                </a>
              </Button>
              <Button asChild variant="outline" className="h-11">
                <a
                  href={waLink(lead.phone, `Hi ${lead.name}, Gharpayy here about your ${lead.area} stay.`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => { setCh('whatsapp'); setStep(1); }}
                >
                  <MessageCircle className="h-4 w-4 mr-1" /> WhatsApp
                </a>
              </Button>
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => close(mode === 'claim')}>
                {mode === 'claim' ? 'Release lead' : 'Cancel'}
              </Button>
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => setStep(1)}>
                Already reached out <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {step === 1 && (
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
          </div>
        )}

        {step === 2 && (
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
            <div className="rounded-lg border bg-muted/40 p-2.5 text-[11px] text-muted-foreground">
              {outcome && isConnected(outcome)
                ? 'Counts as a connected call toward today\'s 80.'
                : 'Not a connect — it still logs, but it does not count toward today\'s 80.'}{' '}
              You own this lead for {OWNERSHIP_DAYS} days.
            </div>
            <Button className="w-full" disabled={!action || !dueAt} onClick={finish}>
              <CheckCircle2 className="h-4 w-4 mr-1" />
              {mode === 'claim' ? 'Lock ownership & next action' : 'Save touch & next action'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Steps({ step }: { step: number }) {
  const labels = ['Contact now', 'Log outcome', 'Tags & next action'];
  return (
    <div className="flex items-center gap-1.5">
      {labels.map((l, i) => (
        <div key={l} className="flex-1">
          <div className={cn('h-1 rounded-full', i <= step ? 'bg-primary' : 'bg-surface-3')} />
          <div className={cn('text-[10px] mt-1', i <= step ? 'text-foreground' : 'text-muted-foreground')}>{l}</div>
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
