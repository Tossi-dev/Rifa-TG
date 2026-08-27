/* =========================================================================
 *  Séries e indicadores do painel do organizador.
 *
 *  Função pura: recebe a conciliação já montada e o instante atual, devolve
 *  tudo que a tela desenha. Fica separada da tela para poder ser testada sem
 *  navegador — e porque a conta do ritmo é a que decide se a campanha está
 *  indo bem, então ela não pode morar dentro de um componente.
 *
 *  REGRA: nenhum número aqui é inventado. Todo indicador carrega a `composicao`
 *  — a conta que o produziu — e quando não existe referência de comparação o
 *  campo vai `null` e a tela diz que aquele indicador está sem referência.
 * ========================================================================= */

import { RIFA } from "./config";
import type { Conciliacao, LinhaConciliacao } from "./conciliacao";

export type FormatoKpi = "moeda" | "numero" | "decimal" | "percentual";

export interface Kpi {
  id: string;
  /**
   * Como a comparação deve ser lida.
   *
   * `progresso` — caminho até uma meta. Estar abaixo NÃO é má notícia: é "ainda
   * não chegou". Pintar de vermelho quem está em 66% da meta com três meses
   * pela frente faz o painel gritar sem motivo, e um painel que grite à toa
   * deixa de ser levado a sério quando algo estiver realmente errado.
   *
   * `variacao` — desempenho contra uma referência. Aqui vermelho é vermelho.
   */
  tipo: "progresso" | "variacao";
  label: string;
  valor: number;
  formato: FormatoKpi;
  /** A conta ou a origem do número. Nunca vazio. */
  composicao: string;
  /** `null` quando não existe referência — a tela avisa que está sem. */
  referencia: number | null;
  labelReferencia: string;
  /** Por que este indicador não tem comparação. Vazio quando tem. */
  motivoSemReferencia?: string;
  /**
   * Memória de cálculo completa, aberta ao clicar no cartão.
   *
   * A `composicao` cabe numa linha e responde "que conta é essa". Isto responde
   * as outras três perguntas que aparecem numa reunião: de onde saiu o dado,
   * como exatamente ele é calculado, e como conferir por fora do painel.
   */
  detalhe: {
    deOndeVem: string;
    comoECalculado: string;
    ondeConferir: string;
  };
  direcaoBoa: "cima" | "baixo";
}

export interface PontoDia {
  /** Chave ordenável, AAAA-MM-DD no fuso de Brasília. */
  dia: string;
  /** Rótulo curto para o eixo, DD/MM. */
  rotulo: string;
  cotas: number;
  valor: number;
  acumulado: number;
}

export interface FatiaSituacao {
  rotulo: string;
  valor: number;
  /** Cor semântica: situação de cobrança não é categoria, é estado. */
  estado: "pago" | "aguardando" | "vencido" | "devolver";
}

export interface PainelDados {
  gerado: number;
  periodo: string;
  temVenda: boolean;
  meta: {
    arrecadacao: number;
    lote: number;
    precoCota: number;
    dataSorteioLabel: string;
    diasRestantes: number;
    cotasParaMeta: number;
    loteSuficiente: boolean;
  };
  kpis: Kpi[];
  porDia: PontoDia[];
  ritmoNecessario: number;
  mixPacotes: Array<{ rotulo: string; cotas: number; pedidos: number }>;
  vendasPorHora: number[];
  situacao: FatiaSituacao[];
  maioresCompradores: Array<{ nome: string; cotas: number; valor: number }>;
  /** Avisos honestos sobre o que o painel NÃO consegue afirmar. */
  ressalvas: string[];
}

/* ------------------------------------------------------------- Datas ---- */

const FUSO = "America/Sao_Paulo";

const chaveDia = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const rotuloDia = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  day: "2-digit",
  month: "2-digit",
});

const horaDoDia = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  hour: "2-digit",
  hourCycle: "h23",
});

const MS_DIA = 86_400_000;

/** Quantos dias a série do gráfico mostra, no máximo. */
const JANELA_SERIE_DIAS = 90;

/** Meia-noite (em ms UTC) do dia AAAA-MM-DD — só para caminhar dia a dia. */
function inicioDoDia(chave: string): number {
  return Date.parse(`${chave}T12:00:00Z`); // meio-dia evita virada por fuso
}

