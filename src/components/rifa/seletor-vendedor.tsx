"use client";

/* =========================================================================
 *  "Quem te indicou?"
 *
 *  Rede de segurança do link pessoal. Quem chega por `/v/joao-silva` já vem
 *  marcado e só confere; quem chega pelo Instagram, pelo Google ou por print
 *  de tela escolhe na lista. Sem este campo, toda venda que não passou pelo
 *  link vira venda direta e o placar dos 48 vendedores fica torto.
 *
 *  É `<select>` nativo de propósito. Com 48 nomes, o seletor do próprio
 *  celular abre em tela cheia, com busca por letra e do tamanho que o dedo
 *  precisa — qualquer combobox desenhado à mão seria pior em tudo isso, e
 *  este campo aparece no meio do caminho do dinheiro.
 * ========================================================================= */

import { useEffect, useState } from "react";
import { Check } from "lucide-react";

import { Label } from "@/components/ui/label";

interface VendedorPublico {
  codigo: string;
  nome: string;
}

/** Lê o cookie que o link pessoal gravou. */
function vendedorDoCookie(): string {
  const achado = document.cookie
    .split("; ")
    .find((p) => p.startsWith("rifa_vendedor="));
  return achado ? decodeURIComponent(achado.split("=")[1] ?? "") : "";
}

export function SeletorVendedor({
  valor,
  aoMudar,
}: {
  valor: string;
  aoMudar: (codigo: string) => void;
}) {
  const [lista, setLista] = useState<VendedorPublico[]>([]);
  const [veioDoLink, setVeioDoLink] = useState<boolean>(false);
  const [carregado, setCarregado] = useState<boolean>(false);

  useEffect(() => {
    let vivo = true;

    (async () => {
      try {
        const resposta = await fetch("/api/vendedores");
        const corpo = (await resposta.json()) as { vendedores?: VendedorPublico[] };
        if (!vivo) return;
        const vendedores = corpo.vendedores ?? [];
        setLista(vendedores);

        /* Só marca se o código do cookie ainda existir e estiver ativo. Um
           vendedor desligado no meio da campanha deixaria o comprador com uma
           marca invisível que a API iria descartar — e o campo mostraria um
           nome que não está na lista. */
        const doCookie = vendedorDoCookie();
        if (doCookie && vendedores.some((v) => v.codigo === doCookie)) {
          aoMudar(doCookie);
          setVeioDoLink(true);
        }
      } catch {
        // Sem lista, o campo simplesmente não aparece. A compra segue.
      } finally {
        if (vivo) setCarregado(true);
      }
    })();

    return () => {
      vivo = false;
    };
    /* Só na montagem: `aoMudar` vem do formulário e muda a cada tecla
       digitada nos outros campos. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Nenhum vendedor cadastrado: campo nem existe.
  if (!carregado || lista.length === 0) return null;

  const escolhido = lista.find((v) => v.codigo === valor);

  return (
    <div className="space-y-1.5">
      <Label htmlFor="vendedor">Quem te indicou?</Label>
      <select
        id="vendedor"
        name="vendedor"
        value={valor}
        onChange={(e) => {
          aoMudar(e.target.value);
          setVeioDoLink(false);
        }}
        className="flex h-11 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm"
      >
        <option value="">Ninguém — comprei direto pelo site</option>
        {lista.map((v) => (
          <option key={v.codigo} value={v.codigo}>
            {v.nome}
          </option>
        ))}
      </select>

      {veioDoLink && escolhido ? (
        <p className="flex items-center gap-1.5 text-xs font-medium text-verde">
          <Check className="size-3.5 shrink-0" aria-hidden />
          Você chegou pelo link de {escolhido.nome}. Se não for, é só trocar
          acima.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Ajuda a gente a saber quem trouxe cada venda. Não muda o preço nem a
          sua chance no sorteio.
        </p>
      )}
    </div>
  );
}
