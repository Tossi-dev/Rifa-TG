"use client";

/* =========================================================================
 *  Cartão de indicador.
 *
 *  Cinco elementos obrigatórios, sempre nesta ordem: rótulo em linguagem
 *  clara, valor formatado, COMPOSIÇÃO (a conta que gerou o número),
 *  comparação com a referência, e cor semântica correta.
 *
 *  A composição é o que separa um painel auditável de uma afirmação de
 *  autoridade. Sem ela, a conversa trava discutindo de onde veio o número em
 *  vez do que fazer com ele.
 * ========================================================================= */

import { Minus, TrendingDown, TrendingUp } from "lucide-react";

import type { Kpi } from "@/lib/painel";

/* Classe única dos dois cartões. `-translate-y-px` com sombra é o que dá ao
   cartão a resposta física de "isto é clicável" sem recolorir a borda de
   verde — verde de marca contornando um indicador que está em vermelho era
   uma contradição de cor a cada passada do mouse. */
const CARTAO =
  "group flex flex-col rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-[box-shadow,border-color,transform] duration-150 hover:-translate-y-px hover:border-input hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const ROTULO =
  "text-[11px] font-bold tracking-wide text-muted-foreground uppercase";

/* A dica só aparece na passada do mouse ou no foco. Repetida em seis
   cartões, ela ocupava a dobra dos 5 segundos com a mesma frase seis vezes. */
const DICA =
  "mt-2 text-[11px] text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100";

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

export function CartaoKpi({
  kpi,
  aoAbrir,
}: {
  kpi: Kpi;
  aoAbrir: (kpi: Kpi) => void;
}) {
  const referencia = kpi.referencia;
  const temReferencia = referencia !== null;

  /* Variação percentual contra a referência. Com referência zero não existe
     percentual (divisão por zero), então a comparação vira "está em zero ou
     não está" — que é exatamente a leitura útil para "a devolver". */
  let variacao: number | null = null;
  if (referencia !== null && referencia !== 0) {
    variacao = ((kpi.valor - referencia) / Math.abs(referencia)) * 100;
  }

  const subiu = referencia !== null && kpi.valor > referencia;
  const desceu = referencia !== null && kpi.valor < referencia;
  const igual = temReferencia && !subiu && !desceu;

  /* A cor diz BOM ou RUIM, nunca SUBIU ou DESCEU. Em "a devolver", menor é
     melhor — pintar a queda de vermelho faria o painel mentir. */
  const bom = kpi.direcaoBoa === "cima" ? subiu || igual : desceu || igual;
  /* Ícone da mesma família dos outros seis da tela. Os glifos ▲▼▬ eram
     caracteres de fonte de fallback: largura e linha de base mudavam de
     sistema para sistema, e o ▬ é um retângulo cheio, pesado demais. */
  const Seta = igual ? Minus : subiu ? TrendingUp : TrendingDown;
  /* Token de TEXTO, não o de marca: `--estado-bom` dá 3,38:1 no branco e
     reprova o AA como letra. O par escurecido passa em 5,41:1. */
  const corVariacao = !temReferencia
    ? "var(--muted-foreground)"
    : bom
      ? "var(--estado-bom-texto)"
      : "var(--estado-ruim-texto)";

  /* Variação enorme vira número ilegível: "1.152%" não diz nada, "12,5x o
     necessário" diz tudo. O corte é em 200%, onde o percentual deixa de ser
     a forma natural de ler a diferença. */
  const textoVariacao = (() => {
    if (variacao === null) return igual ? "no valor esperado" : "acima do esperado";
    const absoluta = Math.abs(variacao);
    if (absoluta >= 200 && referencia) {
      const vezes = kpi.valor / referencia;
      return `${vezes.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}x`;
    }
    return `${absoluta.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  })();

  /* --------------------------------------------------------- Progresso -- */
  if (kpi.tipo === "progresso" && referencia !== null && referencia > 0) {
    const parte = Math.min(100, (kpi.valor / referencia) * 100);
    const bateu = kpi.valor >= referencia;
    const cor = bateu ? "var(--estado-bom)" : "var(--serie-1)";
    const corTexto = bateu ? "var(--estado-bom-texto)" : "var(--serie-1)";
    return (
      <button
        type="button"
        onClick={() => aoAbrir(kpi)}
        aria-label={`${kpi.label}: ver de onde vem o número`}
        className={CARTAO}
      >
        <p className={ROTULO}>{kpi.label}</p>
        <p className="mt-1.5 text-[28px] leading-none font-bold tracking-[-0.02em] tabular-nums text-foreground">
          {formatar(kpi.valor, kpi.formato)}
        </p>
        <p className="mt-2 text-xs leading-snug text-muted-foreground">
          {kpi.composicao}
        </p>
        <div className="mt-auto pt-3">
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-secondary"
            role="img"
            aria-label={`${parte.toFixed(0)}% de ${kpi.labelReferencia}`}
          >
            {/* A barra ANIMA a largura: sem transição ela se teleporta ao
                atualizar ou ao entrar na simulação, e o salto lê como falha
                de renderização em vez de mudança de número. */}
            <div
              className="h-full rounded-full transition-[width] duration-500 ease-out"
              style={{ width: `${parte}%`, backgroundColor: cor }}
            />
          </div>
          <p className="mt-2 text-xs font-semibold" style={{ color: corTexto }}>
            {parte.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%{" "}
            <span className="font-normal text-muted-foreground">
              {kpi.labelReferencia} ({formatar(referencia, kpi.formato)}) —
              faltam {formatar(Math.max(0, referencia - kpi.valor), kpi.formato)}
            </span>
          </p>
          <p className={DICA}>Toque para ver de onde vem</p>
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => aoAbrir(kpi)}
      aria-label={`${kpi.label}: ver de onde vem o número`}
      className={CARTAO}
    >
      <p className={ROTULO}>{kpi.label}</p>

      <p className="mt-1.5 text-[28px] leading-none font-bold tracking-[-0.02em] tabular-nums text-foreground">
        {formatar(kpi.valor, kpi.formato)}
      </p>

      <p className="mt-2 text-xs leading-snug text-muted-foreground">
        {kpi.composicao}
      </p>

      <div className="mt-auto pt-3">
        {referencia !== null ? (
          <p
            className="flex flex-wrap items-center gap-x-1.5 text-xs font-semibold"
            style={{ color: corVariacao }}
          >
            <Seta className="size-3.5 shrink-0" aria-hidden />
            {textoVariacao}{" "}
            <span className="font-normal text-muted-foreground">
              vs {kpi.labelReferencia} ({formatar(referencia, kpi.formato)})
            </span>
          </p>
        ) : (
          <p className="text-xs leading-snug text-muted-foreground">
            {kpi.motivoSemReferencia ?? "Sem referência de comparação."}
          </p>
        )}
        <p className={DICA}>Toque para ver de onde vem</p>
      </div>
    </button>
  );
}