/* ------------------------------------------------------------ Helpers --- */

const arredondar = (n: number, casas = 2): number =>
  Number.isFinite(n) ? Number(n.toFixed(casas)) : 0;

/** Primeiro nome + inicial do sobrenome: identifica sem expor o nome inteiro. */
function nomeCurto(completo: string): string {
  const partes = completo.trim().split(/\s+/).filter(Boolean);
  if (partes.length <= 1) return partes[0] ?? "—";
  return `${partes[0]} ${partes[partes.length - 1][0].toUpperCase()}.`;
}

/* ========================================================================= */

export function montarPainel(
  dados: Conciliacao,
  agora: number = Date.now()
): PainelDados {
  const pagos = dados.pagos;
  const cotasPagas = dados.totais.cotasPagas;
  const arrecadado = dados.totais.valorPago;

  /* ------------------------------------------------------ Prazo e meta -- */
  /* Contado em DIAS DE CALENDÁRIO no fuso de Brasília, não pela duração bruta
     até o horário do sorteio. Com `Math.ceil` sobre a duração, o número virava
     às 20h — o organizador via "faltam 91 dias" às 19h59 e "90" às 20h01, com
     o ritmo necessário mudando junto, sem nada ter acontecido. */
  const sorteio = Date.parse(RIFA.dataSorteio);
  const diasRestantes = Math.max(
    0,
    Math.round(
      (inicioDoDia(chaveDia.format(sorteio)) -
        inicioDoDia(chaveDia.format(agora))) /
        MS_DIA
    )
  );
  const cotasParaMeta = Math.ceil(RIFA.metaArrecadacao / RIFA.precoCota);
  const faltaParaMeta = Math.max(0, RIFA.metaArrecadacao - arrecadado);
  const ritmoNecessario =
    diasRestantes > 0
      ? arredondar(faltaParaMeta / RIFA.precoCota / diasRestantes, 1)
      : 0;

  /* -------------------------------------------------- Série diária ------ */
  const porDiaMapa = new Map<string, { cotas: number; valor: number }>();
  for (const p of pagos) {
    if (!p.pagoEm) continue;
    const chave = chaveDia.format(p.pagoEm);
    const atual = porDiaMapa.get(chave) ?? { cotas: 0, valor: 0 };
    atual.cotas += p.cotas;
    atual.valor += p.valor;
    porDiaMapa.set(chave, atual);
  }

  const diasComVenda = [...porDiaMapa.keys()].sort();
  const porDia: PontoDia[] = [];

  if (diasComVenda.length > 0) {
    /* Preenche os dias sem venda: buraco na série mente sobre o ritmo — um
       gráfico que pula do dia 1 para o dia 9 parece contínuo e não é. */
    /* Tudo na mesma régua: chave de dia -> meio-dia UTC. Comparar a régua com
       o instante `agora` fazia o dia de hoje só entrar na série depois das 9h
       de Brasília — e o KPI de ritmo caía de verde para vermelho sozinho, na
       virada, sem nenhuma venda ter acontecido. */
    const hoje = inicioDoDia(chaveDia.format(agora));
    const ultimoComVenda = inicioDoDia(diasComVenda[diasComVenda.length - 1]);
    const fim = Math.max(ultimoComVenda, hoje);
    /* Janela de 90 dias: uma data absurda vinda do gateway (ou um pedido de
       teste de meses atrás) esticava a série até a trava de 400 e o gráfico
       passava a discordar do cartão logo acima dele. */
    const inicio = Math.max(
      inicioDoDia(diasComVenda[0]),
      fim - JANELA_SERIE_DIAS * MS_DIA
    );
    let acumulado = 0;
    for (let t = inicio; t <= fim; t += MS_DIA) {
      const chave = chaveDia.format(t);
      const dia = porDiaMapa.get(chave) ?? { cotas: 0, valor: 0 };
      acumulado = arredondar(acumulado + dia.valor);
      porDia.push({
        dia: chave,
        rotulo: rotuloDia.format(t),
        cotas: dia.cotas,
        valor: arredondar(dia.valor),
        acumulado,
      });
      if (porDia.length > JANELA_SERIE_DIAS + 2) break; // trava de segurança
    }
  }

  const serieCortada =
    diasComVenda.length > 0 &&
    inicioDoDia(diasComVenda[0]) <
      inicioDoDia(porDia[0]?.dia ?? diasComVenda[0]);

  const diasCorridos = Math.max(1, porDia.length);
  const ritmoVitalicio = arredondar(cotasPagas / diasCorridos, 1);

  /* O ritmo do cartão é a média dos ÚLTIMOS 7 DIAS, não a média desde o
     começo. A média vitalícia nunca desce depois de um bom início: uma
     campanha parada há um mês continuava verde porque o histórico segurava o
     número enquanto o "necessário" caía. Sete dias é curto o bastante para a
     parada aparecer e longo o bastante para não oscilar com fim de semana. */
  const ultimosDias = porDia.slice(-7);
  const diasJanela = Math.max(1, ultimosDias.length);
  const cotasJanela = ultimosDias.reduce((s, d) => s + d.cotas, 0);
  const ritmoAtual = arredondar(cotasJanela / diasJanela, 1);

  /* ------------------------------------------------------ Mix de pacote -- */
  /* Agrupado em FAIXAS, não por valor exato. O comprador pode digitar qualquer
     quantidade no seletor, então agrupar pelo número cru gerava dezenas de
     barras de 7px com rótulos sobrepostos. E a pergunta que o gráfico responde
     — "vale mais destacar pacote grande ou pequeno?" — é de faixa, não de
     número exato. */
  const teto = RIFA.maxCotasPorCompra;
  const faixas: Array<{ rotulo: string; ate: number }> = [
    { rotulo: "1 cota", ate: 1 },
    { rotulo: "2 a 5", ate: 5 },
    { rotulo: "6 a 10", ate: 10 },
    { rotulo: "11 a 20", ate: 20 },
    { rotulo: `21 a ${teto}`, ate: Math.max(21, teto) },
  ].filter((f, i, todas) => i === 0 || f.ate > todas[i - 1].ate);

  const faixaMapa = new Map<string, { cotas: number; pedidos: number }>();
  for (const p of pagos) {
    const faixa = faixas.find((f) => p.cotas <= f.ate) ?? faixas[faixas.length - 1];
    const atual = faixaMapa.get(faixa.rotulo) ?? { cotas: 0, pedidos: 0 };
    atual.cotas += p.cotas;
    atual.pedidos += 1;
    faixaMapa.set(faixa.rotulo, atual);
  }
  const mixPacotes = faixas
    .filter((f) => faixaMapa.has(f.rotulo))
    .map((f) => ({ rotulo: f.rotulo, ...faixaMapa.get(f.rotulo)! }));

  /* ------------------------------------------------------ Hora do dia ---- */
  const vendasPorHora = Array<number>(24).fill(0);
  for (const p of pagos) {
    if (!p.pagoEm) continue;
    const h = Number(horaDoDia.format(p.pagoEm));
    if (Number.isInteger(h) && h >= 0 && h < 24) vendasPorHora[h] += p.cotas;
  }

  /* ------------------------------------------------- Situação atual ------ */
  const todasSituacoes: FatiaSituacao[] = [
    { rotulo: "Pagas", valor: dados.totais.pagos, estado: "pago" },
    {
      rotulo: "Aguardando pagamento",
      valor: dados.totais.pendentes,
      estado: "aguardando",
    },
    { rotulo: "Pix vencido", valor: dados.totais.expirados, estado: "vencido" },
    { rotulo: "A devolver", valor: dados.totais.reembolsar, estado: "devolver" },
  ];
  const situacao = todasSituacoes.filter((f) => f.valor > 0);

  /* ------------------------------------------------ Maiores compradores -- */
  const porComprador = new Map<string, { nome: string; cotas: number; valor: number }>();
  for (const p of pagos) {
    const chave = p.whatsapp || p.nome; // WhatsApp identifica melhor que o nome
    const atual = porComprador.get(chave) ?? {
      nome: nomeCurto(p.nome),
      cotas: 0,
      valor: 0,
    };
    atual.cotas += p.cotas;
    atual.valor = arredondar(atual.valor + p.valor);
    porComprador.set(chave, atual);
  }
  const maioresCompradores = [...porComprador.values()]
    .sort((a, b) => b.cotas - a.cotas || a.nome.localeCompare(b.nome))
    .slice(0, 10);

  /* -------------------------------------------------------------- KPIs --- */
  /* Pedido em `reembolsar` é dinheiro que ENTROU e não tinha cota para
     entregar. Deixá-lo fora do numerador fazia a conversão despencar quando o
     lote esgotava, e o plano de ação mandava investigar a tela de pagamento
     quando o problema era falta de estoque. */
  const cobrancasGeradas = dados.totais.pedidos;
  const cobrancasPagas = dados.totais.pagos + dados.totais.reembolsar;
  const conversao =
    cobrancasGeradas > 0
      ? arredondar((cobrancasPagas / cobrancasGeradas) * 100, 1)
      : 0;
  const ticketMedio =
    dados.totais.pagos > 0 ? arredondar(arrecadado / dados.totais.pagos) : 0;

  const temVenda = pagos.length > 0;

  const brl = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const num = (v: number) => v.toLocaleString("pt-BR");
  /** "1 cobrança gerada" e não "1 cobranças geradas". */
  const plural = (n: number, um: string, varios: string) =>
    `${num(n)} ${n === 1 ? um : varios}`;

  const kpis: Kpi[] = [
    {
      id: "arrecadado",
      tipo: "progresso",
      label: "Arrecadado",
      valor: arrecadado,
      formato: "moeda",
      /* Origem, não multiplicação: o valor de cada pedido é congelado quando
         ele é criado, então "cotas x preço atual" para de fechar assim que
         alguém mexe no preço no `config.ts` — que é justamente o arquivo que o
         organizador edita. */
      composicao: `${brl(arrecadado)} = soma de ${plural(dados.totais.pagos, "pedido pago", "pedidos pagos")} (${plural(cotasPagas, "cota", "cotas")})`,
      referencia: RIFA.metaArrecadacao,
      labelReferencia: "da meta da campanha",
      direcaoBoa: "cima",
      detalhe: {
        deOndeVem:
          "Do campo de valor de cada pedido cujo pagamento foi confirmado. Pedido aguardando pagamento, com Pix vencido ou na fila de reembolso não entra.",
        comoECalculado:
          "Soma direta, pedido a pedido. Não é cotas x preço: o valor de cada compra fica congelado no momento em que ela é feita, então se o preço da cota mudar no meio da campanha as compras antigas continuam valendo o que valiam.",
        ondeConferir:
          "Baixe o CSV pelo botão do topo e some a coluna valor das linhas com status pago. Tem que dar exatamente este número.",
      },
    },
    {
      id: "cotas",
      tipo: "progresso",
      label: "Cotas vendidas",
      valor: dados.resumo.vendidas,
      formato: "numero",
      composicao: `${num(dados.resumo.vendidas)} = números já atribuídos menos os devolvidos por estorno`,
      referencia: RIFA.totalCotas,
      labelReferencia: "do lote atual",
      direcaoBoa: "cima",
      detalhe: {
        deOndeVem:
          "Do contador do banco de dados que entrega os números, não da soma dos pedidos. É o mesmo comando que dá o número ao comprador — por isso não existe a possibilidade de contar diferente do que foi entregue.",
        comoECalculado:
          "Números já atribuídos, menos os que voltaram para a rifa por estorno (uma falha de gravação no meio da confirmação, por exemplo). Não existe contador paralelo: contador separado é o caminho mais curto para o painel dizer um número e o comprovante dizer outro.",
        ondeConferir:
          "Some a coluna cotas das linhas pagas do CSV. Se der diferente, houve estorno — e a diferença é exatamente o que foi devolvido.",
      },
    },
    {
      id: "ritmo",
      tipo: "variacao",
      label: "Ritmo de venda (últimos 7 dias)",
      valor: ritmoAtual,
      formato: "decimal",
      composicao: temVenda
        ? `${ritmoAtual.toLocaleString("pt-BR")} = ${plural(cotasJanela, "cota", "cotas")} em ${plural(diasJanela, "dia", "dias")} · média desde a primeira venda: ${ritmoVitalicio.toLocaleString("pt-BR")}/dia`
        : "ainda não há venda confirmada — o ritmo começa a ser medido na primeira",
      referencia: temVenda ? ritmoNecessario : null,
      labelReferencia: temVenda ? `necessário até ${RIFA.dataSorteioLabel}` : "",
      motivoSemReferencia: temVenda
        ? undefined
        : "Sem venda ainda — não há ritmo para comparar.",
      direcaoBoa: "cima",
      detalhe: {
        deOndeVem:
          "Das cotas pagas nos últimos 7 dias da série, agrupadas pela data do pagamento no horário de Brasília.",
        comoECalculado:
          "Média móvel: cotas pagas na janela dividido pelos dias da janela. É média móvel de propósito — a média desde o início nunca desce depois de um bom começo, e uma campanha parada há um mês continuaria aparecendo como saudável. A referência é o oposto: quanto falta para a meta, dividido pelos dias que faltam até o sorteio.",
        ondeConferir:
          "No gráfico Ritmo de venda por dia, logo abaixo: a linha é o mesmo dado, dia a dia, e a tracejada é a referência.",
      },
    },
    {
      id: "ticket",
      tipo: "variacao",
      label: "Valor médio por pedido",
      valor: ticketMedio,
      formato: "moeda",
      composicao: temVenda
        ? `${brl(ticketMedio)} = ${brl(arrecadado)} / ${plural(dados.totais.pagos, "pedido pago", "pedidos pagos")}`
        : "ainda não há pedido pago para calcular a média",
      /* Sem referência de propósito. O tamanho do botão em destaque na página
         não é meta de ninguém, e ticket médio é métrica ambígua: cair pode
         significar que a campanha alcançou mais gente, que é boa notícia. */
      referencia: null,
      labelReferencia: "",
      motivoSemReferencia:
        "Sem referência: o pacote em destaque na página não é meta, e ticket médio é ambíguo — cair pode significar que a rifa alcançou mais gente.",
      direcaoBoa: "cima",
      detalhe: {
        deOndeVem: "Do total arrecadado dividido pela quantidade de pedidos pagos.",
        comoECalculado:
          "Divisão simples. Não tem comparação de propósito: não existe meta de ticket nesta campanha, e a métrica é ambígua — o valor cair pode ser má notícia (gente comprando menos) ou boa (a rifa alcançou mais gente comprando pouco). Inventar uma referência aqui daria autoridade a uma leitura que ninguém verificou.",
        ondeConferir:
          "No gráfico Quais pacotes as pessoas escolhem: ele mostra a distribuição por trás desta média.",
      },
    },
    {
      id: "conversao",
      tipo: "variacao",
      label: "Cobranças que foram pagas",
      valor: conversao,
      formato: "percentual",
      composicao: cobrancasGeradas
        ? `${conversao.toLocaleString("pt-BR")}% = ${plural(cobrancasPagas, "cobrança paga", "cobranças pagas")} / ${plural(cobrancasGeradas, "cobrança gerada", "cobranças geradas")}`
        : "nenhuma cobrança gerada ainda",
      // Primeira campanha: não existe período anterior nem média histórica.
      referencia: null,
      labelReferencia: "",
      motivoSemReferencia:
        "Sem referência: é a primeira campanha, então não existe período anterior nem média histórica.",
      detalhe: {
        deOndeVem:
          "De todas as cobranças Pix geradas pelo site, comparadas com as que resultaram em pagamento.",
        comoECalculado:
          "Cobranças pagas dividido por cobranças geradas. Pagamento que entrou mas não tinha cota para receber (fila de reembolso) conta como PAGO aqui: o dinheiro caiu, e chamá-lo de não-pago faria o indicador despencar quando o lote esgotasse, mandando você investigar a tela de pagamento quando o problema é falta de número.",
        ondeConferir:
          "No gráfico Situação das cobranças agora: a fatia verde sobre o total do meio da rosca é este mesmo percentual.",
      },
      direcaoBoa: "cima",
    },
    {
      id: "devolver",
      tipo: "variacao",
      label: "A devolver",
      valor: dados.totais.valorAReembolsar,
      formato: "moeda",
      composicao: `${brl(dados.totais.valorAReembolsar)} = ${plural(dados.totais.reembolsar, "pagamento que entrou", "pagamentos que entraram")} sem cota disponível`,
      referencia: 0,
      labelReferencia: "esperado: zero",
      direcaoBoa: "baixo",
      detalhe: {
        deOndeVem:
          "Dos pedidos marcados para reembolso: o Pix foi pago, mas quando a confirmação chegou já não havia cota disponível.",
        comoECalculado:
          "Soma do valor desses pedidos. Aqui menor é melhor, então o cartão fica verde em zero e vermelho acima disso — o contrário dos outros. Se aparecer algum, o nome e o WhatsApp estão na lista Pagamentos a devolver, no fim da página.",
        ondeConferir:
          "No CSV, as linhas com status reembolsar, e as linhas de conflito no fim do arquivo.",
      },
    },
  ];

  /* ---------------------------------------------------------- Ressalvas -- */
  const ressalvas: string[] = [];

  /* A conciliação lê os últimos 1.000 pedidos. Passando disso, "Cotas
     vendidas" (que vem do contador global) e todo o resto (que vem da janela)
     passam a discordar — e sem aviso o organizador não teria como saber. */
  if (cotasPagas !== dados.resumo.vendidas) {
    ressalvas.push(
      `Os gráficos e o caixa consideram os ${num(dados.totais.pedidos)} pedidos mais recentes; o total de cotas vendidas (${num(dados.resumo.vendidas)}) vem do contador geral. A diferença de ${num(Math.abs(dados.resumo.vendidas - cotasPagas))} cotas é histórico fora dessa janela.`
    );
  }
  if (serieCortada) {
    ressalvas.push(
      `O gráfico mostra os últimos ${JANELA_SERIE_DIAS} dias. Há venda registrada antes disso, fora da série.`
    );
  }
  if (!pagos.length) {
    ressalvas.push(
      "Nenhuma venda confirmada ainda: os gráficos ficam vazios e o ritmo não pode ser calculado. Não é erro do painel."
    );
  }
  ressalvas.push(
    'Dois indicadores nascem sem comparação: "Cobranças que foram pagas" (é a primeira campanha, não há período anterior) e "Valor médio por pedido" (não existe meta de ticket, e a métrica é ambígua). Ambos dizem isso no próprio cartão.'
  );
  if (cotasParaMeta > RIFA.totalCotas) {
    ressalvas.push(
      `A meta de ${brl(RIFA.metaArrecadacao)} exige ${num(cotasParaMeta)} cotas, e o lote atual tem ${num(RIFA.totalCotas)}. Vender o lote inteiro chega a ${brl(RIFA.totalCotas * RIFA.precoCota)} — para bater a meta é preciso abrir mais um lote.`
    );
  }
  if (diasRestantes === 0) {
    ressalvas.push(
      "A data do sorteio já passou ou é hoje: o ritmo necessário deixou de fazer sentido."
    );
  }

  /* String vazia quando não há venda: a tela decide como escrever isso. Antes
     o cabeçalho concatenava e saía "vendas de sem vendas registradas". */
  const periodo = porDia.length
    ? `${porDia[0].rotulo} a ${porDia[porDia.length - 1].rotulo}`
    : "";

  return {
    gerado: dados.gerado,
    periodo,
    temVenda,
    meta: {
      arrecadacao: RIFA.metaArrecadacao,
      lote: RIFA.totalCotas,
      precoCota: RIFA.precoCota,
      dataSorteioLabel: RIFA.dataSorteioLabel,
      diasRestantes,
      cotasParaMeta,
      loteSuficiente: cotasParaMeta <= RIFA.totalCotas,
    },
    kpis,
    porDia,
    ritmoNecessario,
    mixPacotes,
    vendasPorHora,
    situacao,
    maioresCompradores,
    ressalvas,
  };
}

