import { NextResponse } from "next/server";

import { simulacaoLiberada } from "@/lib/pagamento";
import { buscarPedido, confirmarPagamento } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Confirma um pagamento manualmente. Só funciona em MODO DEMONSTRAÇÃO
 * (quando não há MP_ACCESS_TOKEN configurado), para testar o fluxo inteiro
 * sem precisar de uma conta de pagamento.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  /* Fechada em produção, mesmo em modo demonstração: sem esta trava, subir o
     site antes de cadastrar o MP_ACCESS_TOKEN entregaria a rifa inteira de
     graça a quem chamasse esta rota. */
  if (!simulacaoLiberada) {
    return NextResponse.json({ erro: "Indisponível." }, { status: 403 });
  }

  const { id } = await params;
  const pedido = await buscarPedido(id);
  if (!pedido) {
    return NextResponse.json({ erro: "Pedido não encontrado." }, { status: 404 });
  }
  /* Passa pelo mesmo caminho de um pagamento real, inclusive quando o Pix já
     venceu: como nenhum número ficava preso, pagar fora do prazo continua
     valendo enquanto houver cota. O único "não" possível é a rifa ter
     esgotado — e aí o pedido entra na fila de reembolso. */
  const resultado = await confirmarPagamento(pedido);
  if (resultado.semCotas) {
    return NextResponse.json(
      { erro: "As cotas se esgotaram: este pagamento entrou para reembolso." },
      { status: 409 }
    );
  }
  if (resultado.indefinido) {
    // Nunca responder "ok" sem desfecho: quem chamou precisa tentar de novo.
    return NextResponse.json(
      { erro: "Confirmação em andamento. Tente de novo em instantes." },
      { status: 503 }
    );
  }
  return NextResponse.json({ ok: true });
}
