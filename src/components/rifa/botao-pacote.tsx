"use client";

import { cn } from "@/lib/utils";

/** Atalho de quantidade de cotas (1, 5, 10...). */
export function BotaoPacote({
  cotas,
  popular,
  ativo,
  aoClicar,
}: {
  cotas: number;
  popular: boolean;
  ativo: boolean;
  aoClicar: () => void;
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      aria-pressed={ativo}
      className={cn(
        "relative cursor-pointer rounded-lg border border-border bg-card py-3 text-center transition-colors hover:border-verde",
        // O selo "mais escolhido" fica meio para fora: abre espaço no topo.
        popular && "pt-5",
        ativo && "border-verde bg-verde-claro ring-1 ring-verde"
      )}
    >
      {popular && (
        <span className="absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-lima px-2 py-0.5 text-[9px] font-extrabold tracking-wide text-escuro uppercase">
          Mais escolhido
        </span>
      )}
      <span className="block text-xl font-extrabold">{cotas}</span>
      <span className="block text-[11px] text-muted-foreground">
        {cotas === 1 ? "cota" : "cotas"}
      </span>
    </button>
  );
}
