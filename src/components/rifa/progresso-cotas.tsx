"use client";

import { useEffect, useState } from "react";

import { Progress } from "@/components/ui/progress";
import type { ResumoCotas } from "@/lib/store";

/**
 * Barra de progresso das cotas vendidas.
 * Recebe o resumo já renderizado no servidor e revalida a cada 30s,
 * para que a página não fique "parada" enquanto outras pessoas compram.
 */
export function ProgressoCotas({ inicial }: { inicial: ResumoCotas }) {
  const [dados, setDados] = useState<ResumoCotas>(inicial);

  useEffect(() => {
    let vivo = true;
    const buscar = (): void => {
      fetch("/api/resumo", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: ResumoCotas | null) => {
          if (vivo && d) setDados(d);
        })
        .catch(() => {});
    };

    buscar();
    const t = setInterval(buscar, 30_000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, []);

  // Mostra um fiozinho de barra assim que existe qualquer venda.
  const largura = Math.max(dados.percentual, dados.vendidas > 0 ? 2 : 0);

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
          Cotas já garantidas
        </span>
        <span className="text-sm font-bold text-verde">
          {dados.percentual}%
        </span>
      </div>
      <Progress value={largura} aria-label="Cotas vendidas" />
      <p className="mt-2 text-sm text-muted-foreground">
        {dados.vendidas.toLocaleString("pt-BR")} de{" "}
        {dados.total.toLocaleString("pt-BR")} números vendidos ·{" "}
        <strong className="text-foreground">
          {dados.disponiveis.toLocaleString("pt-BR")} disponíveis
        </strong>
      </p>
    </div>
  );
}
