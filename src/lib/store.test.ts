/* =========================================================================
 *  Testes do que envolve dinheiro, contra um Upstash REST FALSO com latência
 *  artificial. Sem latência (e sem concorrência de verdade) esses defeitos
 *  não aparecem — foi exatamente assim que eles chegaram até produção.
 *
 *  O modelo mudou: número só é atribuído na confirmação do pagamento. Por
 *  isso o ponto crítico deixou de ser "dois compradores reservando" e passou a
 *  ser "dois PAGAMENTOS disputando as últimas cotas".
 * ========================================================================= */

import { afterEach, describe, expect, it, vi } from "vitest";

import { iniciarUpstashFalso, type UpstashFalso } from "./teste/upstash-falso";
import type * as Store from "./store";

let servidor: UpstashFalso | null = null;

/** Sobe um Redis falso novo e recarrega o store apontando para ele. */
async function montarRifa(
  totalCotas: number,
  latenciaMs = 8
): Promise<{ store: typeof Store; falso: UpstashFalso }> {
  const falso = await iniciarUpstashFalso({ latenciaMs });
  servidor = falso;
  process.env.UPSTASH_REDIS_REST_URL = falso.url;
  process.env.UPSTASH_REDIS_REST_TOKEN = falso.token;

  vi.resetModules();
  vi.doMock("./config", () => ({
    RIFA: { totalCotas, minutosPix: 30, precoCota: 15 },
    LIMITES: {
      pedidosPorIp: 10,
      pedidosPorCpf: 5,
      janelaMinutos: 10,
      pendentesPorCpf: 3,
    },
    brl: (v: number) => String(v),
    linkWhatsApp: (t: string) => t,
  }));

  const store = (await import("./store")) as typeof Store;
  return { store, falso };
}

afterEach(async () => {
  await servidor?.fechar();
  servidor = null;
  vi.doUnmock("./config");
  vi.resetModules();
});

function novoPedido(
  id: string,
  cotas: number,
  expiraEm: number,
  cpf = "52998224725"
): Store.Pedido {
  return {
    id,
    nome: "Fulano de Tal",
    whatsapp: "15999998888",
    cpf,
    cotas,
    valor: cotas * 15,
    numeros: [], // nasce vazio: número só sai com pagamento confirmado
    status: "pendente",
    criadoEm: Date.now(),
    expiraEm,
    pagoEm: null,
    provedor: "demonstracao",
    idPagamento: `demo_${id}`,
    codigoPix: "000201",
    imagemQrCode: null,
  vendedor: null,
  };
}

/** Cria a cobrança, como faz a rota POST /api/pedidos. */
async function cobrar(
  store: typeof Store,
  id: string,
  cotas: number,
  minutos = 30,
  cpf?: string
): Promise<Store.Pedido> {
  const pedido = novoPedido(id, cotas, Date.now() + minutos * 60_000, cpf);
  await store.salvarPedido(pedido);
  await store.indexarPedido(id);
  await store.reservarVagaPendente(pedido.cpf, pedido.id, pedido.expiraEm, 99);
  return pedido;
}

/* ===================================================================== */

describe("cobrança aberta não consome cota", () => {
  it("dez carrinhos abandonados não tiram um único número da rifa", async () => {
    const { store } = await montarRifa(100);

    for (let i = 0; i < 10; i++) {
      await cobrar(store, `ABANDONADO${i}`, 10, -5); // já vencidos
    }

    const antes = await store.resumo();
    expect(antes.vendidas).toBe(0);
    expect(antes.disponiveis).toBe(100);

    // Expirar todos também não muda nada: não havia nada preso.
    for (let i = 0; i < 10; i++) {
      const p = await store.buscarPedido(`ABANDONADO${i}`);
      await store.expirarPedido(p!);
    }

    const depois = await store.resumo();
    expect(depois.vendidas).toBe(0);
    expect(depois.disponiveis).toBe(100);
  });
});

