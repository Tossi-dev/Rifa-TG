/* =========================================================================
 *  Camada de dados da rifa.
 *
 *  Em produção usa Upstash Redis (REST) — funciona 100% em serverless/Vercel.
 *  Sem as variáveis de ambiente do Upstash, cai para uma memória local, só
 *  para desenvolvimento e demonstração.
 *
 *  REGRA DE OURO: todo passo que decide "quem fica com o quê" acontece em UM
 *  comando atômico do Redis. Nunca em "leio, penso, escrevo" — entre a
 *  leitura e a escrita existe latência de rede, e é ali que dois compradores
 *  (ou dois webhooks) se atropelam.
 *
 *  MODELO: NÚMERO SÓ SAI COM PAGAMENTO CONFIRMADO.
 *  O pedido nasce sem números. A atribuição acontece dentro da confirmação do
 *  pagamento. Isso elimina de raiz a reserva, o prazo, o carrinho abandonado e
 *  a varredura de vencidas — ninguém segura número sem ter pago.
 *
 *  Os dois pontos de disputa e como cada um é resolvido:
 *   1. quem decide o pedido ....... SET NX EX em `rifa:decisao:<id>`
 *   2. atribuição de números ...... LPOP (devolvidos) + INCRBY (contador)
 * ========================================================================= */

import { RIFA } from "./config";

/**
 * `expirado` é o Pix que venceu sem pagamento — e NÃO é terminal: como nada
 * ficou preso, um Pix pago no limite ainda vira `pago`.
 * `reembolsar` é o único desfecho ruim possível: dinheiro entrou e não havia
 * cota sobrando. Vai para a fila de conciliação do organizador.
 */
export type StatusPedido = "pendente" | "pago" | "expirado" | "reembolsar";
export type Provedor = "mercadopago" | "demonstracao" | "manual";

export interface Pedido {
  id: string;
  nome: string;
  whatsapp: string;
  cpf: string;
  cotas: number;
  valor: number;
  /** Vazio até o pagamento ser confirmado. */
  numeros: number[];
  status: StatusPedido;
  criadoEm: number;
  /** Validade do Pix. Não segura número nenhum — é só o prazo da cobrança. */
  expiraEm: number;
  pagoEm: number | null;
  provedor: Provedor;
  idPagamento: string | null;
  codigoPix: string | null; // Pix copia e cola
  imagemQrCode: string | null; // data URL da imagem do QR
  /**
   * Código do vendedor que trouxe esta venda, ou `null` para venda direta.
   *
   * Pedido antigo não tem o campo, e por isso toda leitura normaliza para
   * `null` — um `undefined` vazando daqui viraria a string "undefined" na
   * chave de agrupamento do ranking.
   */
  vendedor: string | null;
}

/**
 * Quem vendeu.
 *
 * O `codigo` é o que aparece no link pessoal (`/v/joao-silva`) e é o que fica
 * gravado no pedido — nunca o nome. Nome muda (apelido, grafia, casamento) e
 * um histórico de vendas amarrado a texto livre se perde na primeira correção
 * de digitação.
 */
export interface Vendedor {
  codigo: string;
  nome: string;
  ativo: boolean;
  criadoEm: number;
}

/** Pagamento que entrou sem cota disponível para entregar. */
export interface Conflito {
  pedido: string;
  pagamento: string | null;
  cotas: number;
  valor: number;
  nome: string;
  whatsapp: string;
  motivo: string;
  quando: number;
}

/* ------------------------------------------------------------- Chaves --- */

const K = {
  cursor: "rifa:cursor",
  livres: "rifa:livres",
  todos: "rifa:pedidos",
  numeros: "rifa:numeros", // hash: número -> id do pedido dono
  conflitos: "rifa:conflitos",
  pedido: (id: string) => `rifa:pedido:${id}`,
  porPagamento: (idPagamento: string) => `rifa:pagamento:${idPagamento}`,
  decisao: (id: string) => `rifa:decisao:${id}`,
  pendentesCpf: (cpf: string) => `rifa:pendentes:${cpf}`,
  limite: (chave: string) => `rifa:limite:${chave}`,
  conflitoVisto: (chave: string) => `rifa:conflito:${chave}`,
  vendedores: "rifa:vendedores", // hash: código -> JSON do vendedor
} as const;

/* ---------------------------------------------------------------- Redis -- */

const URL_REDIS = process.env.UPSTASH_REDIS_REST_URL?.trim();
const TOKEN_REDIS = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

export const usandoRedis = Boolean(URL_REDIS && TOKEN_REDIS);

/**
 * Teto por comando.
 *
 * Sem isto, um comando pendurado pode sobreviver ao TTL da trava de decisão
 * (60s) e voltar à vida depois que outro processo já assumiu o pedido — é o
 * caminho clássico para dois processos se acharem donos ao mesmo tempo.
 */
const TIMEOUT_REDIS_MS = 8_000;