/** Reexporta para a tela não precisar importar de dois lugares. */
export type { LinhaConciliacao };

/* =========================================================================
 *  Simulação
 * ========================================================================= */

/**
 * Painel preenchido com dados FICTÍCIOS, para o organizador ver como a tela
 * vai ficar antes de existir venda.
 *
 * Fabrica uma conciliação de mentira e a passa por `montarPainel` — o MESMO
 * caminho do dado real. Escrever uma segunda versão "só para a demonstração"
 * garantiria que uma hora as duas divergissem, e a demonstração passaria a
 * mostrar um painel que não existe.
 *
 * Os números saem de um gerador determinístico: a mesma data produz sempre a
 * mesma simulação, então nada "muda sozinho" entre dois cliques.
 */
export function montarPainelSimulado(agora: number = Date.now()): {
  painel: PainelDados;
  pagos: LinhaConciliacao[];
} {
  const NOMES = [
    "Joao Vitor Silva", "Maria Souza Lima", "Carlos Eduardo Nunes",
    "Ana Paula Ribeiro", "Pedro Henrique Alves", "Juliana Costa Moraes",
    "Marcos Vinicius Dias", "Fernanda Oliveira", "Rafael Santos Rocha",
    "Beatriz Moraes", "Lucas Pereira", "Camila Rocha Nunes",
  ];
  const TAMANHOS = [1, 5, 10, 10, 10, 20, 20, 30, 50];

  // Gerador previsível: mesma semente, mesma simulação.
  let semente = 20260802;
  const sorteio = (): number => {
    semente = (semente * 1103515245 + 12345) % 2147483648;
    return semente / 2147483648;
  };

  const pagos: LinhaConciliacao[] = [];
  let sequencia = 0;
  let cotasNaSimulacao = 0;
  /* A simulação não pode mostrar um estado impossível: o sistema nunca deixa
     vender além do lote. Parar em 78% deixa a barra de progresso interessante
     e continua sendo uma situação que pode acontecer de verdade. */
  const tetoSimulado = Math.floor(RIFA.totalCotas * 0.78);

  for (let diasAtras = 13; diasAtras >= 0; diasAtras--) {
    const quantas = Math.max(1, Math.round(2 + sorteio() * 6));
    for (let i = 0; i < quantas; i++) {
      const cotas = TAMANHOS[Math.floor(sorteio() * TAMANHOS.length)];
      if (cotasNaSimulacao + cotas > tetoSimulado) continue;
      cotasNaSimulacao += cotas;
      const hora = 11 + Math.floor(sorteio() * 11); // venda por WhatsApp concentra à tarde e à noite
      const pagoEm =
        inicioDoDia(chaveDia.format(agora - diasAtras * MS_DIA)) -
        12 * 3_600_000 +
        hora * 3_600_000 +
        Math.floor(sorteio() * 60) * 60_000 +
        3 * 3_600_000; // volta do meio-dia UTC para o fuso de Brasília
      const indice = Math.floor(sorteio() * NOMES.length);
      sequencia += 1;
      pagos.push({
        id: `SIMULADO${String(sequencia).padStart(3, "0")}`,
        status: "pago",
        nome: NOMES[indice],
        whatsapp: `1599${String(100000 + indice * 7777)}`,
        cotas,
        valor: Number((cotas * RIFA.precoCota).toFixed(2)),
        numeros: [],
        criadoEm: pagoEm - 600_000,
        pagoEm,
        idPagamento: `simulado_${sequencia}`,
        vendedor: null,
      });
    }
  }

  const cotasPagas = pagos.reduce((s, p) => s + p.cotas, 0);
  const valorPago = Number(pagos.reduce((s, p) => s + p.valor, 0).toFixed(2));
  const pendentes = 3;
  const expirados = 5;

  const conciliacao: Conciliacao = {
    gerado: agora,
    resumo: {
      total: RIFA.totalCotas,
      vendidas: cotasPagas,
      disponiveis: Math.max(0, RIFA.totalCotas - cotasPagas),
      percentual: Math.min(100, Math.round((cotasPagas / RIFA.totalCotas) * 100)),
    },
    totais: {
      pedidos: pagos.length + pendentes + expirados,
      pagos: pagos.length,
      pendentes,
      expirados,
      reembolsar: 0,
      conflitos: 0,
      valorPago,
      cotasPagas,
      cotasAguardando: pendentes * 10,
      valorAReembolsar: 0,
    },
    pagos,
    pendentes: [],
    expirados: [],
    reembolsar: [],
    conflitos: [],
  };

  const painel = montarPainel(conciliacao, agora);

  /* Os números de cada pedido só existem depois da confirmação real; para a
     tabela de detalhe da simulação não ficar vazia, distribuo sequencialmente
     como o sistema faria. */
  let proximo = 1;
  const comNumeros = pagos.map((p) => {
    const numeros = Array.from({ length: p.cotas }, (_, i) => proximo + i);
    proximo += p.cotas;
    return { ...p, numeros };
  });

  return {
    painel: {
      ...painel,
      ressalvas: [
        "SIMULAÇÃO: todos os números desta tela são inventados, só para mostrar como o painel fica quando houver venda. Nada aqui saiu do banco de dados.",
        ...painel.ressalvas.filter((r) => !r.startsWith("Nenhuma venda")),
      ],
    },
    pagos: [...comNumeros].reverse(),
  };
}
