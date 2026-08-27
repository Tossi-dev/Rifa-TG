/* =========================================================================
 *  Testes dos números do painel.
 *
 *  O painel existe para o organizador decidir se abre mais um lote e se o
 *  ritmo dá conta do prazo. Indicador errado aqui não quebra nada na tela —
 *  faz alguém tomar a decisão errada, que é pior.
 * ========================================================================= */

import { describe, expect, it, vi } from "vitest";

import type { Conciliacao, LinhaConciliacao } from "./conciliacao";
import type * as Painel from "./painel";

const AGORA = Date.parse("2026-08-02T15:00:00-03:00");
const SORTEIO = "2026-10-31T20:00:00-03:00";

/** Carrega o módulo com uma rifa controlada, para o teste não depender do config real. */
async function comRifa(opcoes: {
  totalCotas?: number;
  metaArrecadacao?: number;
  precoCota?: number;
} = {}): Promise<typeof Painel> {
  vi.resetModules();
  vi.doMock("./config", () => ({
    RIFA: {
      totalCotas: opcoes.totalCotas ?? 1000,
      metaArrecadacao: opcoes.metaArrecadacao ?? 20000,
      precoCota: opcoes.precoCota ?? 15,
      dataSorteio: SORTEIO,
      dataSorteioLabel: "31 de outubro de 2026",
      maxCotasPorCompra: 50,
      pacotes: [
        { cotas: 1, popular: false },
        { cotas: 10, popular: true },
        { cotas: 50, popular: false },
      ],
    },
  }));
  return (await import("./painel")) as typeof Painel;
}

function venda(
  id: string,
  cotas: number,
  pagoEm: string,
  nome = "Fulano de Tal",
  whatsapp = "15999998888"
): LinhaConciliacao {
  return {
    id,
    status: "pago",
    nome,
    whatsapp,
    vendedor: null,
    cotas,
    valor: cotas * 15,
    numeros: Array.from({ length: cotas }, (_, i) => i + 1),
    criadoEm: Date.parse(pagoEm) - 600_000,
    pagoEm: Date.parse(pagoEm),
    idPagamento: `demo_${id}`,
  };
}

function conciliacao(pagos: LinhaConciliacao[], extras: Partial<Conciliacao["totais"]> = {}): Conciliacao {
  const cotasPagas = pagos.reduce((s, p) => s + p.cotas, 0);
  const valorPago = Number(pagos.reduce((s, p) => s + p.valor, 0).toFixed(2));
  return {
    gerado: AGORA,
    resumo: {
      total: 1000,
      vendidas: cotasPagas,
      disponiveis: 1000 - cotasPagas,
      percentual: Math.round((cotasPagas / 1000) * 100),
    },
    totais: {
      pedidos: pagos.length,
      pagos: pagos.length,
      pendentes: 0,
      expirados: 0,
      reembolsar: 0,
      conflitos: 0,
      valorPago,
      cotasPagas,
      cotasAguardando: 0,
      valorAReembolsar: 0,
      ...extras,
    },
    pagos,
    pendentes: [],
    expirados: [],
    reembolsar: [],
    conflitos: [],
  };
}

const acharKpi = (p: Painel.PainelDados, id: string) =>
  p.kpis.find((k) => k.id === id)!;

/* ===================================================================== */

describe("série diária", () => {
  it("preenche os dias sem venda em vez de emendar um dia no outro", async () => {
    const { montarPainel } = await comRifa();
    const dados = conciliacao([
      venda("A", 10, "2026-07-28T10:00:00-03:00"),
      venda("B", 20, "2026-07-31T10:00:00-03:00"),
    ]);

    const p = montarPainel(dados, AGORA);

    /* 28, 29, 30, 31 de julho + 1 e 2 de agosto = 6 dias. Sem o preenchimento
       o gráfico ligaria 28/07 direto em 31/07 e o ritmo pareceria o dobro. */
    expect(p.porDia.map((d) => d.rotulo)).toEqual([
      "28/07",
      "29/07",
      "30/07",
      "31/07",
      "01/08",
      "02/08",
    ]);
    expect(p.porDia.map((d) => d.cotas)).toEqual([10, 0, 0, 20, 0, 0]);
  });

  it("acumula o valor sem reiniciar nos dias vazios", async () => {
    const { montarPainel } = await comRifa();
    const p = montarPainel(
      conciliacao([
        venda("A", 10, "2026-07-30T10:00:00-03:00"),
        venda("B", 10, "2026-08-01T10:00:00-03:00"),
      ]),
      AGORA
    );

    expect(p.porDia.map((d) => d.acumulado)).toEqual([150, 150, 300, 300]);
  });

  it("agrupa pelo fuso de Brasília, não pelo UTC", async () => {
    const { montarPainel } = await comRifa();
    // 22h de Brasília em 01/08 é 01h UTC de 02/08.
    const p = montarPainel(
      conciliacao([venda("A", 5, "2026-08-01T22:00:00-03:00")]),
      AGORA
    );

    expect(p.porDia[0].rotulo).toBe("01/08");
    expect(p.vendasPorHora[22]).toBe(5);
  });
});

