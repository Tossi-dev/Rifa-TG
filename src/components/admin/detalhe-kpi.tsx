"use client";

/* =========================================================================
 *  Memória de cálculo de um indicador.
 *
 *  Abre ao clicar no cartão. Existe porque um número sozinho é uma afirmação
 *  de autoridade: quem lê não tem como conferir, e a reunião trava discutindo
 *  a origem do dado em vez do que fazer com ele. Aqui o cartão fica auditável
 *  em dois segundos — a conta, a fonte, o método e como conferir por fora.
 * ========================================================================= */

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Kpi } from "@/lib/painel";

function formatar(valor: number, formato: Kpi["formato"]): string {
  switch (formato) {
    case "moeda":
      return valor.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });
    case "percentual":
      return `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
    case "decimal":
      return valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
    default:
      return valor.toLocaleString("pt-BR");
  }
}

/**
 * Frase da comparação.
 *
 * `labelReferencia` vem com artigo ("da meta da campanha") porque no cartão ela
 * segue um percentual — "0% da meta da campanha". Aqui ela começa a frase, e
 * "Comparado com da meta" não é português.
 */
function frasePreferencia(kpi: Kpi): string {
  const valor = formatar(kpi.referencia as number, kpi.formato);
  const semArtigo = kpi.labelReferencia.replace(/^(da|do|de)\s+/i, "");
  if (kpi.tipo === "progresso") {
    return `Este indicador mede o caminho até ${semArtigo}: ${valor}.`;
  }
  return `Comparado com o ${semArtigo} (${valor}).`;
}

export function DetalheKpi({
  kpi,
  aoFechar,
}: {
  kpi: Kpi;
  aoFechar: () => void;
}) {
  const caixa = useRef<HTMLDivElement | null>(null);

  /* Esc fecha e o foco vai para dentro do diálogo: quem navega por teclado
     não pode ficar preso atrás de uma janela que não recebe foco. */
  useEffect(() => {
    caixa.current?.focus();
    const aoTeclar = (evento: KeyboardEvent): void => {
      if (evento.key === "Escape") aoFechar();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aoFechar]);

  const linhas: Array<[string, string]> = [
    ["De onde vem o dado", kpi.detalhe.deOndeVem],
    ["Como é calculado", kpi.detalhe.comoECalculado],
    ["Onde conferir", kpi.detalhe.ondeConferir],
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-escuro/50 p-0 sm:items-center sm:p-4"
      onClick={aoFechar}
    >
      <div
        ref={caixa}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Memória de cálculo: ${kpi.label}`}
        className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-card p-5 shadow-lg outline-none sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
              {kpi.label}
            </p>
            <p className="mt-1 text-3xl font-extrabold tabular-nums">
              {formatar(kpi.valor, kpi.formato)}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={aoFechar}
            aria-label="Fechar"
          >
            <X />
          </Button>
        </div>

        <div className="mt-4 rounded-xl bg-secondary px-4 py-3">
          <p className="text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
            A conta
          </p>
          <p className="mt-1 text-sm leading-relaxed">{kpi.composicao}</p>
        </div>

        <div className="mt-4 space-y-4">
          {linhas.map(([titulo, texto]) => (
            <div key={titulo}>
              <p className="text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
                {titulo}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-foreground">
                {texto}
              </p>
            </div>
          ))}

          <div>
            <p className="text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
              Comparação
            </p>
            <p className="mt-1 text-sm leading-relaxed text-foreground">
              {kpi.referencia !== null
                ? `${frasePreferencia(kpi)}${
                    kpi.direcaoBoa === "baixo"
                      ? " Neste indicador MENOR é melhor, então o cartão fica verde quando o número cai."
                      : ""
                  }`
                : (kpi.motivoSemReferencia ??
                  "Este indicador não tem referência de comparação.")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
