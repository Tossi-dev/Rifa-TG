"use client";

/* =========================================================================
 *  Tema claro / escuro do painel.
 *
 *  Escopo de propósito: SÓ o /admin. A página de venda é a primeira
 *  impressão de quem vai comprar e tem identidade fixa; quem encara a tela
 *  por meia hora conferindo número é o organizador, e é a vista dele que o
 *  tema escuro poupa.
 *
 *  Três estados, não dois: claro, escuro e "sistema". Sem o terceiro, quem
 *  usa o computador em modo automático fica preso ao que escolheu num dia de
 *  sol e volta a levar luz na cara à noite.
 * ========================================================================= */

import { useCallback, useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

export type Tema = "claro" | "escuro" | "sistema";

export const CHAVE_TEMA = "rifa-tg:tema";

/**
 * Script que roda ANTES da primeira pintura.
 *
 * Sem ele o painel aparece branco por um quadro e só depois escurece — o
 * flash que cansa exatamente a vista de quem pediu o tema escuro. Por isso
 * ele é uma string inline no `<head>`, e não um `useEffect`: efeito de React
 * roda depois da pintura, quando o estrago já aconteceu.
 *
 * O `pathname` é conferido aqui porque a classe vive no `<html>`, que é
 * compartilhado com a página de venda.
 */
export const SCRIPT_TEMA = `(function(){try{
if(location.pathname.indexOf('/admin')!==0)return;
var s=localStorage.getItem('${CHAVE_TEMA}');
var e=(s==='escuro'||s==='claro')?s:(matchMedia('(prefers-color-scheme: dark)').matches?'escuro':'claro');
document.documentElement.classList.toggle('dark',e==='escuro');
document.documentElement.style.colorScheme=(e==='escuro'?'dark':'light');
}catch(_){}})()`;

function aplicar(tema: Tema): void {
  const escuro =
    tema === "escuro" ||
    (tema === "sistema" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", escuro);
  /* `color-scheme` é o que faz o navegador desenhar barra de rolagem, campo
     de formulário e menu nativo na cor certa. Sem isto sobra uma barra de
     rolagem branca de fora do tema, no canto da tela. */
  document.documentElement.style.colorScheme = escuro ? "dark" : "light";
}

const OPCOES: Array<{ valor: Tema; rotulo: string; Icone: typeof Sun }> = [
  { valor: "claro", rotulo: "Tema claro", Icone: Sun },
  { valor: "escuro", rotulo: "Tema escuro", Icone: Moon },
  { valor: "sistema", rotulo: "Acompanhar o sistema", Icone: Monitor },
];

/**
 * Preferência guardada, lida no primeiro render.
 *
 * Ler no inicializador do estado, e não num efeito, evita o render extra em
 * que o botão errado aparece marcado por um quadro. O `typeof window` cobre a
 * renderização no servidor — onde `localStorage` não existe.
 */
function temaGuardado(): Tema {
  if (typeof window === "undefined") return "sistema";
  const guardado = localStorage.getItem(CHAVE_TEMA);
  return guardado === "claro" || guardado === "escuro" ? guardado : "sistema";
}

export function BotaoTema() {
  const [tema, setTema] = useState<Tema>(temaGuardado);

  useEffect(() => {
    aplicar(tema);

    /* Em "sistema", seguir o sistema DE VERDADE: quem tem o computador
       configurado para escurecer ao anoitecer espera que a aba aberta
       acompanhe, sem ter que recarregar. */
    const consulta = window.matchMedia("(prefers-color-scheme: dark)");
    const aoMudar = (): void => {
      if (!localStorage.getItem(CHAVE_TEMA)) aplicar("sistema");
    };
    consulta.addEventListener("change", aoMudar);

    /* A classe vive no <html>, que é compartilhado com a página de venda.
       Sem esta limpeza, navegar do painel para a home levaria o tema escuro
       junto e a página de venda apareceria com a identidade trocada. */
    return () => {
      consulta.removeEventListener("change", aoMudar);
      document.documentElement.classList.remove("dark");
      document.documentElement.style.colorScheme = "";
    };
    /* Só na montagem: `aplicar` já é chamado por `escolher` a cada clique, e
       repetir aqui reinstalaria o ouvinte a cada troca de tema. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const escolher = useCallback((escolhido: Tema): void => {
    setTema(escolhido);
    if (escolhido === "sistema") localStorage.removeItem(CHAVE_TEMA);
    else localStorage.setItem(CHAVE_TEMA, escolhido);
    aplicar(escolhido);
  }, []);

  return (
    <div
      role="radiogroup"
      aria-label="Tema do painel"
      className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5"
    >
      {OPCOES.map(({ valor, rotulo, Icone }) => {
        const ativo = tema === valor;
        return (
          <button
            key={valor}
            type="button"
            role="radio"
            aria-checked={ativo}
            aria-label={rotulo}
            title={rotulo}
            onClick={() => escolher(valor)}
            className={`flex size-7 items-center justify-center rounded-md transition-colors duration-150 ${
              ativo
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icone className="size-4" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
