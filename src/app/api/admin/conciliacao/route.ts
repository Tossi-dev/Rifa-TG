import { NextResponse } from "next/server";

import { barrarSeNaoForAdmin } from "@/lib/admin";
import { conciliacaoEmCsv, montarConciliacao } from "@/lib/conciliacao";
import { montarPainel } from "@/lib/painel";
import { listarVendedores } from "@/lib/store";
import { rankingVendedores, vendaDireta } from "@/lib/vendedores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Painel de conciliação do organizador.
 *
 * Lista pedidos pagos, aguardando pagamento, expirados e os que precisam de
 * reembolso (dinheiro que entrou sem cota para entregar). `?formato=csv` baixa
 * a planilha usada para conferir o caixa e fazer o sorteio.
 */
export async function GET(req: Request) {
  const recusa = await barrarSeNaoForAdmin(req);
  if (recusa) return recusa;

  const dados = await montarConciliacao(1000);
  /* O ranking é derivado dos pedidos pagos que já estão em mãos — não existe
     contador por vendedor no banco. Mesma regra do total de cotas: número que
     se calcula do fato não diverge do fato, e um estorno não deixa comissão
     fantasma para trás. */
  const cadastro = await listarVendedores().catch(() => []);

  if (new URL(req.url).searchParams.get("formato") === "csv") {
    return new NextResponse(conciliacaoEmCsv(dados), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="conciliacao-rifa.csv"',
        "Cache-Control": "no-store",
      },
    });
  }

  /* Os indicadores e as séries são calculados no servidor, junto da
     conciliação: a tela não recalcula nada, então não existe a chance de o
     painel mostrar um número e o CSV outro.

     `pendentes` e `expirados` ficam FORA da resposta: são nome e WhatsApp de
     todo mundo que abandonou a compra, a tela não usa nenhum dos dois, e dado
     pessoal que só existe para trafegar é dado pessoal esperando vazar. Quem
     precisa deles é o CSV, que é montado aqui no servidor. */
  const painel = montarPainel(dados);
  return NextResponse.json(
    {
      gerado: dados.gerado,
      resumo: dados.resumo,
      totais: dados.totais,
      pagos: dados.pagos,
      reembolsar: dados.reembolsar,
      conflitos: dados.conflitos,
      painel,
      vendedores: rankingVendedores(cadastro, dados.pagos),
      vendaDireta: vendaDireta(dados.pagos),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
