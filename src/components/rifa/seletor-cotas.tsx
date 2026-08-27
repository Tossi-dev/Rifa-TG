"use client";

import { Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RIFA, brl } from "@/lib/config";
import { BotaoPacote } from "./botao-pacote";

/** Escolha da quantidade de cotas: pacotes de atalho + contador manual. */
export function SeletorCotas({
  cotas,
  aoMudar,
}: {
  cotas: number;
  aoMudar: (valor: number) => void;
}) {
  // Mantém a quantidade sempre dentro dos limites configurados na rifa.
  const ajustar = (valor: number): void =>
    aoMudar(
      Math.min(
        RIFA.maxCotasPorCompra,
        Math.max(RIFA.minCotas, valor || RIFA.minCotas)
      )
    );

  return (
    <div>
      <Label className="mb-2">Quantidade de cotas</Label>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {RIFA.pacotes.map((pacote) => (
          <BotaoPacote
            key={pacote.cotas}
            cotas={pacote.cotas}
            popular={pacote.popular}
            ativo={cotas === pacote.cotas}
            aoClicar={() => aoMudar(pacote.cotas)}
          />
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11"
          onClick={() => ajustar(cotas - 1)}
          disabled={cotas <= RIFA.minCotas}
          aria-label="Diminuir uma cota"
        >
          <Minus />
        </Button>
        {/* size-11 = 44px nos botões e no campo: alvo de toque mínimo */}
        <Input
          type="number"
          inputMode="numeric"
          className="sem-spinner h-11 text-center font-bold"
          value={cotas}
          min={RIFA.minCotas}
          max={RIFA.maxCotasPorCompra}
          onChange={(e) => ajustar(Number(e.target.value))}
          aria-label="Quantidade de cotas"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11"
          onClick={() => ajustar(cotas + 1)}
          disabled={cotas >= RIFA.maxCotasPorCompra}
          aria-label="Aumentar uma cota"
        >
          <Plus />
        </Button>
      </div>

      <div className="mt-3 flex items-center justify-between rounded-lg bg-verde-claro px-4 py-3">
        <span className="text-sm font-semibold text-verde-escuro">Total</span>
        <span className="text-xl font-extrabold text-verde-escuro">
          {brl(cotas * RIFA.precoCota)}
        </span>
      </div>
    </div>
  );
}
