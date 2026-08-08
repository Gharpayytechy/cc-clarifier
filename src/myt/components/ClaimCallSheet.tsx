import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Phone, MessageCircle, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Lead, CallOutcome, NextActionType } from '@/myt/lib/types';
import { callOutcomes, nextActions, suggestedAction, isoIn, waLink } from '@/myt/lib/ownership';

interface Props {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onComplete: (payload: {
    outcome: CallOutcome;
    notes: string;
    action: NextActionType;
    dueAt: string;
    actionNote: string;
  }) => void;
  onAbandon: () => void;
}

/**
 * Enforced on-spot flow: Claim → Call now → Log outcome → Set next action.
 * The dialog cannot be dismissed without either finishing or releasing the lead.
 */
export function ClaimCallSheet({ lead, open, onOpenChange, onComplete, onAbandon }: Props) {
  const [step, setStep] = useState(0);
  const [outcome, setOutcome] = useState<CallOutcome | null>(null);
  const [notes, setNotes] = useState('');
  const [action, setAction] = useState<NextActionType | null>(null);
  const [dueAt, setDueAt] = useState('');
  const [actionNote, setActionNote] = useState('');

  if (!lead) return null;

  const reset = () => {
    setStep(0); setOutcome(null); setNotes(''); setAction(null); setDueAt(''); setActionNote('');
  };

  const close = (release: boolean) => {
    if (release) onAbandon();
    reset();
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

  const finish = () => {
    if (!outcome || !action || !dueAt) return;
    onComplete({ outcome, notes, action, dueAt: new Date(dueAt).toISOString(), actionNote });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(true); }}>
      <DialogContent className="max-w-lg" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="text-base">
            {lead.name} · ₹{(lead.budget / 1000).toFixed(0)}k · {lead.area}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Claiming means calling now. Finish all 3 steps or the lead goes back to the marketplace.
          </DialogDescription>
        </DialogHeader>

        <Steps step={step} />

        {step === 0 && (
          <div className="space-y-3">
            <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground flex gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-role-hr" />
              No "I'll do it later". Call the lead on the spot — first call inside 5 minutes is the rule.
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button asChild className="h-11">
                <a href={`tel:${lead.phone.replace(/\s/g, '')}`} onClick={() => setStep(1)}>
                  <Phone className="h-4 w-4 mr-1" /> Call {lead.phone}
                </a>
              </Button>
              <Button asChild variant="outline" className="h-11">
                <a
                  href={waLink(lead.phone, `Hi ${lead.name}, Gharpayy here about your ${lead.area} stay.`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setStep(1)}
                >
                  <MessageCircle className="h-4 w-4 mr-1" /> WhatsApp
                </a>
              </Button>
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => close(true)}>
                Release lead
              </Button>
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => setStep(1)}>
                Already called <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">What happened on the call?</Label>
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
              <Label className="text-xs">Call notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Budget flexibility, move-in, objections…"
                className="text-xs"
                rows={2}
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
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
              You own this lead for the next 15 days — every action gets tracked against day 1–15.
            </div>
            <Button className="w-full" disabled={!action || !dueAt} onClick={finish}>
              <CheckCircle2 className="h-4 w-4 mr-1" /> Lock ownership & next action
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Steps({ step }: { step: number }) {
  const labels = ['Call now', 'Log outcome', 'Next action'];
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