describe("ritmo contra a meta", () => {
  it("calcula o necessário pelo que FALTA, não pela meta cheia", async () => {
    const { montarPainel } = await comRifa({ metaArrecadacao: 20000 });
    const p = montarPainel(
      conciliacao([venda("A", 100, "2026-08-02T10:00:00-03:00")]),
      AGORA
    );

    /* Dias de CALENDÁRIO entre 02/08 e 31/10 = 90. Contar pela duração bruta
       até as 20h do sorteio fazia o número virar no meio da noite. */
    expect(p.meta.diasRestantes).toBe(90);

    // Faltam 20000 - 1500 = 18500; / 15 = 1233,3 cotas; / 90 dias = 13,7
    expect(p.ritmoNecessario).toBeCloseTo(13.7, 1);
  });

  it("meta já batida zera o ritmo necessário em vez de virar negativo", async () => {
    const { montarPainel } = await comRifa({ metaArrecadacao: 1000 });
    const p = montarPainel(
      conciliacao([venda("A", 200, "2026-08-02T10:00:00-03:00")]),
      AGORA
    );

    expect(p.ritmoNecessario).toBe(0);
    expect(acharKpi(p, "arrecadado").valor).toBe(3000);
  });

  it("ritmo é a média dos últimos 7 dias, não a média desde o começo", async () => {
    const { montarPainel } = await comRifa();
    const p = montarPainel(
      conciliacao([
        venda("A", 30, "2026-07-31T10:00:00-03:00"),
        venda("B", 30, "2026-08-02T10:00:00-03:00"),
      ]),
      AGORA
    );

    // 60 cotas em 3 dias (31/07, 01/08, 02/08) = 20/dia
    expect(acharKpi(p, "ritmo").valor).toBe(20);
  });

  it("campanha que parou fica VERMELHA em vez de viver do histórico", async () => {
    const { montarPainel } = await comRifa({ metaArrecadacao: 20000 });

    // Venda forte no começo e nada nos últimos 10 dias.
    const p = montarPainel(
      conciliacao([
        venda("A", 300, "2026-07-14T10:00:00-03:00"),
        venda("B", 300, "2026-07-15T10:00:00-03:00"),
      ]),
      AGORA
    );

    /* A média vitalícia seria 600/20 = 30/dia e o cartão ficaria verde para
       sempre. A janela de 7 dias enxerga a parada: zero. */
    expect(acharKpi(p, "ritmo").valor).toBe(0);
    expect(acharKpi(p, "ritmo").composicao).toContain("média desde a primeira venda");
  });

  it("o dia de hoje entra na série a qualquer hora, não só depois das 9h", async () => {
    const { montarPainel } = await comRifa();
    const dados = conciliacao([venda("A", 30, "2026-08-01T10:00:00-03:00")]);

    const cedo = montarPainel(dados, Date.parse("2026-08-03T05:00:00-03:00"));
    const tarde = montarPainel(dados, Date.parse("2026-08-03T14:00:00-03:00"));

    /* Antes, a régua da série era comparada com o instante atual: às 5h da
       manhã o dia de hoje ainda não existia, a série tinha um dia a menos e o
       ritmo mudava sozinho na virada das 9h. */
    expect(cedo.porDia).toHaveLength(3);
    expect(tarde.porDia).toHaveLength(3);
    expect(acharKpi(cedo, "ritmo").valor).toBe(acharKpi(tarde, "ritmo").valor);
  });
});

