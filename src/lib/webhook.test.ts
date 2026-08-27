/* =========================================================================
 *  Webhook do Mercado Pago contra o Upstash falso.
 *  O gateway é dublê (não queremos rede), mas o banco é o mesmo caminho de
 *  produção, com latência — que é onde as corridas aparecem.
 * ========================================================================= */

import { afterEach, describe, expect, it, vi } from "vitest";

import { iniciarUpstashFalso, type UpstashFalso } from "./teste/upstash-falso";
import type * as Store from "./store";
import type * as Webhook from "./webhook";

let servidor: UpstashFalso | null = null;

interface Dubles {
  /** `true`/`false` como antes; "indeterminado" = MP fora do ar. */
  aprovado: boolean | "indeterminado";
  assinaturaOk: boolean;
}

async function montar(dubles: Dubles) {
  const falso = await iniciarUpstashFalso({ latenciaMs: 6 });
  servidor = falso;
  process.env.UPSTASH_REDIS_REST_URL = falso.url;
  process.env.UPSTASH_REDIS_REST_TOKEN = falso.token;

  vi.resetModules();
  vi.doMock("./config", () => ({
    RIFA: { totalCotas: 1000, minutosPix: 30, precoCota: 15 },
    LIMITES: {
      pedidosPorIp: 10,
      pedidosPorCpf: 5,
      janelaMinutos: 10,
      pendentesPorCpf: 3,
    },
    brl: (v: number) => String(v),
    linkWhatsApp: (t: string) => t,
  }));
  vi.doMock("./pagamento", () => ({
    modoDemo: false,
    simulacaoLiberada: false,
    consultarPagamento: async () =>
      dubles.aprovado === "indeterminado"
        ? "indeterminado"
        : dubles.aprovado
          ? "aprovado"
          : "nao-aprovado",
    pagamentoAprovado: async () => dubles.aprovado === true,
    assinaturaValida: () => dubles.assinaturaOk,
  }));

  const store = (await import("./store")) as typeof Store;
  const webhook = (await import("./webhook")) as typeof Webhook;
  return { store, webhook, falso };
}

afterEach(async () => {
  await servidor?.fechar();
  servidor = null;
  vi.doUnmock("./config");
  vi.doUnmock("./pagamento");
  vi.resetModules();
});

async function criarPedido(
  store: typeof Store,
  id: string,
  cotas: number,
  minutos: number
): Promise<Store.Pedido> {
  const pedido: Store.Pedido = {
    id,
    nome: "Fulano de Tal",
    whatsapp: "15999998888",
    cpf: "52998224725",
    cotas,
    valor: cotas * 15,
    numeros: [], // números só saem na confirmação
    status: "pendente",
    criadoEm: Date.now(),
    expiraEm: Date.now() + minutos * 60_000,
    pagoEm: null,
    provedor: "mercadopago",
    idPagamento: `mp_${id}`,
    codigoPix: "000201",
    imagemQrCode: null,
    vendedor: null,
  };
  await store.salvarPedido(pedido);
  await store.indexarPedido(id);
  return pedido;
}

const notificar = (webhook: typeof Webhook, idPagamento: string) =>
  webhook.processarNotificacao({
    idPagamento,
    tipo: "payment",
    xSignature: "ts=1,v1=abc",
    xRequestId: "req-1",
  });