describe("atribuição de números", () => {
  it("só acontece na confirmação, e o pedido pendente fica sem números", async () => {
    const { store } = await montarRifa(100);
    const pedido = await cobrar(store, "PEDIDO1", 3);

    expect((await store.buscarPedido("PEDIDO1"))!.numeros).toEqual([]);

    const r = await store.confirmarPagamento(pedido);
    expect(r.confirmou).toBe(true);
    expect(r.pedido.status).toBe("pago");
    expect(r.pedido.numeros).toEqual([1, 2, 3]);
    expect(await store.cotasVendidas()).toBe(3);
  });

  it("nunca entrega o mesmo número a dois pagamentos simultâneos", async () => {
    const { store } = await montarRifa(1000, 6);

    const pedidos = await Promise.all(
      Array.from({ length: 40 }, (_, i) =>
        cobrar(store, `P${i}`, 5, 30, `cpf${i}`)
      )
    );

    const resultados = await Promise.all(
      pedidos.map((p) => store.confirmarPagamento(p))
    );

    const todos = resultados.flatMap((r) => r.pedido.numeros);
    expect(todos).toHaveLength(200);
    expect(new Set(todos).size).toBe(200); // zero repetido
    expect(await store.cotasVendidas()).toBe(200);
  });
});

describe("confirmação idempotente", () => {
  it("duas confirmações simultâneas do mesmo pedido atribuem uma vez só", async () => {
    const { store } = await montarRifa(100);
    const pedido = await cobrar(store, "DUPLO", 4);

    const [a, b] = await Promise.all([
      store.confirmarPagamento(pedido),
      store.confirmarPagamento(pedido),
    ]);

    // Exatamente uma confirmou; a outra é eco (nunca "indefinido" aqui,
    // porque o vencedor grava o desfecho antes da espera acabar).
    expect([a.confirmou, b.confirmou].filter(Boolean)).toHaveLength(1);
    expect(a.pedido.numeros).toEqual(b.pedido.numeros);
    expect(await store.cotasVendidas()).toBe(4);
  });

  it("webhook reenviado depois do pedido pago não conta de novo", async () => {
    const { store } = await montarRifa(100);
    const pedido = await cobrar(store, "REENVIO", 6);

    await store.confirmarPagamento(pedido);
    const salvo = await store.buscarPedido("REENVIO");

    // O Mercado Pago reenvia a MESMA notificação: o pedido já está pago.
    const eco = await store.confirmarPagamento(salvo!);
    expect(eco.confirmou).toBe(false);
    expect(eco.indefinido).toBe(false);
    expect(await store.cotasVendidas()).toBe(6);
  });
});

describe("últimas cotas disputadas por dois pagamentos", () => {
  it("um leva os números e o outro entra para reembolso — nunca vende além do total", async () => {
    const { store } = await montarRifa(10);

    const a = await cobrar(store, "A", 6, 30, "52998224725");
    const b = await cobrar(store, "B", 6, 30, "11144477735");

    const [ra, rb] = await Promise.all([
      store.confirmarPagamento(a),
      store.confirmarPagamento(b),
    ]);

    const ganhou = [ra, rb].filter((r) => r.confirmou);
    const perdeu = [ra, rb].filter((r) => r.semCotas);

    expect(ganhou).toHaveLength(1);
    expect(perdeu).toHaveLength(1);
    expect(ganhou[0].pedido.numeros).toHaveLength(6);
    expect(perdeu[0].pedido.status).toBe("reembolsar");
    expect(perdeu[0].pedido.numeros).toEqual([]);

    // O total vendido não estoura, e a cota não entregue continua livre.
    expect(await store.cotasVendidas()).toBe(6);
    expect((await store.resumo()).disponiveis).toBe(4);

    // E o dinheiro a devolver está registrado, uma vez só.
    const conflitos = await store.listarConflitos();
    expect(conflitos).toHaveLength(1);
    expect(conflitos[0].pedido).toBe(perdeu[0].pedido.id);
    expect(conflitos[0].valor).toBe(90);
  });

  it("não registra o mesmo reembolso duas vezes se o webhook reenviar", async () => {
    const { store } = await montarRifa(4);

    const a = await cobrar(store, "CHEIO", 4, 30, "52998224725");
    await store.confirmarPagamento(a);

    const b = await cobrar(store, "TARDE", 2, 30, "11144477735");
    const primeira = await store.confirmarPagamento(b);
    expect(primeira.semCotas).toBe(true);

    const salvo = await store.buscarPedido("TARDE");
    const segunda = await store.confirmarPagamento(salvo!);
    expect(segunda.semCotas).toBe(true);
    expect(segunda.confirmou).toBe(false);

    expect(await store.listarConflitos()).toHaveLength(1);
  });
});

