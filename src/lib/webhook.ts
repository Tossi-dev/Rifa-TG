/* =========================================================================
 *  Regra do webhook do Mercado Pago, separada da rota HTTP para poder ser
 *  testada sem subir servidor.
 *
 *  Princípios:
 *   - o corpo da notificação nunca é verdade: o pagamento é consultado na API
 *   - assinatura HMAC conferida (com janela de tempo, contra replay)
 *   - pagamento aprovado que não tem cota para receber NUNCA é confirmado e
 *     NUNCA é ignorado em silêncio: vira conflito de conciliação (reembolso)
 * ========================================================================= */

import { assinaturaValida, consultarPagamento } from "./pagamento";
import {
  buscarPedidoPorPagamento,
  confirmarPagamento,
  registrarConflito,
  registrarConflitoDePagamento,
} from "./store";

export type DesfechoWebhook =
  | "ignorado"
  | "assinatura-invalida"
  | "nao-aprovado"
  | "sem-pedido"
  | "ja-confirmado"
  | "conflito"
  | "confirmado"
  /** Não deu para decidir agora: precisamos que o MP reenvie (HTTP 500). */
  | "indefinido";

export interface ResultadoWebhook {
  http: number;
  desfecho: DesfechoWebhook;
}

export async function processarNotificacao(entrada: {
  idPagamento: string | null;
  tipo: string | null;
  xSignature: string | null;
  xRequestId: string | null;
}): Promise<ResultadoWebhook> {
  const { idPagamento, tipo } = entrada;

  if (!idPagamento) return { http: 200, desfecho: "ignorado" };
  if (tipo && !String(tipo).includes("payment")) {
    return { http: 200, desfecho: "ignorado" };
  }

  const valida = assinaturaValida({
    xSignature: entrada.xSignature,
    xRequestId: entrada.xRequestId,
    dataId: idPagamento,
  });
  if (!valida) return { http: 401, desfecho: "assinatura-invalida" };

  /* `forcar` porque a notificação é um evento real: vale furar o cache.
     E os três casos são tratados separadamente de propósito: se a API do
     Mercado Pago estiver fora do ar, responder 200 "não aprovado" faria o MP
     parar de reenviar e o pagamento sumiria. Incerteza vira 500. */
  const situacao = await consultarPagamento(idPagamento, { forcar: true });
  if (situacao === "indeterminado") {
    return { http: 500, desfecho: "indefinido" };
  }
  if (situacao === "nao-aprovado") {
    return { http: 200, desfecho: "nao-aprovado" };
  }

  const pedido = await buscarPedidoPorPagamento(idPagamento);
  if (!pedido) {
    // Dinheiro entrou sem pedido correspondente: alguém precisa olhar.
    await registrarConflitoDePagamento(
      idPagamento,
      "pagamento aprovado sem pedido correspondente"
    );
    return { http: 200, desfecho: "sem-pedido" };
  }

  if (pedido.status === "pago") {
    return { http: 200, desfecho: "ja-confirmado" };
  }

  if (pedido.status === "reembolsar") {
    // Já registrado como dinheiro a devolver: nada a confirmar, e o conflito
    // já está na fila (a gravação é deduplicada por pedido).
    await registrarConflito(pedido, "pagamento confirmado sem cota disponível");
    return { http: 200, desfecho: "conflito" };
  }

  /* Pendente OU expirado. Pix vencido NÃO é motivo para recusar: como o
     pedido nunca segurou número, pagar no limite continua valendo enquanto
     houver cota. É `confirmarPagamento` que decide, de forma atômica. */
  const resultado = await confirmarPagamento(pedido);
  if (resultado.semCotas) return { http: 200, desfecho: "conflito" };
  if (resultado.confirmou) return { http: 200, desfecho: "confirmado" };

  /* Sem desfecho: alguém está com a trava (ou ela ficou órfã de um processo
     que morreu). Responder 200 aqui era o pior bug possível — o MP marcava
     como entregue, parava de reenviar, e o pagamento sumia sem aparecer em
     lugar nenhum. 500 faz o MP reenviar; na próxima tentativa a trava já
     venceu (TTL). */
  if (resultado.indefinido) return { http: 500, desfecho: "indefinido" };

  return { http: 200, desfecho: "ja-confirmado" };
}
