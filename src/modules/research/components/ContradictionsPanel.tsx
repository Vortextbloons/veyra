import { Scale } from "lucide-react";
import type {
  ResearchContradiction,
  ResearchClaim,
  ResearchSource,
} from "../research-types";

type Props = {
  contradictions: ResearchContradiction[];
  claims: ResearchClaim[];
  sources: ResearchSource[];
};

export function ContradictionsPanel({ contradictions, claims, sources }: Props) {
  if (contradictions.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-[12.5px] text-[var(--color-text-dim)]">
        No contradictions detected.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <h2 className="text-[14px] font-semibold text-[var(--color-text)]">
          Contradictions ({contradictions.length})
        </h2>
      </div>

      <div className="flex flex-col gap-4">
        {contradictions.map((c) => {
          const claimA = claims.find((cl) => cl.id === c.claimAId);
          const claimB = claims.find((cl) => cl.id === c.claimBId);
          const sourceA = sources.find((s) => s.id === claimA?.sourceId);
          const sourceB = sources.find((s) => s.id === claimB?.sourceId);

          return (
            <div
              key={c.id}
              className="flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
            >
              {/* Claim cards side by side */}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_1fr]">
                {/* Claim A */}
                <ClaimCard
                  claim={claimA}
                  source={sourceA}
                  confidence={c.claimAConfidence}
                  label="Claim A"
                />

                {/* VS indicator */}
                <div className="flex items-center justify-center">
                  <div className="grid size-8 place-items-center rounded-full bg-amber-500/10 text-amber-300">
                    <Scale className="size-4" />
                  </div>
                </div>

                {/* Claim B */}
                <ClaimCard
                  claim={claimB}
                  source={sourceB}
                  confidence={c.claimBConfidence}
                  label="Claim B"
                />
              </div>

              {/* Reason & Resolution */}
              {(c.reason || c.resolution) && (
                <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
                  {c.reason && (
                    <p className="text-[12px] text-[var(--color-text-dim)]">
                      <span className="font-medium text-[var(--color-text)]">Reason: </span>
                      {c.reason}
                    </p>
                  )}
                  {c.resolution && (
                    <p className="mt-1 text-[12px] text-emerald-300">
                      <span className="font-medium">Resolution: </span>
                      {c.resolution}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ClaimCard({
  claim,
  source,
  confidence,
  label,
}: {
  claim?: ResearchClaim;
  source?: ResearchSource;
  confidence: number;
  label: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-wide text-[var(--color-text-dim)]">
          {label}
        </span>
        <div className="flex items-center gap-1">
          <div className="h-1.5 w-10 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className={`h-full rounded-full ${
                confidence >= 0.8
                  ? "bg-emerald-500/60"
                  : confidence >= 0.5
                    ? "bg-amber-500/60"
                    : "bg-red-500/60"
              }`}
              style={{ width: `${Math.round(confidence * 100)}%` }}
            />
          </div>
          <span className="text-[9px] font-mono text-[var(--color-text-dim)]">
            {Math.round(confidence * 100)}%
          </span>
        </div>
      </div>
      <p className="text-[12.5px] leading-relaxed text-[var(--color-text)]">
        {claim?.claim || "Unknown claim"}
      </p>
      {source && (
        <div className="mt-2 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5">
          <p className="truncate text-[10.5px] font-medium text-[var(--color-text-dim)]">
            {source.title}
          </p>
          <p className="mt-0.5 truncate text-[9.5px] text-[var(--color-text-muted)]">
            {source.url}
          </p>
          {claim?.status && (
            <p className="mt-1 text-[9.5px] font-mono uppercase tracking-wide text-amber-300/80">
              {claim.status.replace(/_/g, " ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
