/* =========================================================================
 *  A rota de criação de pedido inteira, contra o Upstash falso.
 *
 *  A rota NÃO atribui números — ela só abre a cobrança. Por isso o foco aqui
 *  é duplo: nenhuma cota pode ser consumida ao criar o pedido, e os caminhos
 *  que não viram pedido têm que devolver as vagas (janela deslizante e
 *  pendentes do CPF).
 * ========================================================================= */

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  iniciarUpstashFalso,
  type UpstashFalso,
} from "@/lib/teste/upstash-falso";
import type * as Store from "@/lib/store";

let servidor: UpstashFalso | null = null;

const CPF = "52998224725";

async function montarRota(opcoes: { pixFalha: boolean }) {
  const falso = await iniciarUpstashFalso({ latenciaMs: 5 });
  servidor = falso;
  process.env.UPSTASH_REDIS_REST_URL = falso.url;
  process.env.UPSTASH_REDIS_REST_TOKEN = falso.token;

  vi.resetModules();
  vi.doMock("@/lib/config", () => ({
    RIFA: {
      totalCotas: 1000,
      minutosPix: 30,
      precoCota: 15,
      minCotas: 1,
      maxCotasPorCompra: 50,
      titulo: "Rifa de teste",
      organizador: "TG",
      cidade: "Itarare - SP",
    },
    LIMITES: {
      pedidosPorIp: 120,
      pedidosPorCpf: 5,
      janelaMinutos: 10,
      pendentesPorCpf: 3,
    },
    brl: (v: number) => String(v),
    linkWhatsApp: (t: string) => t,
  }));
  vi.doMock("@/lib/pagamento", () => ({
    modoDemo: true,
    criarCobrancaPix: async () => {
      if (opcoes.pixFalha) throw new Error("gateway fora do ar");
      return {
        provedor: "demonstracao",
        idPagamento: "demo_x",
        codigoPix: "000201",
        imagemQrCode: null,
    vendedor: null,
      };
    },
    pagamentoAprovado: async () => false,
    assinaturaValida: () => true,
  }));

  const rota = await import("./route");
  const store = (await import("@/lib/store")) as typeof Store;
  return { rota, store, falso };
}

afterEach(async () => {
  await servidor?.fechar();
  servidor = null;
  vi.doUnmock("@/lib/config");
  vi.doUnmock("@/lib/pagamento");
  vi.resetModules();
});

const pedir = (cotas: number, cpf = CPF) =>
  new Request("http://localhost/api/pedidos", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "1.2.3.4" },
    body: JSON.stringify({
      nome: "Maria Silva",
      whatsapp: "15999998888",
      cpf,
      cotas,
    }),
  });

describe("POST /api/pedidos", () => {
  it("cria a cobrança sem consumir nenhuma cota", async () => {
    const { rota, store, falso } = await montarRota({ pixFalha: false });

    const res = await rota.POST(pedir(10));

    expect(res.status).toBe(201);
    expect(await store.pendentesDoCpf(CPF)).toBe(1);
    expect(falso.zset(`rifa:limite:cpf:${CPF}`).size).toBe(1);

    // O ponto central do modelo: cobrança aberta não tira número da rifa.
    const depois = await store.resumo();
    expect(depois.vendidas).toBe(0);
    expect(depois.disponiveis).toBe(1000);

    const { id } = (await res.json()) as { id: string };
    expect((await store.buscarPedido(id))!.numeros).toEqual([]);
  });

  it("falha no Pix devolve a vaga da janela e a vaga de pendente", async () => {
    const { rota, store, falso } = await montarRota({ pixFalha: true });

    const res = await rota.POST(pedir(10));

    expect(res.status).toBe(502);
    // Nada pode ficar preso: nem cota de limite, nem pendente.
    expect(await store.pendentesDoCpf(CPF)).toBe(0);
    expect(falso.zset(`rifa:limite:cpf:${CPF}`).size).toBe(0);
    expect(falso.zset(`rifa:limite:ip:1.2.3.4`).size).toBe(0);

    const depois = await store.resumo();
    expect(depois.vendidas).toBe(0);
    expect(depois.disponiveis).toBe(1000);
  });

  it("teto de pendentes por CPF vale também pela rota, sob rajada", async () => {
    const { rota, store, falso } = await montarRota({ pixFalha: false });

    const respostas = await Promise.all(
      Array.from({ length: 10 }, () => rota.POST(pedir(50)))
    );
    const criados = respostas.filter((r) => r.status === 201).length;

    // Teto de pendentes = 3 (o de CPF na janela, 5, é o freio seguinte).
    expect(criados).toBe(3);
    expect(await store.pendentesDoCpf(CPF)).toBe(3);
    expect(falso.zset(`rifa:pendentes:${CPF}`).size).toBe(3);
    // E mesmo com 3 cobranças de 50 cotas em aberto, a rifa continua inteira.
    expect((await store.resumo()).disponiveis).toBe(1000);
  });

  it("recusa a compra quando não há cotas suficientes", async () => {
    const { rota, store } = await montarRota({ pixFalha: false });

    // Vende 990 das 1000 cotas por dentro do store.
    const cheio: Store.Pedido = {
      id: "CHEIO",
      nome: "Fulano de Tal",
      whatsapp: "15999998888",
      cpf: "11144477735",
      vendedor: null,
      cotas: 990,
      valor: 990 * 15,
      numeros: [],
      status: "pendente",
      criadoEm: Date.now(),
      expiraEm: Date.now() + 60_000,
      pagoEm: null,
      provedor: "demonstracao",
      idPagamento: "demo_cheio",
      codigoPix: "000201",
      imagemQrCode: null,
    };
    await store.salvarPedido(cheio);
    await store.confirmarPagamento(cheio);

    const res = await rota.POST(pedir(50));
    const corpo = (await res.json()) as { erro: string };

    expect(res.status).toBe(409);
    expect(corpo.erro).toContain("Restam apenas 10 cotas");
  });

  it("recusa quantidade acima do teto de compra", async () => {
    const { rota } = await montarRota({ pixFalha: false });

    const res = await rota.POST(pedir(200));
    const corpo = (await res.json()) as { erro: string };

    expect(res.status).toBe(400);
    expect(corpo.erro).toContain("entre 1 e 50 cotas");
  });
});
