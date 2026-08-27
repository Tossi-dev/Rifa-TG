import { NextResponse } from "next/server";

import { buscarVendedor } from "@/lib/store";
import { codigoValido } from "@/lib/vendedores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 60 dias: a rifa inteira cabe dentro do prazo do cookie. */
const DIAS = 60 * 24 * 60 * 60;

/* O nome do cookie é literal aqui e no seletor do checkout de propósito:
   arquivo de rota do App Router só aceita exports que o Next conhece, e um
   `export const` a mais quebra o build inteiro com erro de tipo. */
const COOKIE_VENDEDOR = "rifa_vendedor";

/**
 * Link pessoal do vendedor: `/v/joao-silva`.
 *
 * É rota, e não página, por um motivo prático: só route handler e server
 * action podem gravar cookie no App Router. Aqui a marca é gravada e o
 * visitante segue para a home normal — a URL bonita fica na mão de quem
 * compartilha, e quem recebe vê o site de sempre.
 *
 * O código NÃO fica na URL depois do redirecionamento de propósito: quem
 * copia o endereço da barra para mandar ao primo não leva o crédito de venda
 * de outra pessoa junto sem perceber.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ codigo: string }> }
) {
  const { codigo } = await ctx.params;
  const limpo = decodeURIComponent(codigo ?? "").toLowerCase();

  const destino = new URL("/", process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000");
  const resposta = NextResponse.redirect(destino, 307);

  /* Código inválido ou desativado leva para a home sem marca nenhuma, e sem
     mensagem de erro. Quem clicou é um comprador: ele não tem nada a ver com
     link errado, e uma tela de erro aqui perderia a venda. */
  if (!codigoValido(limpo)) return resposta;

  const vendedor = await buscarVendedor(limpo).catch(() => null);
  if (!vendedor?.ativo) return resposta;

  resposta.cookies.set(COOKIE_VENDEDOR, vendedor.codigo, {
    maxAge: DIAS,
    path: "/",
    sameSite: "lax",
    httpOnly: false, // o formulário de compra lê no navegador
    secure: process.env.NODE_ENV === "production",
  });
  return resposta;
}
