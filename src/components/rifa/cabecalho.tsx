import { Target } from "lucide-react";

import { Button } from "@/components/ui/button";
import { RIFA } from "@/lib/config";

/** Barra fixa do topo com a marca do organizador e o atalho de compra. */
export function Cabecalho() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        {/* min-h-11 = 44px: a marca também é um alvo de toque (volta ao topo) */}
        <a href="#topo" className="flex min-h-11 min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-verde-claro text-verde">
            <Target className="size-5" />
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-sm font-bold">
              {RIFA.organizador}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {RIFA.cidade}
            </span>
          </span>
        </a>

        <div className="flex shrink-0 items-center gap-4">
          <span className="hidden text-sm text-muted-foreground lg:inline">
            Sorteio em {RIFA.dataSorteioLabel}
          </span>
          {/* h-11 = 44px: alvo de toque mínimo recomendado */}
          <Button asChild className="h-11 px-4 sm:px-5">
            {/* No celular o rótulo curto evita espremer a marca ao lado */}
            <a href="#comprar">
              <span className="sm:hidden">Participar</span>
              <span className="hidden sm:inline">Quero participar</span>
            </a>
          </Button>
        </div>
      </div>
    </header>
  );
}
