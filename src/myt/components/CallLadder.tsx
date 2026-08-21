import { CheckCircle2, Circle, Gauge, PhoneOff, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { CallStage, Lead, DiscoveryKey } from '@/myt/lib/types';
import {
  CALL_PLAYS, STAGE_ORDER, currentStage, closingReadiness, readinessTone,
  readinessVerdict, play, askFields, filled, attemptsAtStage, waStatusMeta,
} from '@/myt/lib/call-plan';

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

      {/* the 5 rungs — done / current / locked */}
      <div className="flex items-center gap-1">
        {STAGE_ORDER.map((s) => {
          const done = s < stage;
          const now = s === activeStage;
          return (
            <button type="button" key={s} title={`${CALL_PLAYS[s].code} · ${CALL_PLAYS[s].name} — ${CALL_PLAYS[s].mission}`}
              onClick={() => onSelectStage?.(s)} disabled={!onSelectStage}
              className={cn('flex-1 rounded-lg border px-1.5 py-1 text-center transition-colors',
                onSelectStage && 'cursor-pointer hover:border-primary hover:bg-primary/10 disabled:cursor-default',
                done && !now ? 'border-role-tcm/40 bg-role-tcm/10 text-role-tcm'
                  : now ? 'border-primary bg-primary/10 text-primary font-semibold'
                  : 'border-border text-muted-foreground/50')}>
              <div className="text-[10px] font-bold leading-none">C{s}</div>
              <div className="text-[9px] leading-tight truncate">{CALL_PLAYS[s].name}</div>
            </button>
          );
        })}
      </div>

      {!compact && (
        <>
          <div className="text-[11px]">
            <span className="text-muted-foreground">This call wins when: </span>{p.win}
          </div>

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
