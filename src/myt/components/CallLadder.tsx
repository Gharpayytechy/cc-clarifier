import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, Gauge, PhoneOff, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { CallStage, Lead, DiscoveryKey } from '@/myt/lib/types';
import {
  CALL_PLAYS, STAGE_ORDER, currentStage, closingReadiness, readinessTone,
  readinessVerdict, play, askFields, filled, attemptsAtStage, waStatusMeta,
  type DiscoveryField,
} from '@/myt/lib/call-plan';
import {
  BLOCKERS, STAGE_GATES, journeyBlockers, journeyDone, stageGateStatus, stageGates,
  type BlockerId, type CallCode, type JourneyId,
} from '@/myt/lib/journey';
import { applyOverride, useJourneyOverrides } from '@/myt/lib/journey-store';



/**
 * The same ladder the call sheet runs on, in read-only form:
 * which call this lead is on, what that call needs, and how close to closeable.
 * When `onSaveField` is passed, the "Ask on C#" list becomes fillable inline —
 * so the dossier can be completed live from the drawer.
 */
export function CallLadder({ lead, compact = false, selectedStage, onSelectStage, onSaveField }: {
  lead: Lead;
  compact?: boolean;
  selectedStage?: CallStage;
  onSelectStage?: (stage: CallStage) => void;
  onSaveField?: (key: DiscoveryKey, value: string) => void;
}) {
  const stage = currentStage(lead);
  const activeStage = selectedStage ?? stage;
  const p = play(activeStage);
  const r = closingReadiness(lead);
  const tone = readinessTone(r.pct);
  const attempts = attemptsAtStage(lead, activeStage);
  const allAsks = askFields(activeStage);
  const open = allAsks.filter((f) => !filled(lead.discovery, f.key));
  const wa = waStatusMeta(lead.waStatus);


  return (
    <div className="rounded-xl border bg-surface-2/40 p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-md border',
          p.colour === 'good' ? 'bg-role-tcm/10 border-role-tcm/40 text-role-tcm'
            : p.colour === 'warn' ? 'bg-role-hr/10 border-role-hr/40 text-role-hr'
            : 'bg-primary/10 border-primary/40 text-primary')}>{p.code}</span>
        <div className="text-xs font-semibold">Call {activeStage} · {p.name}</div>
        <span className={cn('ml-auto text-[10px] font-semibold',
          tone === 'good' ? 'text-role-tcm' : tone === 'warn' ? 'text-role-hr' : 'text-danger')}>
          {r.pct}%
        </span>
      </div>

      <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
        <div className={cn('h-full rounded-full transition-all',
          tone === 'good' ? 'bg-role-tcm' : tone === 'warn' ? 'bg-role-hr' : 'bg-danger')}
          style={{ width: `${r.pct}%` }} />
      </div>

      <div className="text-[11px] text-muted-foreground flex items-start gap-1.5">
        <Gauge className="h-3 w-3 mt-0.5 shrink-0" /> {readinessVerdict(r)}
      </div>

      {/* the 5 rungs — done / current / locked, each showing its S-gate score */}
      <div className="flex items-center gap-1">
        {STAGE_ORDER.map((s) => {
          const done = s < stage;
          const now = s === activeStage;
          const g = stageGateStatus(lead, s as CallCode);
          return (
            <button type="button" key={s} title={`${CALL_PLAYS[s].code} · ${CALL_PLAYS[s].name} — clears ${STAGE_GATES[s as CallCode].join(', ') || 'recovery only'}`}
              onClick={() => onSelectStage?.(s)} disabled={!onSelectStage}
              className={cn('flex-1 rounded-lg border px-1.5 py-1 text-center transition-colors',
                onSelectStage && 'cursor-pointer hover:border-primary hover:bg-primary/10 disabled:cursor-default',
                done && !now ? 'border-role-tcm/40 bg-role-tcm/10 text-role-tcm'
                  : now ? 'border-primary bg-primary/10 text-primary font-semibold'
                  : 'border-border text-muted-foreground/50')}>
              <div className="text-[10px] font-bold leading-none">C{s}</div>
              <div className="text-[9px] leading-tight truncate">{CALL_PLAYS[s].name}</div>
              <div className="text-[9px] leading-none mt-0.5 tabular-nums opacity-80">
                {g.total ? `${g.cleared}/${g.total}` : 'NR·NU·NO'}
              </div>
            </button>
          );
        })}
      </div>

      {!compact && (
        <>
          <div className="text-[11px]">
            <span className="text-muted-foreground">This call wins when: </span>{p.win}
          </div>

          <StageGates lead={lead} stage={activeStage as CallCode} />


          {onSaveField ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                Ask on {p.code} · {open.length} left
                <span className="normal-case tracking-normal text-muted-foreground/70">fill live during the call</span>
              </div>
              {allAsks.map((f) => (
                <AskField key={f.key} field={f} value={lead.discovery?.[f.key] ?? ''} onSave={onSaveField} />
              ))}
              {open.length === 0 && (
                <div className="text-[11px] text-role-tcm flex items-center gap-1.5">
                  <CheckCircle2 className="h-3 w-3" /> {p.code} dossier complete — move to Call {Math.min(activeStage + 1, 5)}.
                </div>
              )}
            </div>
          ) : (
            <>
              {open.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                    Ask on {p.code} · {open.length} left
                  </div>
                  {open.map((f) => (
                    <div key={f.key} className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                      <Circle className="h-2.5 w-2.5" /> {f.label}
                    </div>
                  ))}
                </div>
              )}
              {open.length === 0 && (
                <div className="text-[11px] text-role-tcm flex items-center gap-1.5">
                  <CheckCircle2 className="h-3 w-3" /> {p.code} data complete — move to Call {Math.min(activeStage + 1, 5)}.
                </div>
              )}
            </>
          )}


          {attempts > 0 && (
            <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <PhoneOff className="h-3 w-3" /> {attempts} attempt{attempts === 1 ? '' : 's'} logged on {p.code} — {p.noAnswer.move}
            </div>
          )}

          {wa && (
            <div className="text-[11px] text-muted-foreground">WhatsApp: {wa.label}{lead.waLabel ? ` · ${lead.waLabel}` : ''}</div>
          )}

          {lead.nextCall && (
            <div className="text-[11px] text-primary flex items-center gap-1.5">
              <Target className="h-3 w-3" />
              Next: Call {lead.nextCall.stage} · {play(lead.nextCall.stage).name} — {new Date(lead.nextCall.dueAt).toLocaleString()}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** One fillable dossier question — chips for choices, typed input otherwise. */
function AskField({ field, value, onSave }: {
  field: DiscoveryField;
  value: string;
  onSave: (key: DiscoveryKey, value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const done = value.trim().length > 0;

  useEffect(() => { setDraft(value); }, [value]);

  return (
    <div className={cn('rounded-lg border p-2 space-y-1.5',
      done ? 'border-role-tcm/40 bg-role-tcm/5' : 'border-border bg-card')}>
      <div className="flex items-center gap-1.5">
        {done
          ? <CheckCircle2 className="h-3 w-3 text-role-tcm shrink-0" />
          : <Circle className="h-2.5 w-2.5 text-muted-foreground shrink-0" />}
        <span className="text-[11px] font-medium text-foreground">{field.label}</span>
        {field.required && !done && <span className="text-[9px] text-danger">required</span>}
      </div>

      {field.kind === 'choice' ? (
        <div className="flex flex-wrap gap-1">
          {field.options!.map((o) => (
            <button type="button" key={o}
              onClick={() => onSave(field.key, value === o ? '' : o)}
              className={cn('rounded-md border px-1.5 py-0.5 text-[10px] leading-tight transition-colors',
                value === o
                  ? 'bg-primary border-primary text-primary-foreground font-medium'
                  : 'border-border bg-surface-2 text-muted-foreground hover:text-foreground hover:border-primary/50')}>
              {o}
            </button>
          ))}
        </div>
      ) : (
        <Input
          type={field.kind === 'date' ? 'date' : field.kind === 'number' ? 'number' : 'text'}
          value={draft}
          placeholder={field.label}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { if (draft !== value) onSave(field.key, draft); }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          className="h-7 text-[11px]"
        />
      )}

      <p className="text-[9px] text-muted-foreground">{field.why}</p>
    </div>
  );
}


/**
 * The S-gates this call is accountable for (C1 → S1..S3, C2 → LOC..S6,
 * C3 → S7, C4 → S8, C5 → clear NR/NU/NO). Click a gate to mark it cleared.
 */
function StageGates({ lead, stage }: { lead: Lead; stage: CallCode }) {
  const derived = journeyDone(lead);
  const derivedBlockers = journeyBlockers(lead);
  const stepOv = useJourneyOverrides((s) => s.steps[lead.id]);
  const blockOv = useJourneyOverrides((s) => s.blockers[lead.id]);
  const toggleStep = useJourneyOverrides((s) => s.toggleStep);
  const toggleBlocker = useJourneyOverrides((s) => s.toggleBlocker);
  const gates = stageGates(stage);

  const isDone = (id: JourneyId) => applyOverride(derived[id], stepOv?.[id]);
  const cleared = gates.filter((g) => isDone(g.id)).length;

  return (
    <div className="space-y-1.5 rounded-lg border border-border bg-card p-2">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
        Gates on C{stage}
        {gates.length > 0 && (
          <span className={cn('tabular-nums font-semibold',
            cleared === gates.length ? 'text-role-tcm' : 'text-foreground')}>
            {cleared}/{gates.length} cleared
          </span>
        )}
      </div>

      {gates.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {gates.map((g) => {
            const on = isDone(g.id);
            return (
              <button type="button" key={g.id}
                onClick={() => toggleStep(lead.id, g.id, derived[g.id])}
                title={`${g.code} — ${g.why}`}
                aria-pressed={on}
                className={cn('rounded-md border px-1.5 py-[3px] text-[10px] font-semibold uppercase leading-none tracking-tight transition-colors',
                  g.sub && 'text-[9px]',
                  on
                    ? 'border-role-tcm/40 bg-role-tcm/15 text-role-tcm'
                    : 'border-border bg-surface-2 text-muted-foreground hover:border-primary/50 hover:text-foreground')}>
                {g.code}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-[10px] text-muted-foreground">
          Revival call — no new gate. Job is to clear a blocker and push the lead back to its open gate.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1">
        {(Object.keys(BLOCKERS) as BlockerId[]).map((b) => {
          const on = applyOverride(derivedBlockers.includes(b), blockOv?.[b]);
          return (
            <button type="button" key={b}
              onClick={() => toggleBlocker(lead.id, b, derivedBlockers.includes(b))}
              title={`${b} · ${BLOCKERS[b].label} — ${BLOCKERS[b].why}`}
              aria-pressed={on}
              className={cn('rounded border px-1 py-[3px] text-[9px] font-bold uppercase leading-none transition-colors',
                on ? 'border-danger/50 bg-danger/15 text-danger'
                  : 'border-border bg-surface-2 text-muted-foreground hover:text-foreground')}>
              {b}{on ? ` · ${BLOCKERS[b].label}` : ''}
            </button>
          );
        })}
      </div>
    </div>
  );
}