describe("pagamento atrasado", () => {
  it("Pix pago depois do prazo ainda vira compra válida", async () => {
    const { store } = await montarRifa(100);

    // Cobrança já vencida e marcada como expirada, como faria a tela.
    const pedido = await cobrar(store, "ATRASADO", 5, -1);
    const expirado = await store.expirarPedido(pedido);
    expect(expirado.status).toBe("expirado");

    // O dinheiro cai depois. Como nada ficou preso, não há motivo para recusar.
    const r = await store.confirmarPagamento(expirado);
    expect(r.confirmou).toBe(true);
    expect(r.pedido.status).toBe("pago");
    expect(r.pedido.numeros).toHaveLength(5);
    expect(await store.cotasVendidas()).toBe(5);
    expect(await store.listarConflitos()).toHaveLength(0);
  });

  it("expirar e confirmar ao mesmo tempo não perde o pagamento", async () => {
    const { store } = await montarRifa(100);
    const pedido = await cobrar(store, "CORRIDA", 3, -1);

    const [, confirmacao] = await Promise.all([
      store.expirarPedido(pedido),
      store.confirmarPagamento(pedido),
    ]);

    // Ou confirmou de primeira, ou avisou que não deu para decidir — o que o
    // webhook traduz em 500 para o Mercado Pago reenviar. O proibido é
    // responder "ok" sem ter confirmado.
    expect(confirmacao.confirmou || confirmacao.indefinido).toBe(true);

    if (confirmacao.indefinido) {
      const salvo = await store.buscarPedido("CORRIDA");
      const segunda = await store.confirmarPagamento(salvo!);
      expect(segunda.confirmou).toBe(true);
    }

    const final = await store.buscarPedido("CORRIDA");
    expect(final!.status).toBe("pago");
    expect(final!.numeros).toHaveLength(3);
  });
});

describe("trava órfã", () => {
  it("não devolve sucesso enquanto a decisão está presa com outro", async () => {
    const { store, falso } = await montarRifa(100);
    const pedido = await cobrar(store, "TRAVADO", 2);

    // Simula um processo que morreu segurando a trava.
    falso.semear("rifa:decisao:TRAVADO", "1", 60);

    const r = await store.confirmarPagamento(pedido);
    expect(r.confirmou).toBe(false);
    expect(r.indefinido).toBe(true); // webhook devolve 500 e o MP reenvia
    expect(await store.cotasVendidas()).toBe(0);

    // Quando a trava vence, a tentativa seguinte resolve normalmente.
    falso.banco.delete("rifa:decisao:TRAVADO");
    const segunda = await store.confirmarPagamento(pedido);
    expect(segunda.confirmou).toBe(true);
    expect(await store.cotasVendidas()).toBe(2);
  });
});

describe("índice do sorteio", () => {
  it("acha o dono do número sorteado", async () => {
    const { store } = await montarRifa(100);

    const a = await cobrar(store, "AAA", 3, 30, "52998224725");
    const b = await cobrar(store, "BBB", 2, 30, "11144477735");
    await store.confirmarPagamento(a);
    await store.confirmarPagamento(b);

    expect((await store.pedidoDoNumero(1))!.id).toBe("AAA");
    expect((await store.pedidoDoNumero(3))!.id).toBe("AAA");
    expect((await store.pedidoDoNumero(4))!.id).toBe("BBB");
  });

  it("não aponta ganhador para número não vendido nem fora da faixa", async () => {
    const { store } = await montarRifa(100);
    const a = await cobrar(store, "AAA", 2);
    await store.confirmarPagamento(a);

    expect(await store.pedidoDoNumero(3)).toBeNull(); // não vendido
    expect(await store.pedidoDoNumero(0)).toBeNull();
    expect(await store.pedidoDoNumero(101)).toBeNull();
    expect(await store.pedidoDoNumero(1.5)).toBeNull();
  });

  it("ignora sobra de índice que aponte para pedido não pago", async () => {
    const { store, falso } = await montarRifa(100);
    await cobrar(store, "NAOPAGO", 1);

    // Entrada órfã, como sobraria de um estorno no meio do caminho.
    falso.banco.set("rifa:numeros", {
      tipo: "hash",
      campos: new Map([["7", "NAOPAGO"]]),
    });

    expect(await store.pedidoDoNumero(7)).toBeNull();
  });
});

/* =========================================================================
 *  Falhas do banco no meio do caminho.
 *
 *  Estes testes existem porque um dublê que nunca cai esconde exatamente a
 *  classe de defeito que custa dinheiro: a compensação errada. Cada um deles
 *  reprovava a versão anterior deste arquivo.
 * ========================================================================= */