describe("webhook do Mercado Pago", () => {
  it("confirma o pedido quando o pagamento está aprovado", async () => {
    const { store, webhook } = await montar({
      aprovado: true,
      assinaturaOk: true,
    });
    await criarPedido(store, "OK1", 3, 30);

    const r = await notificar(webhook, "mp_OK1");

    expect(r).toEqual({ http: 200, desfecho: "confirmado" });
    expect(await store.cotasVendidas()).toBe(3);
  });

  it("reenvio da mesma notificação não conta a cota de novo", async () => {
    const { store, webhook } = await montar({
      aprovado: true,
      assinaturaOk: true,
    });
    await criarPedido(store, "OK2", 2, 30);

    await notificar(webhook, "mp_OK2");
    const segunda = await notificar(webhook, "mp_OK2");
    const terceira = await notificar(webhook, "mp_OK2");

    expect(segunda.desfecho).toBe("ja-confirmado");
    expect(terceira.desfecho).toBe("ja-confirmado");
    expect(await store.cotasVendidas()).toBe(2);
  });

  it("três notificações simultâneas contam a cota uma vez só", async () => {
    const { store, webhook } = await montar({
      aprovado: true,
      assinaturaOk: true,
    });
    await criarPedido(store, "OK3", 7, 30);

    const rs = await Promise.all([
      notificar(webhook, "mp_OK3"),
      notificar(webhook, "mp_OK3"),
      notificar(webhook, "mp_OK3"),
    ]);

    expect(await store.cotasVendidas()).toBe(7);
    expect(rs.filter((r) => r.desfecho === "confirmado")).toHaveLength(1);
  });

  it("Pix pago depois do prazo ainda é confirmado, não vira conflito", async () => {
    const { store, webhook } = await montar({
      aprovado: true,
      assinaturaOk: true,
    });
    const pedido = await criarPedido(store, "TARDE", 3, -1);
    await store.expirarPedido(pedido);
    expect((await store.buscarPedido("TARDE"))?.status).toBe("expirado");

    const r = await notificar(webhook, "mp_TARDE");

    // No modelo antigo isto virava conflito: os números do pedido já podiam
    // ser de outro comprador. Agora ninguém segurava número nenhum, então o
    // pagamento vale e o comprador recebe as cotas.
    expect(r.desfecho).toBe("confirmado");
    expect(await store.cotasVendidas()).toBe(3);
    expect((await store.buscarPedido("TARDE"))?.status).toBe("pago");
    expect(await store.listarConflitos()).toHaveLength(0);
  });

  it("pagamento sem cota sobrando vira conflito, nunca cota paga", async () => {
    const { store, webhook } = await montar({
      aprovado: true,
      assinaturaOk: true,
    });

    // Esgota a rifa (o mock de config usa 1000 cotas).
    const cheio = await criarPedido(store, "CHEIO", 1000, 30);
    await store.confirmarPagamento(cheio);
    expect((await store.resumo()).disponiveis).toBe(0);

    await criarPedido(store, "SEMCOTA", 2, 30);
    const r = await notificar(webhook, "mp_SEMCOTA");

    expect(r.desfecho).toBe("conflito");
    expect(await store.cotasVendidas()).toBe(1000); // não estourou
    expect((await store.buscarPedido("SEMCOTA"))?.status).toBe("reembolsar");

    const conflitos = await store.listarConflitos();
    expect(conflitos).toHaveLength(1);
    expect(conflitos[0].pagamento).toBe("mp_SEMCOTA");
  });

  it("trava órfã: responde 500 para o MP reenviar, nunca 200", async () => {
    const { store, webhook, falso } = await montar({
      aprovado: true,
      assinaturaOk: true,
    });
    await criarPedido(store, "ORFA", 3, 30);

    // Trava deixada por um processo que morreu antes de gravar o pedido pago.
    falso.semear("rifa:decisao:ORFA", "1");

    const r = await notificar(webhook, "mp_ORFA");

    // Antes: {http:200, desfecho:"ja-confirmado"} — o MP parava de reenviar
    // e o pagamento sumia. Agora o MP é obrigado a tentar de novo.
    expect(r).toEqual({ http: 500, desfecho: "indefinido" });
    expect(await store.cotasVendidas()).toBe(0);
    expect((await store.buscarPedido("ORFA"))?.status).toBe("pendente");
  });

  it("no reenvio, com a trava já vencida, o pagamento é confirmado", async () => {
    const { store, webhook, falso } = await montar({
      aprovado: true,
      assinaturaOk: true,
    });
    await criarPedido(store, "ORFA2", 5, 30);

    falso.semear("rifa:decisao:ORFA2", "1", 1); // vence em 1s
    const primeira = await notificar(webhook, "mp_ORFA2");
    expect(primeira.http).toBe(500);

    await new Promise((r) => setTimeout(r, 1100));
    const reenvio = await notificar(webhook, "mp_ORFA2");

    expect(reenvio).toEqual({ http: 200, desfecho: "confirmado" });
    expect(await store.cotasVendidas()).toBe(5);
  });

  it("assinatura inválida devolve 401 e não toca no pedido", async () => {
    const { store, webhook } = await montar({
      aprovado: true,
      assinaturaOk: false,
    });
    await criarPedido(store, "ASSIN", 2, 30);

    const r = await notificar(webhook, "mp_ASSIN");

    expect(r).toEqual({ http: 401, desfecho: "assinatura-invalida" });
    expect(await store.cotasVendidas()).toBe(0);
  });

  it("pagamento aprovado sem pedido correspondente entra na conciliação", async () => {
    const { store, webhook } = await montar({
      aprovado: true,
      assinaturaOk: true,
    });

    const r = await notificar(webhook, "mp_ORFAO");

    expect(r.desfecho).toBe("sem-pedido");
    const conflitos = await store.listarConflitos();
    expect(conflitos).toHaveLength(1);
    expect(conflitos[0].pagamento).toBe("mp_ORFAO");
  });

  it("pagamento ainda não aprovado não confirma nada", async () => {
    const { store, webhook } = await montar({
      aprovado: false,
      assinaturaOk: true,
    });
    await criarPedido(store, "PENDENTE", 2, 30);

    const r = await notificar(webhook, "mp_PENDENTE");

    expect(r.desfecho).toBe("nao-aprovado");
    expect(await store.cotasVendidas()).toBe(0);
  });

  it("Mercado Pago fora do ar devolve 500, nunca 200 'não aprovado'", async () => {
    const { store, webhook } = await montar({
      aprovado: "indeterminado",
      assinaturaOk: true,
    });
    await criarPedido(store, "APIFORA", 4, 30);

    const r = await notificar(webhook, "mp_APIFORA");

    /* O erro que este teste tranca: tratar "não consegui perguntar" como
       "não foi pago". O MP marcaria a notificação como entregue, pararia de
       reenviar, e um pagamento aprovado sumiria sem virar cota nem reembolso. */
    expect(r).toEqual({ http: 500, desfecho: "indefinido" });
    expect(await store.cotasVendidas()).toBe(0);
    expect((await store.buscarPedido("APIFORA"))?.status).toBe("pendente");
  });

  it("notificação que não é de pagamento é ignorada", async () => {
    const { webhook } = await montar({ aprovado: true, assinaturaOk: true });

    const r = await webhook.processarNotificacao({
      idPagamento: "123",
      tipo: "merchant_order",
      xSignature: "ts=1,v1=abc",
      xRequestId: "req",
    });

    expect(r.desfecho).toBe("ignorado");
  });
});