describe("indicadores", () => {
  it("todo indicador traz composição — nenhum número aparece sem a conta", async () => {
    const { montarPainel } = await comRifa();
    const p = montarPainel(
      conciliacao([venda("A", 10, "2026-08-01T10:00:00-03:00")]),
      AGORA
    );

    for (const kpi of p.kpis) {
      expect(kpi.composicao.trim().length).toBeGreaterThan(10);
    }
  });

  it('"a devolver" é marcado como métrica onde menor é melhor', async () => {
    const { montarPainel } = await comRifa();
    const p = montarPainel(conciliacao([]), AGORA);

    /* Sem isto o painel pintaria de vermelho um reembolso que caiu, que é a
       melhor notícia possível nesse indicador. */
    expect(acharKpi(p, "devolver").direcaoBoa).toBe("baixo");
  });

  it("indicador sem referência fica explicitamente sem referência", async () => {
    const { montarPainel } = await comRifa();
    const p = montarPainel(conciliacao([]), AGORA);

    const conversao = acharKpi(p, "conversao");
    expect(conversao.referencia).toBeNull();
    // O motivo vive no próprio cartão, não só numa nota de rodapé.
    expect(conversao.motivoSemReferencia).toContain("primeira campanha");
    expect(p.ressalvas.join(" ")).toContain("sem comparação");
  });

  it("caminho até a meta é progresso, não variação — não pinta de vermelho", async () => {
    const { montarPainel } = await comRifa();
    const p = montarPainel(
      conciliacao([venda("A", 10, "2026-08-01T10:00:00-03:00")]),
      AGORA
    );

    expect(acharKpi(p, "arrecadado").tipo).toBe("progresso");
    expect(acharKpi(p, "cotas").tipo).toBe("progresso");
    expect(acharKpi(p, "ritmo").tipo).toBe("variacao");
  });

  it("sem nenhuma venda, os indicadores existem e não viram NaN", async () => {
    const { montarPainel } = await comRifa();
    const p = montarPainel(conciliacao([]), AGORA);

    expect(p.temVenda).toBe(false);
    expect(p.porDia).toEqual([]);
    for (const kpi of p.kpis) {
      expect(Number.isFinite(kpi.valor)).toBe(true);
    }
    expect(p.ressalvas.join(" ")).toContain("Nenhuma venda confirmada ainda");
  });

  it("sem venda, nenhum indicador afirma uma divisão que não aconteceu", async () => {
    const { montarPainel } = await comRifa();
    const p = montarPainel(conciliacao([]), AGORA);

    /* Antes o painel imprimia "0 = 0 cotas pagas / 1 dia desde a primeira
       venda" — afirmando uma primeira venda inexistente — e pintava três
       cartões de vermelho com -100% em cima de divisões 0/0, contradizendo a
       ressalva logo abaixo. Composição errada é pior que ausente. */
    for (const kpi of p.kpis) {
      expect(kpi.composicao).not.toMatch(/\/ 0 /);
      expect(kpi.composicao).not.toContain("desde a primeira venda");
    }
    expect(acharKpi(p, "ritmo").referencia).toBeNull();
    expect(acharKpi(p, "ticket").referencia).toBeNull();
  });

  it("valor médio por pedido não ganha alvo inventado", async () => {
    const { montarPainel } = await comRifa();
    const p = montarPainel(
      conciliacao([venda("A", 10, "2026-08-01T10:00:00-03:00")]),
      AGORA
    );

    /* O tamanho do botão em destaque na página não é meta de ninguém, e
       ticket médio é métrica ambígua: cair pode ser boa notícia. */
    expect(acharKpi(p, "ticket").referencia).toBeNull();
  });
});

