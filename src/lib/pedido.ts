/* =========================================================================
 *  Ponte entre o pedido guardado no banco e o que a interface consome.
 *  A lógica é a mesma usada pela API e pela página de pagamento — fica aqui
 *  para as duas nunca saírem de sincronia.
 * ========================================================================= */

import { pagamentoAprovado, simulacaoLiberada } from "./pagamento";
import {
  confirmarPagamento,
  expirarPedido,
  formatarNumero,
  type Pedido,
  type StatusPedido,
} from "./store";

/** Pedido no formato que a interface consome (números já formatados). */
export interface PedidoView {
  id: string;
  status: StatusPedido;
  nome: string;
  cotas: number;
  valor: number;
  /** Vazio enquanto o pagamento não é confirmado — números só saem pagos. */
  numeros: string[];
  expiraEm: number;
  pagoEm: number | null;
  codigoPix: string | null;
  imagemQrCode: string | null;
  demonstracao: boolean;
  /** O botão de confirmar sem pagar está de fato disponível neste ambiente. */
  podeSimular: boolean;
}

/**
 * Resolve o estado real de um pedido.
 *
 * A ordem importa e é esta: PRIMEIRO pergunta ao gateway se o Pix caiu, só
 * depois cogita expirar. E o gateway é consultado inclusive para pedido já
 * marcado como expirado, porque `expirado` não é ponto final: como nenhum
 * número ficou preso durante a espera, um Pix pago no limite ainda vira
 * compra válida enquanto houver cota. Quem paga não perde o que pagou.
 *
 * O único desfecho ruim é a rifa ter esgotado no intervalo. Aí
 * `confirmarPagamento` devolve `semCotas` e o pedido vai para a fila de
 * reembolso do organizador — nunca vira cota vendida.
 */
export async function sincronizarPedido(pedido: Pedido): Promise<Pedido> {
  if (pedido.status === "pago" || pedido.status === "reembolsar") return pedido;

  if (pedido.idPagamento && (await pagamentoAprovado(pedido.idPagamento))) {
    const resultado = await confirmarPagamento(pedido);
    return resultado.pedido;
  }

  if (pedido.status === "pendente" && Date.now() > pedido.expiraEm) {
    return expirarPedido(pedido);
  }

  return pedido;
}

/** Converte o pedido para a visão pública (sem CPF, sem WhatsApp). */
export function paraVisao(pedido: Pedido): PedidoView {
  const aberto = pedido.status === "pendente";
  return {
    id: pedido.id,
    status: pedido.status,
    nome: pedido.nome,
    cotas: pedido.cotas,
    valor: pedido.valor,
    numeros: pedido.numeros.map(formatarNumero),
    expiraEm: pedido.expiraEm,
    pagoEm: pedido.pagoEm,
    // Código Pix só faz sentido enquanto a cobrança está aberta.
    codigoPix: aberto ? pedido.codigoPix : null,
    imagemQrCode: aberto ? pedido.imagemQrCode : null,
    demonstracao: pedido.provedor === "demonstracao",
    podeSimular: pedido.provedor === "demonstracao" && simulacaoLiberada,
  };
}
