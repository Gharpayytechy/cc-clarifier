import { useMemo, useState } from 'react';
import { useAppState } from '@/myt/lib/app-context';
import { Lead, LeadTouch, TouchChannel } from '@/myt/lib/types';
import { budgetPowerScore, conversionProbability, leadIntent, urgencyExpiry, zoneMedianBudget } from '@/myt/lib/scoring';
import { UrgencyTimer } from '@/myt/components/UrgencyTimer';
import { zones, teamMembers } from '@/myt/lib/mock-data';
import {
  Phone, Wallet, MapPin, Calendar, Zap, TrendingUp, Hand, Sparkles, AlertTriangle,
  CheckCircle2, Clock, MessageCircle, Target, StickyNote, Send, RotateCcw, Inbox,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { intentBg } from '@/myt/lib/confidence';
import { toast } from 'sonner';
import { useNavigate } from '@/shims/react-router-dom';
import { LeadControlPanel } from '@/myt/components/LeadControlPanel';
import { ClaimCallSheet, TouchPayload } from '@/myt/components/ClaimCallSheet';
import { BulkAddLeads } from '@/myt/components/BulkAddLeads';
import {
  actionDueLabel, callOutcomes, isIncomplete, nextActions, OWNERSHIP_DAYS, ownershipDay,
  todayScoreboard, tagLabel, tagTone, isConnected, waLink, DAILY_CONNECT_TARGET,
} from '@/myt/lib/ownership';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
  const [sheetMode, setSheetMode] = useState<'claim' | 'touch'>('claim');
  const [sheetChannel, setSheetChannel] = useState<TouchChannel>('call');

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
  const board = todayScoreboard(leads);

  const openSheet = (lead: Lead, mode: 'claim' | 'touch', channel: TouchChannel) => {
    setSheetMode(mode);
    setSheetChannel(channel);
    setClaiming(lead);
  };

  const claimLead = (lead: Lead, channel: TouchChannel) => {
    const now = new Date().toISOString();
    setLeads(prev => prev.map(l => l.id === lead.id
      ? { ...l, claimedBy: actorId, claimedAt: now, status: 'qualified' as const,
          ownershipExpiresAt: new Date(Date.now() + OWNERSHIP_DAYS * 86_400_000).toISOString() }
      : l));
    openSheet(lead, 'claim', channel);
  };

  const releaseLead = (leadId: string, quiet = false) => {
    setLeads(prev => prev.map(l => l.id === leadId
      ? { ...l, claimedBy: null, claimedAt: undefined, ownershipExpiresAt: undefined, status: 'new' as const }
      : l));
    if (!quiet) {
      toast.warning('Lead released back to the marketplace', {
        description: 'Notes and tags stay — the next person starts warmer.',
      });
    }
  };

  const completeTouch = (leadId: string, p: TouchPayload) => {
    const now = new Date().toISOString();
    setLeads(prev => prev.map(l => {
      if (l.id !== leadId) return l;
      const touch: LeadTouch = {
        id: `t-${Date.now()}`,
        at: now,
        by: actorId,
        byName: actorName,
        channel: p.channel,
        outcome: p.outcome,
        notes: p.notes,
        action: p.action,
        dueAt: p.dueAt,
        actionNote: p.actionNote,
        tags: p.tags,
      };
      const notes = p.notes.trim()
        ? [...(l.marketNotes ?? []), { id: `n-${Date.now()}`, at: now, by: actorId, byName: actorName, text: p.notes.trim() }]
        : (l.marketNotes ?? []);
      return {
        ...l,
        firstCallAt: l.firstCallAt ?? now,
        lastTouchAt: now,
        lastChannel: p.channel,
        callOutcome: p.outcome,
        callNotes: p.notes,
        tags: Array.from(new Set([...(l.tags ?? []), ...p.tags])),
        marketNotes: notes,
        touches: [...(l.touches ?? []), touch],
        nextAction: { type: p.action, dueAt: p.dueAt, note: p.actionNote },
      };
    }));
    toast.success(isConnected(p.outcome) ? 'Connected call logged ✓' : 'Touch logged', {
      description: `${actorName} owns this lead for ${OWNERSHIP_DAYS} days · next action set`,
    });
  };

  const addNote = (leadId: string, text: string) => {
    const now = new Date().toISOString();
    setLeads(prev => prev.map(l => l.id === leadId
      ? { ...l, marketNotes: [...(l.marketNotes ?? []), { id: `n-${Date.now()}`, at: now, by: actorId, byName: actorName, text }] }
      : l));
    toast.success('Note added for the whole team');
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
      {/* Daily goal — 80 connected calls */}
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 md:p-4">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
              <Target className="h-4 w-4" /> Today's goal — {DAILY_CONNECT_TARGET} connected calls
            </div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-foreground">
              {board.connected}
              <span className="text-base font-medium text-muted-foreground"> / {board.target} done</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {board.remaining > 0
                ? `${board.remaining} more connected calls to hit the number.`
                : 'Target hit — every extra connect is upside.'}
            </p>
          </div>
          <div className="flex gap-4 text-[11px] text-muted-foreground">
            <Mini label="Calls" value={board.calls} />
            <Mini label="Chats" value={board.chats} />
            <Mini label="Touches" value={board.touches} />
            <Mini label="Tours set" value={board.tours} />
          </div>
        </div>
        <div className="h-2 rounded-full bg-surface-3 mt-3 overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${board.pct}%` }} />
        </div>
      </div>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-heading font-bold text-foreground flex items-center gap-2">
            <Zap className="h-5 w-5 text-role-hr" />
            Lead Marketplace
          </h1>
          <p className="text-xs text-muted-foreground">
            Claim &amp; call or claim &amp; chat → log outcome → tag it → set next action. Own it for {OWNERSHIP_DAYS} days.
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
              <Button key={l.id} size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => openSheet(l, 'claim', 'call')}>
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
          <div className="glass-card p-8 text-center space-y-2">
            <Inbox className="h-6 w-6 mx-auto text-muted-foreground" />
            <div className="text-sm font-medium text-foreground">Marketplace is at zero</div>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              That's the target state. Paste today's leads with Bulk add — then claim &amp; call or claim &amp; chat
              each one until the board is empty again.
            </p>
          </div>
        )}
        {enriched.map(e => (
          <LeadRow
            key={e.lead.id}
            e={e}
            actorId={actorId}
            onClaim={claimLead}
            onTouch={(lead, ch) => openSheet(lead, 'touch', ch)}
            onFinish={(lead) => openSheet(lead, 'claim', 'call')}
            onRelease={releaseLead}
            onSchedule={scheduleFromLead}
            onAddNote={addNote}
          />
        ))}
      </div>

      <ClaimCallSheet
        lead={claiming}
        open={Boolean(claiming)}
        mode={sheetMode}
        channel={sheetChannel}
        onOpenChange={(v) => { if (!v) setClaiming(null); }}
        onComplete={(p) => { if (claiming) completeTouch(claiming.id, p); setClaiming(null); }}
        onAbandon={() => {
          if (sheetMode === 'claim' && claiming && isIncomplete(claiming)) releaseLead(claiming.id);
          setClaiming(null);
        }}
      />
    </div>
  );
}