describe("agrupamentos", () => {
  it("junta o mesmo comprador pelo WhatsApp, não por pedido", async () => {
    const { montarPainel } = await comRifa();
    const p = montarPainel(
      conciliacao([
        venda("A", 10, "2026-08-01T10:00:00-03:00", "Ana Paula Souza", "15991111111"),
        venda("B", 20, "2026-08-02T10:00:00-03:00", "Ana Paula Souza", "15991111111"),
        venda("C", 5, "2026-08-02T11:00:00-03:00", "Outro Comprador", "15992222222"),
      ]),
      AGORA
    );

    expect(p.maioresCompradores).toHaveLength(2);
    expect(p.maioresCompradores[0]).toEqual({
      nome: "Ana S.",
      cotas: 30,
      valor: 450,
    });
  });

  it("mix agrupa por FAIXA, porque o comprador digita qualquer quantidade", async () => {
    const { montarPainel } = await comRifa();
    const p = montarPainel(
      conciliacao([
        venda("A", 10, "2026-08-01T10:00:00-03:00"),
        venda("B", 7, "2026-08-01T11:00:00-03:00"),
        venda("C", 50, "2026-08-01T12:00:00-03:00"),
        venda("D", 1, "2026-08-01T13:00:00-03:00"),
      ]),
      AGORA
    );

    /* Agrupar pelo número exato geraria até 50 barras de 7px com os rótulos
       sobrepostos — e a pergunta do gráfico é de faixa, não de valor exato. */
    expect(p.mixPacotes).toEqual([
      { rotulo: "1 cota", cotas: 1, pedidos: 1 },
      { rotulo: "6 a 10", cotas: 17, pedidos: 2 },
      { rotulo: "21 a 50", cotas: 50, pedidos: 1 },
    ]);
  });

  it("conversão conta como paga a cobrança que virou reembolso", async () => {
    const { montarPainel } = await comRifa();
    const p = montarPainel(
      conciliacao([venda("A", 10, "2026-08-01T10:00:00-03:00")], {
        pedidos: 2,
        pagos: 1,
        reembolsar: 1,
      }),
      AGORA
    );

    /* Pedido em reembolso é dinheiro que ENTROU. Contá-lo como não-pagamento
       fazia a conversão despencar quando o lote esgotava, e o plano de ação
       mandava investigar a tela de pagamento quando faltava era estoque. */
    expect(acharKpi(p, "conversao").valor).toBe(100);
  });

  it("situação esconde as fatias zeradas em vez de desenhar fatia vazia", async () => {
    const { montarPainel } = await comRifa();
    const p = montarPainel(
      conciliacao([venda("A", 10, "2026-08-01T10:00:00-03:00")], {
        pedidos: 3,
        pendentes: 2,
      }),
      AGORA
    );

    expect(p.situacao.map((s) => s.rotulo)).toEqual([
      "Pagas",
      "Aguardando pagamento",
    ]);
  });
});

describe("memória de cálculo", () => {
  it("todo indicador abre de onde vem, como calcula e onde conferir", async () => {
    const { montarPainel } = await comRifa();
    const p = montarPainel(
      conciliacao([venda("A", 10, "2026-08-01T10:00:00-03:00")]),
      AGORA
    );

    /* O cartão é clicável e abre isto. Campo vazio viraria um painel que
       promete auditabilidade e entrega espaço em branco. */
    for (const kpi of p.kpis) {
      expect(kpi.detalhe.deOndeVem.length).toBeGreaterThan(30);
      expect(kpi.detalhe.comoECalculado.length).toBeGreaterThan(30);
      expect(kpi.detalhe.ondeConferir.length).toBeGreaterThan(20);
    }
  });

  it("sem venda, o período fica vazio em vez de virar frase", async () => {
    const { montarPainel } = await comRifa();
    const p = montarPainel(conciliacao([]), AGORA);

    /* Antes o cabeçalho concatenava e saía "vendas de sem vendas registradas". */
    expect(p.periodo).toBe("");
  });

  it("plural concorda: 1 cobrança gerada, não 1 cobranças geradas", async () => {
    const { montarPainel } = await comRifa();
    const p = montarPainel(conciliacao([], { pedidos: 1 }), AGORA);

    const conversao = p.kpis.find((k) => k.id === "conversao")!;
    expect(conversao.composicao).toContain("1 cobrança gerada");
    expect(conversao.composicao).not.toContain("1 cobranças");
  });
});

