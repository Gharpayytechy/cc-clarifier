import { useMemo, useState } from 'react';
import { useAppState } from '@/myt/lib/app-context';
import { Lead } from '@/myt/lib/types';
import { budgetPowerScore, conversionProbability, leadIntent, urgencyExpiry, zoneMedianBudget } from '@/myt/lib/scoring';
import { UrgencyTimer } from '@/myt/components/UrgencyTimer';
import { zones, teamMembers } from '@/myt/lib/mock-data';
import { Phone, Wallet, MapPin, Calendar, Zap, TrendingUp, Hand, Sparkles, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { intentBg } from '@/myt/lib/confidence';
import { toast } from 'sonner';
import { useNavigate } from '@/shims/react-router-dom';
import { LeadControlPanel } from '@/myt/components/LeadControlPanel';
import { ClaimCallSheet } from '@/myt/components/ClaimCallSheet';
import { BulkAddLeads } from '@/myt/components/BulkAddLeads';
import { actionDueLabel, callOutcomes, isIncomplete, nextActions, OWNERSHIP_DAYS, ownershipDay } from '@/myt/lib/ownership';

interface Enriched {
  lead: Lead;
  intent: 'hard' | 'medium' | 'soft';
  budgetPower: number;
  conversionProb: number;
  expiresAt: string;
}

export default function LeadMarketplace() {
  const { leads, setLeads, currentMemberId, setCurrentMemberId, globalZoneFilter } = useAppState();
  const navigate = useNavigate();
  const [claiming, setClaiming] = useState<Lead | null>(null);

  const owners = useMemo(() => teamMembers.filter(m => m.role === 'tcm' || m.role === 'flow-ops'), []);
  const actorId = currentMemberId ?? owners[0]?.id ?? 'm1';
  const actorName = teamMembers.find(m => m.id === actorId)?.name ?? 'Team';

  const enriched: Enriched[] = useMemo(() => {
    return leads
      .filter(l => l.status !== 'dead' && l.status !== 'tour-scheduled')
      .filter(l => !globalZoneFilter || zones.find(z => z.id === globalZoneFilter)?.area === l.area)
      .map(l => {
        const median = zoneMedianBudget(leads, l.area);
        const intent = leadIntent(l);
        const bp = l.budgetPowerScore ?? budgetPowerScore(l.budget, median);
        const cp = l.conversionProbability ?? conversionProbability(bp, intent, undefined);
        const exp = l.urgencyExpiresAt ?? urgencyExpiry(intent, l.createdAt);
        return { lead: l, intent, budgetPower: bp, conversionProb: cp, expiresAt: exp };
      })
      .sort((a, b) => b.conversionProb - a.conversionProb);
  }, [leads, globalZoneFilter]);

  const myIncomplete = leads.filter(l => isIncomplete(l) && l.claimedBy === actorId);

  const claimLead = (lead: Lead) => {
    const now = new Date().toISOString();
    setLeads(prev => prev.map(l => l.id === lead.id
      ? { ...l, claimedBy: actorId, claimedAt: now, status: 'qualified' as const,
          ownershipExpiresAt: new Date(Date.now() + OWNERSHIP_DAYS * 86_400_000).toISOString() }
      : l));
    setClaiming(lead);
  };


  const releaseLead = (leadId: string) => {
    setLeads(prev => prev.map(l => l.id === leadId
      ? { ...l, claimedBy: null, claimedAt: undefined, ownershipExpiresAt: undefined, status: 'new' as const }
      : l));
    toast.warning('Lead released back to the marketplace', {
      description: 'Claiming requires calling and setting the next action on the spot.',
    });
  };

  const completeClaim = (leadId: string, p: {
    outcome: import('@/myt/lib/types').CallOutcome; notes: string;
    action: import('@/myt/lib/types').NextActionType; dueAt: string; actionNote: string;
  }) => {
    const now = new Date().toISOString();
    setLeads(prev => prev.map(l => l.id === leadId
      ? { ...l, firstCallAt: l.firstCallAt ?? now, lastTouchAt: now,
          callOutcome: p.outcome, callNotes: p.notes,
          nextAction: { type: p.action, dueAt: p.dueAt, note: p.actionNote } }
      : l));
    toast.success('Locked — call logged and next action set', {
      description: `${actorName} owns this lead for ${OWNERSHIP_DAYS} days`,
    });

  };

  const scheduleFromLead = (l: Lead) => {
    navigate('/myt/schedule');
    toast.info(`Pre-fill: ${l.name} · ₹${l.budget} · ${l.area}`);
  };

  const summary = {
    hard: enriched.filter(e => e.intent === 'hard').length,
    medium: enriched.filter(e => e.intent === 'medium').length,
    soft: enriched.filter(e => e.intent === 'soft').length,
    avgProb: enriched.length ? Math.round(enriched.reduce((s, e) => s + e.conversionProb, 0) / enriched.length) : 0,
  };


  return (
    <div className="space-y-4 animate-slide-up">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-heading font-bold text-foreground flex items-center gap-2">
            <Zap className="h-5 w-5 text-role-hr" />
            Lead Marketplace
          </h1>
          <p className="text-xs text-muted-foreground">
            Claim → call on the spot → log outcome → set next action. Then own it for 15 days.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Working as</span>
            <Select value={actorId} onValueChange={setCurrentMemberId}>
              <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {owners.map(m => (
                  <SelectItem key={m.id} value={m.id} className="text-xs">{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <BulkAddLeads
            onAdd={(newLeads) => {
              setLeads(prev => [...newLeads, ...prev]);
              toast.success(`${newLeads.length} leads added to the marketplace`);
            }}
            addedBy={actorId}
            addedByName={actorName}
          />
        </div>

      </div>

      {myIncomplete.length > 0 && (
        <div className="rounded-xl border border-danger/40 bg-danger/5 p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-danger">
            <AlertTriangle className="h-4 w-4" />
            {myIncomplete.length} claimed lead{myIncomplete.length === 1 ? '' : 's'} without a logged call or next action
          </div>
          <div className="flex flex-wrap gap-1.5">
            {myIncomplete.map(l => (
              <Button key={l.id} size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setClaiming(l)}>
                Finish {l.name}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Stat label="Hard" value={summary.hard} accent="green" />
        <Stat label="Medium" value={summary.medium} accent="amber" />
        <Stat label="Soft" value={summary.soft} />
        <Stat label="Avg Conv %" value={`${summary.avgProb}%`} accent="primary" />
      </div>

      <div className="space-y-2">
        {enriched.length === 0 && (
          <div className="glass-card p-8 text-center text-sm text-muted-foreground">No live leads right now. New ones surface as Flow Ops adds them.</div>
        )}
        {enriched.map(e => (

          <div
            key={e.lead.id}
            className={cn(
              'rounded-xl border p-3 space-y-2 transition-all',
              e.intent === 'hard' && 'border-role-tcm/30 bg-role-tcm/5',
              e.intent === 'medium' && 'border-role-hr/20 bg-role-hr/5',
              e.intent === 'soft' && 'border-border bg-surface-2/40',
              e.lead.claimedBy && !isIncomplete(e.lead) && 'opacity-70'
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-foreground text-sm">{e.lead.name}</span>
                  <span className={cn('text-[9px] px-1.5 py-0.5 rounded border font-medium uppercase', intentBg[e.intent])}>
                    {e.intent}
                  </span>
                  {e.lead.claimedBy && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      {teamMembers.find(m => m.id === e.lead.claimedBy)?.name ?? 'Claimed'} · Day {ownershipDay(e.lead)}/{OWNERSHIP_DAYS}
                    </span>
                  )}
                  {isIncomplete(e.lead) && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-danger/10 text-danger border border-danger/30">
                      Call + next action pending
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5 flex-wrap">
                  <a href={`tel:${e.lead.phone}`} className="flex items-center gap-1 hover:text-primary"><Phone className="h-3 w-3" />{e.lead.phone}</a>
                  <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{e.lead.area}</span>
                  <span className="flex items-center gap-1"><Wallet className="h-3 w-3" />₹{(e.lead.budget/1000).toFixed(0)}k</span>
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />Move {e.lead.moveInDate.slice(5)}</span>
                </div>
              </div>
              <UrgencyTimer expiresAt={e.expiresAt} />
            </div>

            {/* Score strip */}
            <div className="grid grid-cols-2 gap-2">
              <ScoreInline label="Budget power" value={e.budgetPower} icon={<Wallet className="h-3 w-3" />} />
              <ScoreInline label="Conversion prob" value={e.conversionProb} icon={<TrendingUp className="h-3 w-3" />} />
            </div>

            {e.lead.nextAction && (
              <div className="flex items-center gap-2 text-[11px] rounded-lg border bg-surface-2/60 px-2 py-1.5 flex-wrap">
                <CheckCircle2 className="h-3 w-3 text-role-tcm" />
                <span className="text-foreground font-medium">
                  {nextActions.find(a => a.value === e.lead.nextAction!.type)?.label}
                </span>
                {e.lead.nextAction.note && <span className="text-muted-foreground">· {e.lead.nextAction.note}</span>}
                <span className={cn(
                  'flex items-center gap-1 ml-auto',
                  actionDueLabel(e.lead.nextAction.dueAt).overdue ? 'text-danger' : 'text-muted-foreground'
                )}>
                  <Clock className="h-3 w-3" />{actionDueLabel(e.lead.nextAction.dueAt).text}
                </span>
                {e.lead.callOutcome && (
                  <span className="text-muted-foreground w-full">
                    Last call: {callOutcomes.find(c => c.value === e.lead.callOutcome)?.label}
                  </span>
                )}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <LeadControlPanel
                subject={{ kind: 'lead', lead: e.lead }}
                trigger={
                  <Button size="sm" variant="outline" className="h-8 text-xs gap-1">
                    <Sparkles className="h-3 w-3" /> Open
                  </Button>
                }
              />
              {!e.lead.claimedBy && (
                <Button size="sm" onClick={() => claimLead(e.lead)} className="h-8 text-xs flex-1">
                  <Hand className="h-3 w-3 mr-1" /> Claim & call now
                </Button>
              )}
              {isIncomplete(e.lead) && e.lead.claimedBy === currentMemberId && (
                <Button size="sm" variant="destructive" onClick={() => setClaiming(e.lead)} className="h-8 text-xs flex-1">
                  Finish call log
                </Button>
              )}
              {e.lead.claimedBy === currentMemberId && !isIncomplete(e.lead) && (
                <Button size="sm" variant="outline" onClick={() => setClaiming(e.lead)} className="h-8 text-xs">
                  Log touch
                </Button>
              )}
              {(currentRole === 'flow-ops' || (currentRole === 'tcm' && e.lead.claimedBy === currentMemberId)) && (
                <Button size="sm" variant="outline" onClick={() => scheduleFromLead(e.lead)} className="h-8 text-xs flex-1">
                  Schedule tour →
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      <ClaimCallSheet
        lead={claiming}
        open={Boolean(claiming)}
        onOpenChange={(v) => { if (!v) setClaiming(null); }}
        onComplete={(p) => { if (claiming) completeClaim(claiming.id, p); setClaiming(null); }}
        onAbandon={() => {
          if (claiming && isIncomplete(claiming)) releaseLead(claiming.id);
          setClaiming(null);
        }}
      />
    </div>
  );
}


function Stat({ label, value, accent }: { label: string; value: string | number; accent?: 'green' | 'amber' | 'primary' }) {
  return (
    <div className="glass-card p-2.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn(
        'text-xl font-bold tabular-nums mt-0.5',
        accent === 'green' && 'text-role-tcm',
        accent === 'amber' && 'text-role-hr',
        accent === 'primary' && 'text-primary',
        !accent && 'text-foreground'
      )}>{value}</div>
    </div>
  );
}

function ScoreInline({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  const color = value >= 70 ? 'bg-role-tcm' : value >= 45 ? 'bg-role-hr' : 'bg-danger';
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">{icon}{label}</span>
        <span className="font-mono tabular-nums text-foreground">{value}</span>
      </div>
      <div className="h-1 rounded-full bg-surface-3 mt-0.5 overflow-hidden">
        <div className={cn('h-full', color)} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