function LeadRow({ e, actorId, onClaim, onTouch, onFinish, onRelease, onSchedule, onAddNote }: {
  e: Enriched;
  actorId: string;
  onClaim: (l: Lead, ch: TouchChannel) => void;
  onTouch: (l: Lead, ch: TouchChannel) => void;
  onFinish: (l: Lead) => void;
  onRelease: (id: string) => void;
  onSchedule: (l: Lead) => void;
  onAddNote: (id: string, text: string) => void;
}) {
  const [note, setNote] = useState('');
  const l = e.lead;
  const notes = (l.marketNotes ?? []).slice(-3).reverse();
  const mine = l.claimedBy === actorId;
  const incomplete = isIncomplete(l);

  const submitNote = () => {
    if (!note.trim()) return;
    onAddNote(l.id, note.trim());
    setNote('');
  };

  return (
    <div
      className={cn(
        'rounded-xl border p-3 space-y-2 transition-all',
        e.intent === 'hard' && 'border-role-tcm/30 bg-role-tcm/5',
        e.intent === 'medium' && 'border-role-hr/20 bg-role-hr/5',
        e.intent === 'soft' && 'border-border bg-surface-2/40',
        l.claimedBy && !incomplete && 'opacity-90'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-foreground text-sm">{l.name}</span>
            <span className={cn('text-[9px] px-1.5 py-0.5 rounded border font-medium uppercase', intentBg[e.intent])}>
              {e.intent}
            </span>
            {l.claimedBy && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                {teamMembers.find(m => m.id === l.claimedBy)?.name ?? 'Claimed'} · Day {ownershipDay(l)}/{OWNERSHIP_DAYS}
              </span>
            )}
            {(l.touches?.length ?? 0) > 0 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-surface-3 text-muted-foreground">
                {l.touches!.length} touch{l.touches!.length === 1 ? '' : 'es'}
              </span>
            )}
            {incomplete && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-danger/10 text-danger border border-danger/30">
                Call + next action pending
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5 flex-wrap">
            <a href={`tel:${l.phone}`} className="flex items-center gap-1 hover:text-primary"><Phone className="h-3 w-3" />{l.phone}</a>
            <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{l.area}</span>
            <span className="flex items-center gap-1"><Wallet className="h-3 w-3" />₹{(l.budget/1000).toFixed(0)}k</span>
            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />Move {l.moveInDate.slice(5)}</span>
          </div>
        </div>
        <UrgencyTimer expiresAt={e.expiresAt} />
      </div>

      {(l.tags?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1">
          {l.tags!.map(t => (
            <span
              key={t}
              className={cn(
                'text-[10px] px-2 py-0.5 rounded-full border',
                tagTone(t) === 'good' && 'bg-role-tcm/10 border-role-tcm/40 text-role-tcm',
                tagTone(t) === 'warn' && 'bg-role-hr/10 border-role-hr/40 text-role-hr',
                tagTone(t) === 'bad' && 'bg-danger/10 border-danger/40 text-danger'
              )}
            >
              {tagLabel(t)}
            </span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <ScoreInline label="Budget power" value={e.budgetPower} icon={<Wallet className="h-3 w-3" />} />
        <ScoreInline label="Conversion prob" value={e.conversionProb} icon={<TrendingUp className="h-3 w-3" />} />
      </div>

      {l.nextAction && (
        <div className="flex items-center gap-2 text-[11px] rounded-lg border bg-surface-2/60 px-2 py-1.5 flex-wrap">
          <CheckCircle2 className="h-3 w-3 text-role-tcm" />
          <span className="text-foreground font-medium">
            {nextActions.find(a => a.value === l.nextAction!.type)?.label}
          </span>
          {l.nextAction.note && <span className="text-muted-foreground">· {l.nextAction.note}</span>}
          <span className={cn(
            'flex items-center gap-1 ml-auto',
            actionDueLabel(l.nextAction.dueAt).overdue ? 'text-danger' : 'text-muted-foreground'
          )}>
            <Clock className="h-3 w-3" />{actionDueLabel(l.nextAction.dueAt).text}
          </span>
          {l.callOutcome && (
            <span className="text-muted-foreground w-full">
              Last {l.lastChannel === 'whatsapp' ? 'chat' : 'call'}: {callOutcomes.find(c => c.value === l.callOutcome)?.label}
            </span>
          )}
        </div>
      )}

      {/* Shared notes — anyone can add value */}
      <div className="space-y-1.5">
        {notes.length > 0 && (
          <div className="space-y-1">
            {notes.map(n => (
              <div key={n.id} className="flex gap-1.5 text-[11px] text-muted-foreground">
                <StickyNote className="h-3 w-3 mt-0.5 shrink-0 text-role-hr" />
                <span><span className="text-foreground font-medium">{n.byName}:</span> {n.text}</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-1.5">
          <Input
            value={note}
            onChange={(ev) => setNote(ev.target.value)}
            onKeyDown={(ev) => { if (ev.key === 'Enter') submitNote(); }}
            placeholder="Add a note anyone can use…"
            className="h-8 text-xs"
          />
          <Button size="sm" variant="outline" className="h-8 px-2" disabled={!note.trim()} onClick={submitNote}>
            <Send className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <LeadControlPanel
          subject={{ kind: 'lead', lead: l }}
          trigger={
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1">
              <Sparkles className="h-3 w-3" /> Open
            </Button>
          }
        />
        {!l.claimedBy && (
          <>
            <Button size="sm" onClick={() => onClaim(l, 'call')} className="h-8 text-xs flex-1 min-w-[8rem]">
              <Hand className="h-3 w-3 mr-1" /> Claim &amp; call
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onClaim(l, 'whatsapp')} className="h-8 text-xs flex-1 min-w-[8rem]" asChild>
              <a href={waLink(l.phone, `Hi ${l.name}, Gharpayy here about your ${l.area} stay.`)} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-3 w-3 mr-1" /> Claim &amp; chat
              </a>
            </Button>
          </>
        )}
        {incomplete && mine && (
          <Button size="sm" variant="destructive" onClick={() => onFinish(l)} className="h-8 text-xs flex-1">
            Finish call log
          </Button>
        )}
        {mine && !incomplete && (
          <>
            <Button size="sm" onClick={() => onTouch(l, 'call')} className="h-8 text-xs">
              <Phone className="h-3 w-3 mr-1" /> Call again
            </Button>
            <Button size="sm" variant="outline" onClick={() => onTouch(l, 'whatsapp')} className="h-8 text-xs">
              <MessageCircle className="h-3 w-3 mr-1" /> Chat again
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onRelease(l.id)} className="h-8 text-xs text-muted-foreground">
              <RotateCcw className="h-3 w-3 mr-1" /> Release
            </Button>
          </>
        )}
        {(!l.claimedBy || mine) && (
          <Button size="sm" variant="outline" onClick={() => onSchedule(l)} className="h-8 text-xs">
            Schedule tour →
          </Button>
        )}
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <div className="text-base font-bold tabular-nums text-foreground">{value}</div>
      <div className="text-[10px] uppercase tracking-wide">{label}</div>
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