describe("simulação", () => {
  it("passa pelo mesmo cálculo do painel real", async () => {
    const { montarPainelSimulado } = await comRifa();
    const { painel, pagos } = montarPainelSimulado(AGORA);

    expect(pagos.length).toBeGreaterThan(20);
    expect(painel.temVenda).toBe(true);
    expect(painel.porDia.length).toBeGreaterThan(7);
    // Mesma estrutura do painel de verdade, com os mesmos seis indicadores.
    expect(painel.kpis.map((k) => k.id)).toEqual([
      "arrecadado",
      "cotas",
      "ritmo",
      "ticket",
      "conversao",
      "devolver",
    ]);
  });

  it("avisa em primeiro lugar que é invenção", async () => {
    const { montarPainelSimulado } = await comRifa();
    const { painel } = montarPainelSimulado(AGORA);

    expect(painel.ressalvas[0]).toContain("SIMULAÇÃO");
    expect(painel.ressalvas[0]).toContain("inventados");
  });

  it("nunca mostra um estado impossível — vender além do lote", async () => {
    const { montarPainelSimulado } = await comRifa({ totalCotas: 1000 });
    const { painel } = montarPainelSimulado(AGORA);

    const cotas = painel.kpis.find((k) => k.id === "cotas")!;
    /* O sistema real recusa a venda que passa do lote. Uma simulação com 113%
       do lote vendido ensinaria o organizador a esperar algo que não acontece. */
    expect(cotas.valor).toBeLessThanOrEqual(1000);
    expect(cotas.valor).toBeGreaterThan(300);
  });

  it("distribui números de verdade, para a busca do ganhador achar alguém", async () => {
    const { montarPainelSimulado } = await comRifa();
    const { pagos } = montarPainelSimulado(AGORA);

    /* O painel dizia "776 cotas vendidas" e a busca respondia "não foi
       vendido" — porque a busca ia ao banco real enquanto os cartões vinham da
       simulação. A tela se contradizia. A correção tem dois lados: a busca
       procura dentro da simulação, e a simulação precisa ter o que ser
       encontrado. Este teste guarda o segundo lado. */
    const todos = pagos.flatMap((p) => p.numeros);
    const cotas = pagos.reduce((soma, p) => soma + p.cotas, 0);

    expect(todos.length).toBe(cotas);
    // Sequência fechada de 1 a N, sem buraco e sem número repetido.
    expect(new Set(todos).size).toBe(todos.length);
    expect(Math.min(...todos)).toBe(1);
    expect(Math.max(...todos)).toBe(cotas);
    // Cada pedido recebe um bloco contíguo, como o sistema real faz.
    for (const pedido of pagos) {
      expect(pedido.numeros.length).toBe(pedido.cotas);
      expect(pedido.numeros[pedido.numeros.length - 1]).toBe(
        pedido.numeros[0] + pedido.cotas - 1
      );
    }
  });

  it("é determinística: dois cliques mostram a mesma coisa", async () => {
    const { montarPainelSimulado } = await comRifa();
    const a = montarPainelSimulado(AGORA);
    const b = montarPainelSimulado(AGORA);

    expect(a.painel.kpis.map((k) => k.valor)).toEqual(
      b.painel.kpis.map((k) => k.valor)
    );
    expect(a.pagos.length).toBe(b.pagos.length);
  });
});

describe("lote contra meta", () => {
  it("avisa quando os gráficos veem menos pedidos que o contador geral", async () => {
    const { montarPainel } = await comRifa();
    const dados = conciliacao([venda("A", 10, "2026-08-01T10:00:00-03:00")]);
    dados.resumo.vendidas = 900; // contador geral bem à frente da janela lida

    const p = montarPainel(dados, AGORA);

    expect(p.ressalvas.join(" ")).toContain("890 cotas");
  });

  it("avisa quando o lote atual não comporta a meta", async () => {
    const { montarPainel } = await comRifa({
      totalCotas: 1000,
      metaArrecadacao: 20000,
    });
    const p = montarPainel(conciliacao([]), AGORA);

    expect(p.meta.loteSuficiente).toBe(false);
    expect(p.meta.cotasParaMeta).toBe(1334);
    expect(p.ressalvas.join(" ")).toContain("abrir mais um lote");
  });

  it("não avisa quando o lote comporta a meta", async () => {
    const { montarPainel } = await comRifa({
      totalCotas: 1500,
      metaArrecadacao: 20000,
    });
    const p = montarPainel(conciliacao([]), AGORA);

    expect(p.meta.loteSuficiente).toBe(true);
    expect(p.ressalvas.join(" ")).not.toContain("abrir mais um lote");
  });
});