describe("banco caindo no meio da confirmação", () => {
  it("gravação que VALEU mas respondeu erro não devolve os números à rifa", async () => {
    const { store, falso } = await montarRifa(100);
    const a = await cobrar(store, "GRAVOU", 3, 30, "52998224725");

    // O `SET rifa:pedido:GRAVOU` executa e só depois responde 500 — o caso da
    // resposta perdida, indistinguível de "não gravou" para quem chamou.
    falso.sabotar((args) =>
      args[0] === "SET" && args[1] === "rifa:pedido:GRAVOU"
        ? { status: 500, executar: true }
        : null
    );
    const r = await store.confirmarPagamento(a);
    falso.sabotar(null);

    /* O pedido FICOU pago: o comprador já vê os números na tela. Devolver
       esses números para a rifa aqui é venda dupla — outro comprador levaria
       os mesmos números. */
    expect((await store.buscarPedido("GRAVOU"))!.status).toBe("pago");
    expect(r.confirmou).toBe(true);
    expect(falso.lista("rifa:livres")).toHaveLength(0);
    expect(await store.cotasVendidas()).toBe(3);

    // E o comprador seguinte recebe números diferentes.
    const b = await cobrar(store, "SEGUINTE", 3, 30, "11144477735");
    const rb = await store.confirmarPagamento(b);
    expect(rb.pedido.numeros).toEqual([4, 5, 6]);

    /* A compra deu certo, então a vaga de cobrança aberta deste CPF tem que
       ser devolvida — senão quem acabou de pagar ouve "você já tem cobranças
       aguardando pagamento" na compra seguinte. */
    expect(await store.pendentesDoCpf("52998224725")).toBe(0);
  });

  it("gravação que NÃO valeu devolve os números e a próxima tentativa resolve", async () => {
    const { store, falso } = await montarRifa(100);
    const a = await cobrar(store, "FALHOU", 3);

    falso.sabotar((args) =>
      args[0] === "SET" && args[1] === "rifa:pedido:FALHOU" ? 500 : null
    );
    const r = await store.confirmarPagamento(a);
    falso.sabotar(null);

    expect(r.confirmou).toBe(false);
    expect(r.indefinido).toBe(true); // webhook devolve 500, o MP reenvia
    expect((await store.buscarPedido("FALHOU"))!.status).toBe("pendente");
    // Os números voltaram: nada ficou preso e a contagem não inflou.
    expect(await store.cotasVendidas()).toBe(0);

    const segunda = await store.confirmarPagamento(a);
    expect(segunda.confirmou).toBe(true);
    expect(await store.cotasVendidas()).toBe(3);
  });

  it("falha ao reservar no contador não deixa cota fantasma", async () => {
    const { store, falso } = await montarRifa(10);

    // Devolve 2 números à rifa para exercitar também o caminho dos reciclados.
    await store.liberarNumeros([3, 4]);
    const antes = await store.cotasVendidas();

    const a = await cobrar(store, "CONTADOR", 5);
    falso.sabotar((args) => (args[0] === "EVAL" ? 500 : null));
    const r = await store.confirmarPagamento(a);
    falso.sabotar(null);

    expect(r.indefinido).toBe(true);
    // O contador não pode ter subido, e os reciclados têm que ter voltado.
    expect(await store.cotasVendidas()).toBe(antes);
    expect(falso.lista("rifa:livres").sort()).toEqual(["3", "4"]);
  });
});

