import { NextResponse } from "next/server";

import { listarVendedores } from "@/lib/store";

export const runtime = "nodejs";

/**
 * Lista pública dos vendedores ativos, para o campo "quem te indicou".
 *
 * Devolve SÓ código e nome. Nem quantidade vendida, nem valor: com 48 pessoas
 * divulgando, esta é a rota mais chamada do site, e quem abre a página de
 * compra não precisa saber o placar de ninguém.
 *
 * Cache de 5 minutos na borda da Vercel, com `stale-while-revalidate` de uma
 * hora. É o que separa 48 vendedores mandando link ao mesmo tempo de 48 idas
 * ao Redis por segundo: o cadastro muda uma vez por semana, no máximo, então
 * servir a cópia guardada é a resposta certa e não a preguiçosa. Um vendedor
 * recém-cadastrado demora até 5 minutos para aparecer na lista — e o link
 * pessoal dele já funciona desde o primeiro segundo, que é o que importa.
 */
export async function GET() {
  try {
    const vendedores = await listarVendedores();
    return NextResponse.json(
      {
        vendedores: vendedores
          .filter((v) => v.ativo)
          .map((v) => ({ codigo: v.codigo, nome: v.nome })),
      },
      {
        headers: {
          "Cache-Control":
            "public, s-maxage=300, stale-while-revalidate=3600",
        },
      }
    );
  } catch {
    /* Falhou o banco? Devolve lista vazia, não erro. O campo "quem te
       indicou" some e a compra continua possível — a venda vale mais que a
       atribuição dela. */
    return NextResponse.json(
      { vendedores: [] },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}
