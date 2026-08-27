"use client";

import { useEffect, useState } from "react";

/** Quebra os milissegundos restantes em dias, horas, minutos e segundos. */
function repartir(restante: number): Array<{ rotulo: string; valor: number }> {
  return [
    { rotulo: "dias", valor: Math.floor(restante / 86_400_000) },
    { rotulo: "horas", valor: Math.floor(restante / 3_600_000) % 24 },
    { rotulo: "min", valor: Math.floor(restante / 60_000) % 60 },
    { rotulo: "seg", valor: Math.floor(restante / 1_000) % 60 },
  ];
}

/** Contagem regressiva até a data do sorteio. */
export function ContadorSorteio({ ate }: { ate: string }) {
  const alvo = new Date(ate).getTime();
  const [restante, setRestante] = useState<number | null>(null);

  useEffect(() => {
    const tick = (): void => setRestante(Math.max(0, alvo - Date.now()));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [alvo]);

  // Antes da hidratação não renderiza nada, para não divergir servidor/cliente.
  if (restante === null) return null;

  if (restante === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-center font-bold shadow-sm">
        Sorteio realizado
      </div>
    );
  }

  const partes = repartir(restante);

  return (
    <div
      className="grid grid-cols-4 gap-2"
      aria-label="Tempo restante para o sorteio"
    >
      {partes.map((p) => (
        <div
          key={p.rotulo}
          className="rounded-xl border border-border bg-card px-2 py-3 text-center shadow-sm"
        >
          <div className="text-2xl font-extrabold tabular-nums text-foreground">
            {String(p.valor).padStart(2, "0")}
          </div>
          <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            {p.rotulo}
          </div>
        </div>
      ))}
    </div>
  );
}