describe("fila de conflitos não perde aviso", () => {
  it("marca de deduplicação não sobrevive a uma gravação que falhou", async () => {
    const { store, falso } = await montarRifa(4);

    const cheio = await cobrar(store, "CHEIO", 4, 30, "52998224725");
    await store.confirmarPagamento(cheio);

    // O RPUSH da linha falha, mas a marca "já avisei" é gravada antes dele.
    const tarde = await cobrar(store, "TARDE", 2, 30, "11144477735");
    falso.sabotar((args) =>
      args[0] === "RPUSH" && args[1] === "rifa:conflitos" ? 500 : null
    );
    await store.confirmarPagamento(tarde);
    falso.sabotar(null);

    expect((await store.buscarPedido("TARDE"))!.status).toBe("reembolsar");

    /* Se a marca tivesse ficado, este segundo aviso sairia calado e o
       organizador nunca saberia que precisa devolver R$ 30. */
    const salvo = await store.buscarPedido("TARDE");
    await store.registrarConflito(salvo!, "segunda tentativa", "reembolso");
    const conflitos = await store.listarConflitos();
    expect(conflitos).toHaveLength(1);
    expect(conflitos[0].pedido).toBe("TARDE");
  });

  it("aviso de conferência não engole o aviso de reembolso do mesmo pedido", async () => {
    const { store } = await montarRifa(100);
    const p = await cobrar(store, "DOISAVISOS", 2);

    await store.registrarConflito(p, "confirmação interrompida", "compensacao");
    await store.registrarConflito(p, "reembolsar", "reembolso");

    /* Ações opostas — "confira se ficou pago" e "devolva o dinheiro" — não
       podem competir pela mesma chave de deduplicação. */
    const conflitos = await store.listarConflitos();
    expect(conflitos).toHaveLength(2);
    expect(conflitos.map((c) => c.motivo)).toContain("reembolsar");
  });
});

describe("reembolso que não consegue ser gravado", () => {
  it("solta a trava para a retentativa do Mercado Pago resolver", async () => {
    const { store, falso } = await montarRifa(4);

    const cheio = await cobrar(store, "LOTADO", 4, 30, "52998224725");
    await store.confirmarPagamento(cheio);

    const tarde = await cobrar(store, "SEMSORTE", 2, 30, "11144477735");
    falso.sabotar((args) =>
      args[0] === "SET" && args[1] === "rifa:pedido:SEMSORTE" ? 500 : null
    );
    const primeira = await store.confirmarPagamento(tarde);
    falso.sabotar(null);

    // Nada foi decidido: quem chamou tem que insistir, e a porta não pode
    // ficar trancada por 60s enquanto o pagamento segue sem registro.
    expect(primeira.indefinido).toBe(true);
    expect((await store.buscarPedido("SEMSORTE"))!.status).toBe("pendente");

    const segunda = await store.confirmarPagamento(tarde);
    expect(segunda.semCotas).toBe(true);
    expect((await store.buscarPedido("SEMSORTE"))!.status).toBe("reembolsar");
    expect(await store.listarConflitos()).toHaveLength(1);
  });
});

describe("contador nunca fica inflado", () => {
  it("pedido que não cabe não faz um pedido que cabe ser recusado", async () => {
    const { store } = await montarRifa(10);

    // Vende 8, sobram 2.
    const base = await cobrar(store, "BASE", 8, 30, "52998224725");
    await store.confirmarPagamento(base);

    const grande = await cobrar(store, "GRANDE", 3, 30, "11144477735");
    const certo = await cobrar(store, "CERTO", 2, 30, "12345678909");

    /* GRANDE (3) não cabe; CERTO (2) cabe exatamente. Com INCRBY + DECRBY, o
       contador ficava inflado durante a viagem de rede do rollback e CERTO —
       que pagou e tinha cota — era mandado para reembolso junto. */
    const [rg, rc] = await Promise.all([
      store.confirmarPagamento(grande),
      store.confirmarPagamento(certo),
    ]);

    expect(rg.semCotas).toBe(true);
    expect(rc.confirmou).toBe(true);
    expect(rc.pedido.numeros).toEqual([9, 10]);
    expect(await store.cotasVendidas()).toBe(10);
    expect((await store.resumo()).disponiveis).toBe(0);
  });
});

describe("resumo", () => {
  it("vendidas vem do mesmo contador que atribui — não há segunda fonte", async () => {
    const { store } = await montarRifa(50);

    for (let i = 0; i < 5; i++) {
      const p = await cobrar(store, `V${i}`, 4, 30, `cpf${i}`);
      await store.confirmarPagamento(p);
    }

    const r = await store.resumo();
    expect(r.vendidas).toBe(20);
    expect(r.disponiveis).toBe(30);
    expect(r.percentual).toBe(40);
    expect(r.total).toBe(50);
  });

  it("números devolvidos por estorno voltam a ficar disponíveis", async () => {
    const { store } = await montarRifa(20);
    const p = await cobrar(store, "ESTORNO", 5);
    await store.confirmarPagamento(p);
    expect(await store.cotasVendidas()).toBe(5);

    await store.liberarNumeros([1, 2, 3, 4, 5]);
    expect(await store.cotasVendidas()).toBe(0);
    expect((await store.resumo()).disponiveis).toBe(20);
  });
});