async function redis<T = unknown>(...cmd: (string | number)[]): Promise<T> {
  const res = await fetch(URL_REDIS!, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN_REDIS}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(cmd.map(String)),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_REDIS_MS),
  });
  if (!res.ok) throw new Error(`Redis ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { result: T; error?: string };
  if (json.error) throw new Error(`Redis: ${json.error}`);
  return json.result;
}

/* ------------------------------------------------------------- Scripts --- */

/**
 * Reserva `n` números no contador, mas SÓ se couberem no total da rifa.
 *
 * Existe como script (roda inteiro dentro do Redis, sem viagem de rede no
 * meio) porque a alternativa — INCRBY e, se estourar, DECRBY — tem dois
 * defeitos graves: entre os dois comandos o contador fica inflado e faz outro
 * comprador legítimo ver "esgotado"; e se o DECRBY falhar, a rifa fica
 * permanentemente contando cotas que ninguém comprou, sem jeito de voltar.
 *
 * Devolve o último número reservado, ou -1 quando não cabe.
 */
const SCRIPT_RESERVAR_CURSOR = `
local quantos = tonumber(ARGV[1])
local total = tonumber(ARGV[2])
local atual = tonumber(redis.call('GET', KEYS[1]) or '0')
if atual + quantos > total then return -1 end
return redis.call('INCRBY', KEYS[1], quantos)
`.trim();

/**
 * Solta a trava SÓ se ela ainda for minha (compara o dono antes de apagar).
 *
 * Um `DEL` cego apagaria a trava de outro processo quando a nossa já tivesse
 * vencido por TTL — e aí dois processos escrevem o mesmo pedido achando que
 * são donos.
 */
const SCRIPT_SOLTAR_TRAVA = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`.trim();

/**
 * Registra uma venda que aconteceu fora do checkout, com os números que o
 * organizador informa. Tudo acontece no mesmo script: conferir dono, ocupar
 * os números, avançar o cursor e gravar o pedido. Separar essas etapas em
 * chamadas HTTP deixaria duas pessoas do painel conseguirem registrar o mesmo
 * número no intervalo entre a leitura e a escrita.
 */
const SCRIPT_REGISTRAR_VENDA_MANUAL = `
local total = tonumber(ARGV[1])
local id = ARGV[2]
local pedido = ARGV[3]
local cursor = tonumber(redis.call('GET', KEYS[1]) or '0')

if redis.call('EXISTS', KEYS[4]) == 1 then return {0, 'pedido', id} end

for i = 4, #ARGV do
  local numero = tonumber(ARGV[i])
  if not numero or numero < 1 or numero > total then
    return {0, 'invalido', ARGV[i]}
  end
  if redis.call('HGET', KEYS[3], ARGV[i]) then
    return {0, 'ocupado', ARGV[i]}
  end
end

for i = 4, #ARGV do
  local numero = tonumber(ARGV[i])
  if numero <= cursor then
    if redis.call('LREM', KEYS[2], 1, ARGV[i]) ~= 1 then
      return {0, 'indisponivel', ARGV[i]}
    end
  else
    for livre = cursor + 1, numero - 1 do
      redis.call('RPUSH', KEYS[2], tostring(livre))
    end
    cursor = numero
    redis.call('SET', KEYS[1], tostring(cursor))
  end
end

local pares = {}
for i = 4, #ARGV do
  table.insert(pares, ARGV[i])
  table.insert(pares, id)
end
redis.call('HSET', KEYS[3], unpack(pares))
redis.call('SET', KEYS[4], pedido)
redis.call('RPUSH', KEYS[5], id)
return {1}
`.trim();

/* --------------------------------------------------- Memória (fallback) -- */

interface Memoria {
  cursor: number;
  livres: number[];
  pedidos: Map<string, Pedido>;
  porPagamento: Map<string, string>;
  numeros: Map<string, string>; // número -> id do pedido
  decisoes: Map<string, { cracha: string; venceEm: number }>
  todos: string[];
  conflitos: Conflito[];
  conflitosVistos: Set<string>;
  pendentesPorCpf: Map<string, Map<string, number>>;
  limites: Map<string, Array<{ quando: number; marca: string }>>;
  vendedores: Map<string, Vendedor>;
}

// Guardado no globalThis para que as rotas de API e as páginas — que o Next
// empacota separadamente — enxerguem os mesmos dados dentro do mesmo processo.
const global_ = globalThis as unknown as { __rifaMem?: Memoria };

const mem: Memoria = (global_.__rifaMem ??= {
  cursor: 0,
  livres: [],
  pedidos: new Map<string, Pedido>(),
  porPagamento: new Map<string, string>(),
  numeros: new Map<string, string>(),
  decisoes: new Map<string, { cracha: string; venceEm: number }>(),
  todos: [],
  conflitos: [],
  conflitosVistos: new Set<string>(),
  vendedores: new Map<string, Vendedor>(),
  pendentesPorCpf: new Map<string, Map<string, number>>(),
  limites: new Map<string, Array<{ quando: number; marca: string }>>(),
});

/* ------------------------------------------------------------ Primitivas - */

async function pegarLivres(qtd: number): Promise<number[]> {
  if (!usandoRedis) return mem.livres.splice(0, qtd);
  const r = await redis<string[] | null>("LPOP", K.livres, qtd);
  return (r ?? []).map(Number);
}

async function devolverLivres(numeros: number[]): Promise<void> {
  if (!numeros.length) return;
  if (!usandoRedis) {
    mem.livres.push(...numeros);
    mem.livres.sort((a, b) => a - b);
    return;
  }
  await redis("RPUSH", K.livres, ...numeros);
}

async function contarLivres(): Promise<number> {
  if (!usandoRedis) return mem.livres.length;
  return Number(await redis<number>("LLEN", K.livres));
}

/**
 * Avança o contador em `qtd` — ou devolve -1 se não couber no total.
 *
 * Decisão atômica: nunca existe um instante em que o contador esteja acima do
 * total, então não há nada para desfazer e nenhum outro comprador vê a rifa
 * momentaneamente esgotada.
 */
async function reservarNoCursor(qtd: number): Promise<number> {
  if (!usandoRedis) {
    // O fallback roda num único processo JavaScript: isto já é atômico.
    if (mem.cursor + qtd > RIFA.totalCotas) return -1;
    mem.cursor += qtd;
    return mem.cursor;
  }
  return Number(
    await redis<number>(
      "EVAL",
      SCRIPT_RESERVAR_CURSOR,
      1,
      K.cursor,
      qtd,
      RIFA.totalCotas
    )
  );
}

async function lerCursor(): Promise<number> {
  if (!usandoRedis) return mem.cursor;
  return Number((await redis<string | null>("GET", K.cursor)) ?? 0);
}

/* -------------------------------------------------------------- Pedidos -- */

/**
 * Grava o pedido.
 *
 * `indexarPagamento` existe por um motivo de dinheiro, não de desempenho: a
 * gravação do pedido e a do índice por pagamento são DOIS comandos, e a
 * segunda pode falhar depois de a primeira ter valido. Quando o pedido está
 * virando "pago", quem chama precisa saber exatamente o que foi escrito para
 * decidir se compensa ou não — então ali gravamos só o pedido, num único
 * comando, e o índice (que já existe desde a criação) fica de fora.
 */
export async function salvarPedido(
  pedido: Pedido,
  indexarPagamento = true
): Promise<void> {
  if (!usandoRedis) {
    mem.pedidos.set(pedido.id, pedido);
    if (indexarPagamento && pedido.idPagamento) {
      mem.porPagamento.set(pedido.idPagamento, pedido.id);
    }
    return;
  }
  await redis("SET", K.pedido(pedido.id), JSON.stringify(pedido));
  if (indexarPagamento && pedido.idPagamento) {
    await redis("SET", K.porPagamento(pedido.idPagamento), pedido.id);
  }
}

/** Registra o pedido na lista geral (uma vez só, na criação). */
export async function indexarPedido(id: string): Promise<void> {
  if (!usandoRedis) {
    if (!mem.todos.includes(id)) mem.todos.push(id);
    return;
  }
  await redis("RPUSH", K.todos, id);
}

export async function buscarPedido(id: string): Promise<Pedido | null> {
  if (!usandoRedis) return mem.pedidos.get(id) ?? null;
  const bruto = await redis<string | null>("GET", K.pedido(id));
  if (!bruto) return null;
  const pedido = JSON.parse(bruto) as Pedido;
  // Pedidos criados antes do cadastro de vendedores não têm o campo.
  return { ...pedido, vendedor: pedido.vendedor ?? null };
}

export async function buscarPedidoPorPagamento(
  idPagamento: string
): Promise<Pedido | null> {
  if (!usandoRedis) {
    const id = mem.porPagamento.get(idPagamento);
    return id ? (mem.pedidos.get(id) ?? null) : null;
  }
  const id = await redis<string | null>("GET", K.porPagamento(idPagamento));
  return id ? buscarPedido(id) : null;
}

/** Ids dos pedidos, do mais novo para o mais antigo. */
export async function listarIdsPedidos(limite = 500): Promise<string[]> {
  if (!usandoRedis) return mem.todos.slice(-limite).reverse();
  const ids = await redis<string[] | null>("LRANGE", K.todos, -limite, -1);
  return (ids ?? []).reverse();
}

/* ---------------------------------------------------------- Vendedores --- */

/**
 * Todos os vendedores cadastrados, em ordem alfabética.
 *
 * Um hash só, lido de uma vez. Com 48 vendedores isso é uma ida ao Redis;
 * uma chave por vendedor seriam 48 idas a cada carregamento da lista do
 * checkout, na hora em que o site estiver mais cheio.
 */
export async function listarVendedores(): Promise<Vendedor[]> {
  const ordenar = (lista: Vendedor[]): Vendedor[] =>
    [...lista].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  if (!usandoRedis) return ordenar([...mem.vendedores.values()]);

  const bruto = await redis<unknown>("HGETALL", K.vendedores);
  const lista: Vendedor[] = [];

  /* O HGETALL do Upstash chega como lista achatada (campo, valor, campo,
     valor...), mas alguns proxies devolvem objeto. Aceitar os dois formatos
     custa cinco linhas e evita um painel vazio sem nenhuma mensagem de erro. */
  if (Array.isArray(bruto)) {
    for (let i = 0; i + 1 < bruto.length; i += 2) {
      lista.push(JSON.parse(String(bruto[i + 1])) as Vendedor);
    }
  } else if (bruto && typeof bruto === "object") {
    for (const valor of Object.values(bruto as Record<string, string>)) {
      lista.push(
        typeof valor === "string" ? (JSON.parse(valor) as Vendedor) : (valor as Vendedor)
      );
    }
  }

  return ordenar(lista);
}

export async function buscarVendedor(codigo: string): Promise<Vendedor | null> {
  if (!usandoRedis) return mem.vendedores.get(codigo) ?? null;
  const bruto = await redis<string | null>("HGET", K.vendedores, codigo);
  return bruto ? (JSON.parse(bruto) as Vendedor) : null;
}

export async function salvarVendedor(vendedor: Vendedor): Promise<void> {
  if (!usandoRedis) {
    mem.vendedores.set(vendedor.codigo, vendedor);
    return;
  }
  await redis("HSET", K.vendedores, vendedor.codigo, JSON.stringify(vendedor));
}

/**
 * Tira o vendedor da lista do checkout sem apagar o cadastro.
 *
 * Apagar de verdade quebraria o histórico: as vendas já feitas guardam o
 * código, e sem o cadastro o ranking mostraria um código solto no lugar do
 * nome de quem vendeu.
 */
export async function desativarVendedor(codigo: string): Promise<boolean> {
  const vendedor = await buscarVendedor(codigo);
  if (!vendedor) return false;
  await salvarVendedor({ ...vendedor, ativo: false });
  return true;
}

export async function reativarVendedor(codigo: string): Promise<boolean> {
  const vendedor = await buscarVendedor(codigo);
  if (!vendedor) return false;
  await salvarVendedor({ ...vendedor, ativo: true });
  return true;
}

/* ------------------------------------------------------------- Números --- */

export class CotasEsgotadas extends Error {
  constructor(public disponiveis: number) {
    super("Não há cotas suficientes disponíveis.");
  }
}

/**
 * Atribui de forma atômica os próximos `qtd` números.
 *
 * Chamada SÓ dentro da confirmação de pagamento, com a trava do pedido na
 * mão. Primeiro reaproveita números devolvidos por estorno (LPOP), depois
 * avança o contador sequencial (INCRBY). Os dois comandos são atômicos, então
 * dois pagamentos simultâneos nunca recebem o mesmo número.
 */
export async function atribuirNumeros(qtd: number): Promise<number[]> {
  const reciclados = await pegarLivres(qtd);

  try {
    const faltam = qtd - reciclados.length;
    if (faltam <= 0) return reciclados.sort((a, b) => a - b);

    const fim = await reservarNoCursor(faltam);
    if (fim < 0) {
      const emitidos = await lerCursor();
      throw new CotasEsgotadas(
        Math.max(0, RIFA.totalCotas - emitidos) + reciclados.length
      );
    }

    const novos: number[] = [];
    for (let n = fim - faltam + 1; n <= fim; n++) novos.push(n);
    return [...reciclados, ...novos].sort((a, b) => a - b);
  } catch (e) {
    /* Tirei números da fila de devolvidos e não vou usá-los: devolver é
       obrigatório. Se ATÉ ISSO falhar, os números somem da rifa em silêncio —
       por isso o erro é gritado no log em vez de engolido. */
    try {
      await devolverLivres(reciclados);
    } catch (falha) {
      console.error(
        "GRAVE: não devolvi números reciclados à rifa:",
        reciclados,
        falha
      );
    }
    throw e;
  }
}

/** Número que já pertence a uma venda ou não está mais livre para registro. */
export class NumeroIndisponivel extends Error {
  constructor(public numero: number) {
    super(`O número ${numero} já está vendido ou não está disponível.`);
  }
}

/**
 * Registra uma venda paga fora do checkout usando os números exatos vendidos.
 *
 * Este é o caminho de migração para vendas que já aconteceram no papel, no
 * WhatsApp ou por Pix direto. O pedido entra como pago, alimenta o placar do
 * vendedor e ocupa os mesmos índices usados pelo sorteio e pelo checkout.
 */
export async function registrarVendaManual(pedido: Pedido): Promise<void> {
  const numeros = [...pedido.numeros].sort((a, b) => a - b);
  if (
    pedido.status !== "pago" ||
    pedido.provedor !== "manual" ||
    pedido.cotas !== numeros.length ||
    numeros.length === 0 ||
    numeros.some(
      (n, i) =>
        !Number.isInteger(n) ||
        n < 1 ||
        n > RIFA.totalCotas ||
        (i > 0 && numeros[i - 1] === n)
    )
  ) {
    throw new Error("Venda manual inválida.");
  }

  const manual: Pedido = { ...pedido, numeros };

  if (!usandoRedis) {
    if (mem.pedidos.has(manual.id)) throw new Error("Venda manual duplicada.");

    for (const numero of numeros) {
      if (mem.numeros.has(String(numero))) throw new NumeroIndisponivel(numero);
      if (numero <= mem.cursor && !mem.livres.includes(numero)) {
        throw new NumeroIndisponivel(numero);
      }
    }

    for (const numero of numeros) {
      if (numero <= mem.cursor) {
        mem.livres.splice(mem.livres.indexOf(numero), 1);
      } else {
        for (let livre = mem.cursor + 1; livre < numero; livre++) {
          mem.livres.push(livre);
        }
        mem.cursor = numero;
      }
      mem.numeros.set(String(numero), manual.id);
    }
    mem.livres.sort((a, b) => a - b);
    mem.pedidos.set(manual.id, manual);
    mem.todos.push(manual.id);
    limparCacheResumo();
    return;
  }

  const resultado = await redis<Array<string | number>>(
    "EVAL",
    SCRIPT_REGISTRAR_VENDA_MANUAL,
    5,
    K.cursor,
    K.livres,
    K.numeros,
    K.pedido(manual.id),
    K.todos,
    RIFA.totalCotas,
    manual.id,
    JSON.stringify(manual),
    ...numeros
  );

  if (Number(resultado[0]) !== 1) {
    const numero = Number(resultado[2]);
    if (Number.isInteger(numero)) throw new NumeroIndisponivel(numero);
    throw new Error("Não foi possível registrar a venda manual.");
  }
  limparCacheResumo();
}

/** Estorno: devolve números para a rifa (só em falha depois de atribuir). */
export async function liberarNumeros(numeros: number[]): Promise<void> {
  await devolverLivres(numeros);
}

/**
 * Índice número -> pedido, gravado na confirmação.
 * É o que permite ao organizador achar o ganhador pelo número sorteado sem
 * varrer a base inteira. Um único HSET, mesmo para 50 números.
 */
async function indexarNumeros(id: string, numeros: number[]): Promise<void> {
  if (!numeros.length) return;
  if (!usandoRedis) {
    for (const n of numeros) mem.numeros.set(String(n), id);
    return;
  }
  const pares: (string | number)[] = [];
  for (const n of numeros) pares.push(n, id);
  await redis("HSET", K.numeros, ...pares);
}

/** Apaga o índice de números de um pedido (usado no estorno). */
async function desindexarNumeros(numeros: number[]): Promise<void> {
  if (!numeros.length) return;
  if (!usandoRedis) {
    for (const n of numeros) mem.numeros.delete(String(n));
    return;
  }
  await redis("HDEL", K.numeros, ...numeros);
}

async function donoDoNumero(numero: number): Promise<string | null> {
  if (!usandoRedis) return mem.numeros.get(String(numero)) ?? null;
  return await redis<string | null>("HGET", K.numeros, numero);
}

/**
 * Pedido dono de um número — usado para achar o ganhador do sorteio.
 *
 * O índice é só um atalho; a verdade é o pedido. Por isso a resposta só sai
 * depois de conferir que o pedido está PAGO e que o número está mesmo na lista
 * dele. Assim uma entrada de índice sobrando de um estorno nunca aponta um
 * ganhador que não pagou.
 */
export async function pedidoDoNumero(numero: number): Promise<Pedido | null> {
  if (!Number.isInteger(numero) || numero < 1 || numero > RIFA.totalCotas) {
    return null;
  }
  const id = await donoDoNumero(numero);
  if (!id) return null;
  const pedido = await buscarPedido(id);
  if (!pedido || pedido.status !== "pago") return null;
  return pedido.numeros.includes(numero) ? pedido : null;
}

/* -------------------------------------------------- Pendentes por CPF ---- */

/**
 * Devolve a vaga de "pedido pendente" do CPF.
 *
 * Chamada quando o pedido sai de pendente e em todo caminho de erro da
 * criação. É idempotente: remover duas vezes não faz mal.
 */
export async function liberarVagaPendente(
  cpf: string,
  id: string
): Promise<void> {
  if (!usandoRedis) {
    mem.pendentesPorCpf.get(cpf)?.delete(id);
    return;
  }
  await redis("ZREM", K.pendentesCpf(cpf), id);
}

export interface VagaPendente {
  permitido: boolean;
  usados: number;
  limite: number;
}

/**
 * Reserva, de forma ATÔMICA, uma das vagas de pedido pendente do CPF.
 *
 * Já não existe risco de travar a rifa (pedido pendente não segura número),
 * mas o teto continua valendo como freio de abuso: sem ele, um laço trivial
 * gera milhares de cobranças Pix no gateway em segundos.
 *
 * Mesmo padrão do `consumirLimite`: grava a marca e decide pela POSIÇÃO dela
 * na fila (`ZRANK`), nunca pelo total. Contar antes de gravar (`ZCARD`) perde
 * sob rajada — dez requisições simultâneas leem "zero pendentes" ao mesmo
 * tempo e todas passam.
 */
export async function reservarVagaPendente(
  cpf: string,
  id: string,
  expiraEm: number,
  maximo: number
): Promise<VagaPendente> {
  const agora = Date.now();

  if (!usandoRedis) {
    const doCpf = mem.pendentesPorCpf.get(cpf) ?? new Map<string, number>();
    for (const [outro, vence] of [...doCpf.entries()]) {
      if (vence <= agora) doCpf.delete(outro);
    }
    doCpf.set(id, expiraEm);
    mem.pendentesPorCpf.set(cpf, doCpf);
    const posicao = [...doCpf.entries()]
      .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
      .findIndex(([outro]) => outro === id);
    if (posicao >= maximo) {
      doCpf.delete(id);
      return { permitido: false, usados: posicao, limite: maximo };
    }
    return { permitido: true, usados: posicao + 1, limite: maximo };
  }

  await redis("ZREMRANGEBYSCORE", K.pendentesCpf(cpf), "-inf", agora);
  await redis("ZADD", K.pendentesCpf(cpf), expiraEm, id);
  const posicao = await redis<number | null>("ZRANK", K.pendentesCpf(cpf), id);
  const lugar = posicao === null ? 0 : Number(posicao);

  if (lugar >= maximo) {
    await redis("ZREM", K.pendentesCpf(cpf), id);
    return { permitido: false, usados: lugar, limite: maximo };
  }
  return { permitido: true, usados: lugar + 1, limite: maximo };
}

/** Quantos pedidos pendentes (ainda no prazo) este CPF tem em aberto. */
export async function pendentesDoCpf(cpf: string): Promise<number> {
  const agora = Date.now();
  if (!usandoRedis) {
    const doCpf = mem.pendentesPorCpf.get(cpf);
    if (!doCpf) return 0;
    for (const [id, vence] of [...doCpf.entries()]) {
      if (vence <= agora) doCpf.delete(id);
    }
    return doCpf.size;
  }
  await redis("ZREMRANGEBYSCORE", K.pendentesCpf(cpf), "-inf", agora);
  return Number(await redis<number>("ZCARD", K.pendentesCpf(cpf)));
}

/* ------------------------------------------------------------ Confirmar -- */

export interface ResultadoConfirmacao {
  pedido: Pedido;
  /** `true` só para a chamada que de fato confirmou (as outras são eco). */
  confirmou: boolean;
  /** Pagamento entrou e não havia cota para entregar: precisa de reembolso. */
  semCotas: boolean;
  /**
   * Não deu para decidir agora (a trava está com outro e o pedido ainda não
   * tem desfecho). Quem chamou NÃO pode tratar como sucesso: o webhook
   * devolve 500 para o Mercado Pago reenviar.
   */
  indefinido: boolean;
}

/**
 * Tempo de vida da trava de decisão.
 *
 * A seção crítica do vencedor são ~6 comandos Redis (sub-segundo). 60s é
 * folga enorme e, principalmente, garante que uma trava órfã — deixada por um
 * processo que morreu no meio — não bloqueie o pagamento para sempre. Sem TTL,
 * o pedido ficava travado, o webhook respondia 200, o MP parava de reenviar e
 * o dinheiro sumia sem rastro.
 *
 * Não reabre a porta para contagem dupla porque, depois de pegar a trava,
 * `confirmarPagamento` relê o pedido e só age se ele ainda não tiver desfecho.
 */
export const TTL_TRAVA_SEGUNDOS = 60;

/**
 * Interpreta a resposta do `SET ... NX`.
 *
 * O Redis devolve `OK` ou Null e o Upstash REST mapeia para `"OK"`/`null`.
 * Aceitar só `"OK"` deixaria o caminho do dinheiro parado e em silêncio se
 * algum cliente devolvesse `1`. Aqui: nulo/0/false = não peguei; qualquer
 * outra coisa = peguei.
 */
function travaObtida(resposta: unknown): boolean {
  if (resposta === null || resposta === undefined) return false;
  if (resposta === 0 || resposta === false || resposta === "0") return false;
  return true;
}

/**
 * Trava atômica com validade. Devolve o CRACHÁ do dono, ou `null` se outro
 * chegou antes.
 *
 * O crachá não é enfeite: sem ele, soltar a trava é um `DEL` cego, e um
 * processo lento que volta à vida depois do TTL apaga a trava de quem assumiu
 * o pedido no lugar dele — abrindo caminho para dois processos gravarem o
 * mesmo pedido achando que são donos.
 */
async function travarDecisao(id: string): Promise<string | null> {
  const cracha = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  if (!usandoRedis) {
    const atual = mem.decisoes.get(id);
    if (atual && atual.venceEm > Date.now()) return null;
    mem.decisoes.set(id, {
      cracha,
      venceEm: Date.now() + TTL_TRAVA_SEGUNDOS * 1000,
    });
    return cracha;
  }

  const r = await redis<unknown>(
    "SET",
    K.decisao(id),
    cracha,
    "NX",
    "EX",
    TTL_TRAVA_SEGUNDOS
  );
  return travaObtida(r) ? cracha : null;
}

/** Solta a trava só se ela ainda for nossa. */
async function destravarDecisao(id: string, cracha: string): Promise<void> {
  if (!usandoRedis) {
    if (mem.decisoes.get(id)?.cracha === cracha) mem.decisoes.delete(id);
    return;
  }
  await redis("EVAL", SCRIPT_SOLTAR_TRAVA, 1, K.decisao(id), cracha);
}

/** Desfecho definitivo: só `pago` e `reembolsar` encerram o pedido. */
const temDesfecho = (p: Pedido): boolean =>
  p.status === "pago" || p.status === "reembolsar";

/** Espera curta para quem perdeu a trava: dá tempo do vencedor escrever. */
async function esperarDesfecho(
  id: string,
  tentativas = 8
): Promise<Pedido | null> {
  for (let i = 0; i < tentativas; i++) {
    const atual = await buscarPedido(id);
    if (atual && temDesfecho(atual)) return atual;
    await new Promise((r) => setTimeout(r, 40));
  }
  return buscarPedido(id);
}

/**
 * Confirma o pagamento de um pedido e SÓ ENTÃO atribui os números.
 *
 * Idempotente de verdade, inclusive sob concorrência: o webhook do Mercado
 * Pago, o polling do comprador e o render no servidor podem chamar isto ao
 * mesmo tempo que os números são atribuídos UMA vez.
 *
 * Pix vencido não impede nada: como o pedido não segurava número, pagar no
 * limite continua valendo enquanto houver cota. O único caminho ruim é a rifa
 * ter esgotado no intervalo — aí o pedido vira `reembolsar` e entra na fila de
 * conciliação, nunca em cota vendida.
 */
export async function confirmarPagamento(
  pedido: Pedido
): Promise<ResultadoConfirmacao> {
  // Defesa em profundidade: nunca decide o que já tem desfecho.
  if (pedido.status === "pago") {
    return { pedido, confirmou: false, semCotas: false, indefinido: false };
  }
  if (pedido.status === "reembolsar") {
    return { pedido, confirmou: false, semCotas: true, indefinido: false };
  }

  const cracha = await travarDecisao(pedido.id);
  if (!cracha) {
    // Alguém está decidindo este pedido agora: espera o desfecho dele.
    const atual = (await esperarDesfecho(pedido.id)) ?? pedido;
    // Sem desfecho NÃO é sucesso — pode ser trava órfã de um processo que
    // morreu. Quem chamou precisa insistir (o webhook devolve 500).
    return {
      pedido: atual,
      confirmou: false,
      semCotas: atual.status === "reembolsar",
      indefinido: !temDesfecho(atual),
    };
  }

  // A partir daqui somos o único decisor deste pedido.
  const atual = (await buscarPedido(pedido.id)) ?? pedido;
  if (temDesfecho(atual)) {
    // Herdamos uma trava vencida de um pedido já decidido: nada a fazer, e —
    // principalmente — nada é atribuído nem contado de novo.
    return {
      pedido: atual,
      confirmou: false,
      semCotas: atual.status === "reembolsar",
      indefinido: false,
    };
  }

  /* Atribuição atômica. É o único lugar do sistema que consome número. */
  let numeros: number[];
  try {
    numeros = await atribuirNumeros(atual.cotas);
  } catch (e) {
    if (e instanceof CotasEsgotadas) {
      /* Dinheiro entrou e a rifa acabou no intervalo. Marca para reembolso e
         NÃO destrava: o estado já é definitivo, e uma nova tentativa lê
         `reembolsar` e sai pelo atalho lá em cima. */
      const paraReembolso: Pedido = {
        ...atual,
        status: "reembolsar",
        pagoEm: Date.now(),
      };

      try {
        await salvarPedido(paraReembolso, false);
      } catch (falha) {
        /* Não gravou: o estado NÃO é definitivo, então segurar a trava só faria
           as retentativas do Mercado Pago baterem numa porta fechada por 60s
           enquanto o pagamento segue sem registro nenhum. */
        console.error("Falha ao marcar o pedido para reembolso:", falha);
        await destravarDecisao(atual.id, cracha).catch(() => {});
        return {
          pedido: atual,
          confirmou: false,
          semCotas: false,
          indefinido: true,
        };
      }

      /* Daqui para baixo o desfecho já está gravado e é definitivo: nada pode
         virar exceção, ou a tela do comprador quebraria em cima de um pedido
         que o sistema já resolveu. */
      await registrarConflito(
        paraReembolso,
        "pagamento confirmado sem cota disponível — reembolsar",
        "reembolso"
      ).catch((falha) => {
        console.error("GRAVE: reembolso não entrou na fila de conflitos:", falha);
      });
      await liberarVagaPendente(paraReembolso.cpf, paraReembolso.id).catch(
        (falha) => console.error("Falha ao liberar a vaga de pendente:", falha)
      );

      return {
        pedido: paraReembolso,
        confirmou: false,
        semCotas: true,
        indefinido: false,
      };
    }
    // Falha de infraestrutura: nenhum número foi consumido (`atribuirNumeros`
    // devolve o que pegou). Destrava para a próxima tentativa decidir.
    await destravarDecisao(atual.id, cracha).catch(() => {});
    console.error("Falha ao atribuir números:", e);
    return { pedido: atual, confirmou: false, semCotas: false, indefinido: true };
  }

  const pago: Pedido = {
    ...atual,
    status: "pago",
    pagoEm: Date.now(),
    numeros,
  };

  /* A ORDEM AQUI É DE SEGURANÇA, NÃO DE ESTILO.
     Primeiro o índice, depois o pedido — e o pedido num ÚNICO comando
     (`indexarPagamento: false`, o índice por pagamento já existe desde a
     criação). Assim "pedido virou pago" é um evento atômico: ou aconteceu, ou
     não. Se fossem dois comandos, o segundo poderia falhar com o pedido já
     gravado como pago, e a compensação devolveria à rifa números que o
     comprador já está vendo na tela — venda dupla. */
  try {
    await indexarNumeros(pago.id, numeros);
    await salvarPedido(pago, false);
  } catch (e) {
    console.error("Falha ao registrar o pedido pago:", e);
    return compensarConfirmacao(atual, pago, numeros, cracha);
  }

  await liberarVagaPendente(pago.cpf, pago.id).catch((falha) => {
    console.error("Falha ao liberar a vaga de pendente:", falha);
  });
  return { pedido: pago, confirmou: true, semCotas: false, indefinido: false };
}

/**
 * Desfaz uma confirmação que não conseguiu se registrar por inteiro.
 *
 * O primeiro passo é RELER o pedido — e não confiar no erro. Uma falha de rede
 * pode significar "não gravou" ou "gravou e a resposta se perdeu", e os dois
 * casos pedem o oposto um do outro. Devolver à rifa números de um pedido que
 * FOI gravado como pago é o pior desfecho possível: o comprador vê os números
 * na tela e outra pessoa compra os mesmos.
 */
async function compensarConfirmacao(
  anterior: Pedido,
  pago: Pedido,
  numeros: number[],
  cracha: string
): Promise<ResultadoConfirmacao> {
  let gravado: Pedido | null = null;
  try {
    gravado = await buscarPedido(pago.id);
  } catch (falha) {
    console.error("Falha ao reler o pedido para compensar:", falha);
  }

  if (gravado?.status === "pago") {
    // Gravou, sim: a escrita valeu e só a resposta se perdeu. Nada a desfazer —
    // mas o caminho feliz normal ainda não rodou, então a vaga de cobrança
    // aberta deste CPF continua ocupada se não a liberarmos aqui.
    await liberarVagaPendente(gravado.cpf, gravado.id).catch((falha) =>
      console.error("Falha ao liberar a vaga de pendente:", falha)
    );
    return { pedido: gravado, confirmou: true, semCotas: false, indefinido: false };
  }

  if (gravado === null) {
    /* Não sabemos o que ficou gravado. Devolver números aqui pode duplicar
       venda; não devolver, no pior caso, deixa cotas encalhadas. Diante da
       dúvida escolhemos o erro que NÃO cria dois donos para o mesmo número, e
       deixamos o caso na fila do organizador. */
    await registrarConflito(
      pago,
      "confirmação interrompida: conferir à mão se o pedido ficou pago",
      "compensacao"
    ).catch((falha) => console.error("Conflito não registrado:", falha));
    await destravarDecisao(pago.id, cracha).catch(() => {});
    return { pedido: anterior, confirmou: false, semCotas: false, indefinido: true };
  }

  /* O pedido continua no estado antigo: a gravação não valeu. Aí sim os
     números são nossos para devolver. */
  try {
    await desindexarNumeros(numeros);
    await liberarNumeros(numeros);
  } catch (falha) {
    console.error("GRAVE: números não voltaram para a rifa:", numeros, falha);
    await registrarConflito(
      pago,
      "números não devolvidos após falha de gravação — conferir o total",
      "estorno"
    ).catch((outra) => console.error("Conflito não registrado:", outra));
  }
  await destravarDecisao(pago.id, cracha).catch(() => {});
  return { pedido: anterior, confirmou: false, semCotas: false, indefinido: true };
}

/**
 * Marca um pedido pendente como expirado (o Pix venceu sem pagamento).
 *
 * Não devolve número nenhum, porque nenhum foi entregue. E DESTRAVA ao final:
 * `expirado` não é desfecho definitivo — se o Pix cair depois, a confirmação
 * ainda atribui os números normalmente.
 */
export async function expirarPedido(pedido: Pedido): Promise<Pedido> {
  if (pedido.status !== "pendente") return pedido;

  const cracha = await travarDecisao(pedido.id);
  if (!cracha) {
    // Outro processo está decidindo: devolve o estado real, sem interferir.
    return (await buscarPedido(pedido.id)) ?? pedido;
  }

  try {
    const atual = (await buscarPedido(pedido.id)) ?? pedido;
    if (atual.status !== "pendente") return atual;

    const expirado: Pedido = { ...atual, status: "expirado" };
    await salvarPedido(expirado, false);
    await liberarVagaPendente(expirado.cpf, expirado.id).catch((falha) => {
      console.error("Falha ao liberar a vaga de pendente:", falha);
    });
    return expirado;
  } finally {
    await destravarDecisao(pedido.id, cracha).catch(() => {});
  }
}

/* ----------------------------------------------------------- Conflitos --- */

/**
 * Grava um conflito de conciliação, sem duplicar.
 *
 * A deduplicação é a mesma nos dois caminhos: um marcador `SET NX` (memória:
 * um Set) decide quem escreve. Antes, a memória deduplicava e o Redis dava
 * RPUSH cego — a mesma notificação reenviada virava várias linhas na planilha
 * do organizador.
 */
async function gravarConflito(chave: string, conflito: Conflito): Promise<void> {
  if (!usandoRedis) {
    if (mem.conflitosVistos.has(chave)) return;
    mem.conflitosVistos.add(chave);
    mem.conflitos.push(conflito);
    return;
  }
  const primeiro = await redis<unknown>("SET", K.conflitoVisto(chave), "1", "NX");
  if (!travaObtida(primeiro)) return;

  try {
    await redis("RPUSH", K.conflitos, JSON.stringify(conflito));
  } catch (e) {
    /* Marca gravada e linha não: a próxima tentativa veria a marca e sairia
       calada, e o conflito sumiria para sempre. Solta a marca — linha
       duplicada na planilha é incomparavelmente mais barata que dinheiro que
       ninguém sabe que precisa devolver. */
    await redis("DEL", K.conflitoVisto(chave)).catch(() => {});
    throw e;
  }
}

/**
 * Classe do conflito. Entra na chave de deduplicação porque um mesmo pedido
 * pode precisar de DOIS avisos diferentes ao organizador — "confira se ficou
 * pago" e "devolva o dinheiro" pedem ações opostas. Com uma chave só, o
 * primeiro aviso engolia o segundo e a planilha mostrava o motivo errado.
 */
export type ClasseConflito = "reembolso" | "compensacao" | "estorno";

/** Pagamento que precisa de olho humano: entra na fila do organizador. */
export async function registrarConflito(
  pedido: Pedido,
  motivo: string,
  classe: ClasseConflito = "reembolso"
): Promise<void> {
  await gravarConflito(`pedido:${pedido.id}:${classe}`, {
    pedido: pedido.id,
    pagamento: pedido.idPagamento,
    cotas: pedido.cotas,
    valor: pedido.valor,
    nome: pedido.nome,
    whatsapp: pedido.whatsapp,
    motivo,
    quando: Date.now(),
  });
}

/** Pagamento aprovado que não achou pedido nenhum (dinheiro órfão). */
export async function registrarConflitoDePagamento(
  idPagamento: string,
  motivo: string
): Promise<void> {
  await gravarConflito(`pagamento:${idPagamento}`, {
    pedido: "(sem pedido)",
    pagamento: idPagamento,
    cotas: 0,
    valor: 0,
    nome: "",
    whatsapp: "",
    motivo,
    quando: Date.now(),
  });
}

export async function listarConflitos(limite = 200): Promise<Conflito[]> {
  if (!usandoRedis) return mem.conflitos.slice(-limite);
  const brutos = await redis<string[] | null>(
    "LRANGE",
    K.conflitos,
    -limite,
    -1
  );
  return (brutos ?? []).map((b) => JSON.parse(b) as Conflito);
}

/* -------------------------------------------------------------- Resumo --- */

/**
 * Cotas vendidas.
 *
 * Não existe contador separado: como número só é atribuído na confirmação do
 * pagamento, o próprio contador atômico da atribuição JÁ é o total vendido.
 * Um contador paralelo só criaria a chance de divergir do que foi entregue —
 * era exatamente esse o buraco da contagem dupla.
 *
 *   emitidos    = INCRBY rifa:cursor  (números já atribuídos)
 *   devolvidos  = LLEN rifa:livres    (voltaram por estorno)
 *   vendidas    = emitidos - devolvidos
 */
export async function cotasVendidas(): Promise<number> {
  /* Duas idas ao Redis em PARALELO, não em fila. São independentes, e com 48
     vendedores divulgando ao mesmo tempo cada milissegundo aqui é multiplicado
     por todo mundo que abrir a página. */
  const [emitidos, devolvidos] = await Promise.all([
    lerCursor(),
    contarLivres(),
  ]);
  return Math.max(0, emitidos - devolvidos);
}

export interface ResumoCotas {
  total: number;
  vendidas: number;
  disponiveis: number;
  percentual: number;
}

/**
 * Cache curtíssimo do resumo, dentro do processo.
 *
 * A home é a página mais visitada e o resumo é a única coisa que ela pede ao
 * banco. Numa divulgação simultânea dos 48 vendedores, sem isto cada visitante
 * gera duas idas ao Redis; com 3 segundos de memória, uma rajada de mil
 * acessos vira um punhado de consultas.
 *
 * O preço é a barra de progresso ficar até 3 segundos velha, o que é
 * invisível para quem lê e irrelevante para a decisão de comprar. A DECISÃO
 * de vender, essa nunca passa por aqui: quem atribui número é o pagamento
 * confirmado, com script atômico, sem olhar este cache.
 */
const VALIDADE_RESUMO_MS = 3_000;
let resumoGuardado: { em: number; valor: ResumoCotas } | null = null;

export async function resumo(): Promise<ResumoCotas> {
  const agora = Date.now();
  if (resumoGuardado && agora - resumoGuardado.em < VALIDADE_RESUMO_MS) {
    return resumoGuardado.valor;
  }

  const vendidas = await cotasVendidas();
  const disponiveis = Math.max(0, RIFA.totalCotas - vendidas);

  const valor: ResumoCotas = {
    total: RIFA.totalCotas,
    vendidas,
    disponiveis,
    percentual: Math.min(100, Math.round((vendidas / RIFA.totalCotas) * 100)),
  };
  resumoGuardado = { em: agora, valor };
  return valor;
}

/** Esquece o resumo guardado. Usado pelos testes, que viajam no tempo. */
export function limparCacheResumo(): void {
  resumoGuardado = null;
}

/* --------------------------------------------------------- Rate limit ---- */

export interface ResultadoLimite {
  permitido: boolean;
  usados: number;
  limite: number;
  /** Identificador da vaga reservada — devolva com `devolverLimite`. */
  marca: string | null;
}

/**
 * Janela deslizante — RESERVA uma vaga.
 *
 * Primeiro grava a marca, depois conta: é o `ZADD` que ordena os concorrentes,
 * então uma rajada simultânea não fura o teto (só contar antes de gravar
 * deixaria as 30 requisições lerem "zero usados" ao mesmo tempo).
 *
 * Quem estourar o limite tem a própria marca devolvida na hora — tentativa
 * barrada não pode encher a janela, senão quem tomou 429 nunca destrava.
 */
export async function consumirLimite(
  chave: string,
  limiteMax: number,
  janelaMs: number
): Promise<ResultadoLimite> {
  const agora = Date.now();
  const corte = agora - janelaMs;
  const marca = `${agora}-${Math.random().toString(36).slice(2, 8)}`;

  if (!usandoRedis) {
    const marcas = (mem.limites.get(chave) ?? []).filter((m) => m.quando > corte);
    marcas.push({ quando: agora, marca });
    mem.limites.set(chave, marcas);
    const posicao = ordenar(marcas).findIndex((m) => m.marca === marca);
    if (posicao >= limiteMax) {
      mem.limites.set(
        chave,
        marcas.filter((m) => m.marca !== marca)
      );
      return { permitido: false, usados: posicao, limite: limiteMax, marca: null };
    }
    return { permitido: true, usados: posicao + 1, limite: limiteMax, marca };
  }

  await redis("ZREMRANGEBYSCORE", K.limite(chave), "-inf", corte);
  await redis("ZADD", K.limite(chave), agora, marca);
  await redis("EXPIRE", K.limite(chave), Math.ceil(janelaMs / 1000) + 1);

  /* Decide pela MINHA POSIÇÃO na fila, não pelo total.
     Contar o total não funciona sob rajada: as 30 requisições gravam antes de
     qualquer uma contar, e todas leem "30" — ou todas passam, ou todas caem.
     A posição (ZRANK) só enxerga quem entrou antes de mim, então a rajada se
     ordena sozinha e exatamente `limiteMax` passam. */
  const posicao = await redis<number | null>("ZRANK", K.limite(chave), marca);
  const lugar = posicao === null ? 0 : Number(posicao);

  if (lugar >= limiteMax) {
    await redis("ZREM", K.limite(chave), marca);
    return { permitido: false, usados: lugar, limite: limiteMax, marca: null };
  }
  return { permitido: true, usados: lugar + 1, limite: limiteMax, marca };
}

/** Ordem canônica da fila: por instante e, em empate, pela marca. */
function ordenar(
  marcas: Array<{ quando: number; marca: string }>
): Array<{ quando: number; marca: string }> {
  return [...marcas].sort(
    (a, b) => a.quando - b.quando || a.marca.localeCompare(b.marca)
  );
}

/**
 * Devolve a vaga para a janela.
 *
 * Chamada em todo caminho que NÃO virou pedido (falha no Pix, limite de outra
 * dimensão). Assim só tentativa que virou pedido de verdade fica ocupando o
 * limite do comprador.
 */
export async function devolverLimite(
  chave: string,
  marca: string | null
): Promise<void> {
  if (!marca) return;

  if (!usandoRedis) {
    const marcas = (mem.limites.get(chave) ?? []).filter((m) => m.marca !== marca);
    mem.limites.set(chave, marcas);
    return;
  }
  await redis("ZREM", K.limite(chave), marca);
}

/* ------------------------------------------------------------ Formatação -- */

const largura = String(RIFA.totalCotas).length;

export const formatarNumero = (n: number): string =>
  String(n).padStart(largura, "0");
